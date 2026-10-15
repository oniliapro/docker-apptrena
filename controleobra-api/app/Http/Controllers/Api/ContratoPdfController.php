<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Arquivo;
use App\Models\ContratoModelo;
use App\Models\Empreita;
use App\Models\FvsModelo;
use App\Models\FvsPreenchimento;
use App\Models\Obra;
use App\Models\Pasta;
use App\Models\Tag;
use App\Services\AnexoNomeador;
use App\Services\GeradorMiniatura;
use App\Services\PastaRaizes;
use App\Services\PermissaoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Spatie\Browsershot\Browsershot;

/**
 * Gera o PDF do contrato de uma Empreita ou de uma Obra/proposta a partir
 * de um modelo cadastrado (28/09/2026, itens 8/9 — ver `ContratoModelo`).
 * Mesmo mecanismo dos outros PDFs (`EmpreitaPdfController` etc., ver
 * docs/GERAR-PDF.md): abre a própria tela de impressão do Angular
 * (`ContratoImprimir`, `/imprimir/contratos/{tipo}/{id}`) num Chromium
 * headless — é ELA que busca o modelo e os dados e substitui as
 * variáveis, não este controller.
 */
class ContratoPdfController extends Controller
{
    /** Espelha `TAMANHOS_PAPEL_MM` do frontend (`contrato-modelo-editor.ts`) — precisa bater exatamente, usado pra medir a altura real do cabeçalho/rodapé na largura certa da página. */
    private const TAMANHOS_PAPEL_MM = [
        'a4' => [210, 297],
        'carta' => [215.9, 279.4],
        'oficio' => [216, 330],
    ];

    public function empreita(Request $request, Empreita $empreita)
    {
        $modeloId = (string) $request->query('modelo_id', '');
        if ($modeloId === '') {
            return response()->json(['message' => 'Escolha um modelo de contrato.'], 422);
        }

        $caminho = "obras/{$empreita->obra_id}/contratos/empreita/{$empreita->id}";
        $variaveis = array_merge($this->variaveisComuns($empreita->obra, $request->user()->empresa), [
            'empreiteiro' => (string) $empreita->empreiteiro,
            'descricao_empreita' => (string) $empreita->descricao_empreita,
            'numero_empreita' => (string) $empreita->numero_empreita,
        ]);
        $pdf = $this->gerar($request, $caminho, $modeloId, $variaveis);

        $nomeArquivo = str($empreita->numero_empreita ?: $empreita->id)->slug() . '-contrato.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }

    /**
     * Geração em lote + anexo automático (30/09/2026, pedido do Lucas:
     * "gerar os contratos em massa, selecionando vários [na lista de
     * Empreitas] e clicando para gerar... eles serão anexados... com uma
     * tag predefinida no modelo do contrato"). Cada empreita gera um PDF
     * PRÓPRIO (mesmo `gerar()` usado no download avulso) e é salvo
     * direto como `Arquivo`/anexo da empreita — sem passar pelo
     * navegador, porque não existe upload de verdade aqui, o PDF nasce
     * no servidor. Roda uma de cada vez, sequencial (Browsershot não é
     * paralelizável sem mais Chromium concorrente) — pode demorar bastante
     * pra muitas empreitas de uma vez, o front avisa disso.
     */
    public function gerarEAnexarEmLote(Request $request, GeradorMiniatura $gerador, PermissaoService $permissoes)
    {
        $dados = $request->validate([
            'modelo_id' => 'required|string',
            'empreita_ids' => 'required|array|min:1',
            'empreita_ids.*' => 'required|string',
        ]);

        $modelo = ContratoModelo::findOrFail($dados['modelo_id']);
        if (!$modelo->tag_anexo_id) {
            return response()->json([
                'message' => 'Este modelo de contrato não tem uma tag de anexo configurada — '
                    . 'defina em Configurações → Modelos de documentos antes de gerar em lote.',
            ], 422);
        }
        $tag = Tag::findOrFail($modelo->tag_anexo_id);
        $user = $request->user();

        $sucesso = [];
        $falhas = [];

        foreach ($dados['empreita_ids'] as $empreitaId) {
            try {
                $empreita = Empreita::findOrFail($empreitaId);

                // Checagem manual (não middleware de rota): esta rota não
                // tem UMA obra no caminho — recebe várias empreitas, de
                // possivelmente obras diferentes — então cada uma precisa
                // da própria checagem de acesso, pulando (não derrubando o
                // lote inteiro) as que o usuário não pode ver.
                if (!$permissoes->podeObra($user, $empreita->obra_id, 'ver')) {
                    $falhas[] = ['empreita_id' => $empreitaId, 'erro' => 'Sem acesso a esta obra.'];
                    continue;
                }

                $obra = $empreita->obra;

                $caminho = "obras/{$empreita->obra_id}/contratos/empreita/{$empreita->id}";
                $variaveis = array_merge($this->variaveisComuns($obra, $request->user()->empresa), [
                    'empreiteiro' => (string) $empreita->empreiteiro,
                    'descricao_empreita' => (string) $empreita->descricao_empreita,
                    'numero_empreita' => (string) $empreita->numero_empreita,
                ]);

                $pdf = $this->gerar($request, $caminho, $dados['modelo_id'], $variaveis);
                $arquivo = $this->salvarComoAnexo($pdf, $empreita, $obra, $tag, $gerador);

                $sucesso[] = ['empreita_id' => $empreitaId, 'arquivo_id' => $arquivo->id];
            } catch (\Throwable $e) {
                $falhas[] = ['empreita_id' => $empreitaId, 'erro' => $e->getMessage()];
            }
        }

        return response()->json(['sucesso' => $sucesso, 'falhas' => $falhas]);
    }

    /** Mesma lógica de armazenamento de `AnexoController::criar()`, adaptada pra bytes gerados no servidor em vez de um upload de verdade (não tem `UploadedFile`/`Request` de formulário aqui). */
    private function salvarComoAnexo(string $pdfBytes, Empreita $empreita, Obra $obra, Tag $tag, GeradorMiniatura $gerador): Arquivo
    {
        $pasta = Pasta::firstOrCreate(
            ['obra_id' => $obra->id, 'tag_id' => $tag->id],
            ['parent_id' => PastaRaizes::compartilhada($obra)->id, 'owner_user_id' => null, 'nome' => $tag->nome],
        );

        $sequencial = Arquivo::where('tag_id', $tag->id)
            ->where('origem_tipo', 'empreita')
            ->where('origem_id', $empreita->id)
            ->count() + 1;

        $nomeGerado = AnexoNomeador::nome($tag->nome, $sequencial, $obra->obra_nome, $empreita->numero_empreita, 'pdf');

        $caminhoArquivo = "obras/{$obra->id}/{$pasta->id}/" . Str::uuid() . '.pdf';
        Storage::disk('local')->put($caminhoArquivo, $pdfBytes);

        $arquivo = Arquivo::create([
            'pasta_id' => $pasta->id,
            'nome_original' => $nomeGerado,
            'caminho' => $caminhoArquivo,
            'extensao' => 'pdf',
            'mime' => 'application/pdf',
            'tamanho_bytes' => strlen($pdfBytes),
            'categoria' => 'pdf',
            'enviado_por_user_id' => auth()->id(),
            'tag_id' => $tag->id,
            'origem_tipo' => 'empreita',
            'origem_id' => $empreita->id,
        ]);

        $gerador->gerar($arquivo);

        return $arquivo->fresh();
    }

    public function obra(Request $request, Obra $obra)
    {
        $modeloId = (string) $request->query('modelo_id', '');
        if ($modeloId === '') {
            return response()->json(['message' => 'Escolha um modelo de contrato.'], 422);
        }

        $caminho = "obras/{$obra->id}/contratos/obra";
        $variaveis = array_merge($this->variaveisComuns($obra, $request->user()->empresa), [
            'responsavel' => (string) $obra->responsavel,
        ]);
        $pdf = $this->gerar($request, $caminho, $modeloId, $variaveis);

        $nomeArquivo = str($obra->obra_nome ?: $obra->id)->slug() . '-contrato.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }

    /**
     * Proposta gerada a partir da EAP (14/10/2026). Mesmo mecanismo do
     * contrato de obra — a diferença é a tabela da EAP injetada onde o
     * modelo tem `{{tabela_eap}}`, montada pela tela de impressão com os
     * dados da EAP da obra. `config` (JSON) ajusta, só nesta geração, o
     * padrão salvo no modelo: o que a tabela mostra, até qual nível e as
     * cores (ver `ContratoModeloController::regrasConfigProposta`).
     */
    public function proposta(Request $request, Obra $obra)
    {
        $modeloId = (string) $request->query('modelo_id', '');
        if ($modeloId === '') {
            return response()->json(['message' => 'Escolha um modelo de proposta.'], 422);
        }

        $config = null;
        $brutoConfig = $request->query('config');
        if (is_string($brutoConfig) && $brutoConfig !== '') {
            $decodificado = json_decode($brutoConfig, true);
            if (!is_array($decodificado)) {
                return response()->json(['message' => 'Configuração da proposta inválida.'], 422);
            }

            $config = validator(
                ['config' => $decodificado],
                ContratoModeloController::regrasConfigProposta('config'),
            )->validate()['config'] ?? null;
        }

        $caminho = "obras/{$obra->id}/contratos/proposta";
        $variaveis = array_merge($this->variaveisComuns($obra, $request->user()->empresa), [
            'responsavel' => (string) $obra->responsavel,
        ]);
        $pdf = $this->gerar(
            $request,
            $caminho,
            $modeloId,
            $variaveis,
            $config !== null ? ['config' => json_encode($config, JSON_UNESCAPED_UNICODE)] : [],
        );

        $nomeArquivo = str($obra->obra_nome ?: $obra->id)->slug() . '-proposta.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }

    /**
     * Ficha de Verificação de Serviço como documento (15/10/2026). Mesmo
     * mecanismo do contrato/proposta: a tela de impressão do Angular busca a
     * ficha e o modelo e monta o corpo; aqui só se escolhe o modelo e se
     * preparam as variáveis do cabeçalho/rodapé.
     *
     * Qual modelo de documento: o da URL (`modelo_id`), senão o que o
     * checklist da ficha aponta (`fvs_modelos.contrato_modelo_id`), senão o
     * primeiro modelo `fvs` ativo.
     */
    public function fvs(Request $request, FvsPreenchimento $fvsPreenchimento)
    {
        $modeloId = (string) $request->query('modelo_id', '');

        if ($modeloId === '' || !ContratoModelo::where('id', $modeloId)->where('tipo', 'fvs')->exists()) {
            $checklist = $fvsPreenchimento->fvs_modelo_id ? FvsModelo::find($fvsPreenchimento->fvs_modelo_id) : null;
            $modeloId = (string) ($checklist?->contrato_modelo_id ?? '');

            if ($modeloId === '' || !ContratoModelo::where('id', $modeloId)->where('tipo', 'fvs')->exists()) {
                $modeloId = (string) ContratoModelo::where('tipo', 'fvs')->where('ativo', true)->orderBy('nome')->value('id');
            }
        }

        if ($modeloId === '') {
            return response()->json([
                'message' => 'Nenhum modelo de documento do tipo "Ficha de verificação de serviço" foi criado. '
                    . 'Crie um em Configurações → Modelos de documentos.',
            ], 422);
        }

        $obra = Obra::findOrFail($fvsPreenchimento->obra_id);
        $fvsPreenchimento->loadMissing(['itens', 'eapItem:id,codigo_eap,descricao', 'rdo:id,numero,data']);

        $itens = $fvsPreenchimento->itens;
        $resumo = collect([
            'conforme' => 'conforme',
            'nao_conforme' => 'não conforme',
            'nao_se_aplica' => 'não se aplica',
        ])->map(fn ($rotulo, $chave) => [$itens->where('resultado', $chave)->count(), $rotulo])
            ->filter(fn ($par) => $par[0] > 0)
            ->map(fn ($par) => "{$par[0]} {$par[1]}")
            ->implode(' · ');

        $servico = $fvsPreenchimento->eapItem
            ? trim($fvsPreenchimento->eapItem->codigo_eap . ' - ' . $fvsPreenchimento->eapItem->descricao, ' -')
            : '';

        $rotulosStatus = ['pendente' => 'Pendente', 'aprovada' => 'Aprovada', 'reprovada' => 'Reprovada'];

        $variaveis = array_merge($this->variaveisComuns($obra, $request->user()->empresa), [
            'responsavel' => (string) $obra->responsavel,
            'fvs_codigo' => $fvsPreenchimento->codigo,
            'fvs_numero' => sprintf('%04d', $fvsPreenchimento->numero),
            'fvs_revisao' => sprintf('%03d', $fvsPreenchimento->revisao),
            'fvs_status' => $rotulosStatus[$fvsPreenchimento->status] ?? (string) $fvsPreenchimento->status,
            'fvs_servico' => $servico,
            'fvs_checklist' => (string) $fvsPreenchimento->modelo_nome_snapshot,
            'fvs_rdo_numero' => $fvsPreenchimento->rdo ? (string) $fvsPreenchimento->rdo->numero : '',
            'fvs_rdo_data' => $fvsPreenchimento->rdo?->data ? $fvsPreenchimento->rdo->data->format('d/m/Y') : '',
            'fvs_preenchido_em' => $fvsPreenchimento->preenchido_em
                ? $fvsPreenchimento->preenchido_em->copy()->setTimezone(\App\Support\Fuso::atual())->format('d/m/Y H:i')
                : '',
            'fvs_observacao_geral' => (string) $fvsPreenchimento->observacao_geral,
            'fvs_resumo' => $resumo,
        ]);

        $caminho = "obras/{$obra->id}/contratos/fvs/{$fvsPreenchimento->id}";
        $pdf = $this->gerar($request, $caminho, $modeloId, $variaveis);

        $nomeArquivo = str($fvsPreenchimento->codigo)->slug() . '.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }

    /**
     * Dados usados nas variáveis do CABEÇALHO/RODAPÉ da folha (29/09/2026).
     * Duplica um subconjunto do que `ContratoImprimir` (frontend) já
     * substitui no CORPO do contrato — necessário porque cabeçalho/rodapé
     * não fazem parte da página renderizada: são passados direto pro
     * Browsershot via `->headerHtml()`/`->footerHtml()` (recurso do próprio
     * Puppeteer, roda fora do DOM da página), então só o backend, que já
     * tem `$obra`/`$empresa` em mãos aqui, consegue montá-los a tempo. Por
     * isso fica de fora o `valor` da empreita (soma calculada só no
     * frontend, a partir do relatório de pagamentos) — não disponível pra
     * cabeçalho/rodapé.
     */
    private function variaveisComuns(Obra $obra, \App\Models\Empresa $empresa): array
    {
        return [
            'empresa_nome' => (string) ($empresa->razao_social ?: $empresa->nome),
            'empresa_cnpj' => (string) $empresa->cnpj,
            'empresa_endereco' => (string) $empresa->endereco,
            'empresa_telefone' => (string) $empresa->telefone,
            'empresa_email' => (string) $empresa->email_contato,
            'empresa_inscricao_estadual' => (string) $empresa->inscricao_estadual,
            'obra_nome' => (string) $obra->obra_nome,
            'numero_contrato' => (string) $obra->numero_contrato,
            'local_obra' => (string) $obra->local_obra,
            'periodo' => (string) $obra->periodo,
            'prazo_meses' => $obra->prazo_meses !== null ? (string) $obra->prazo_meses : '',
            'data_base' => $obra->data_base?->format('d/m/Y') ?: '',
            'responsavel_tecnico' => (string) $obra->responsavel_tecnico,
            'crea' => (string) $obra->crea,
            'art' => (string) $obra->art,
            'cliente' => (string) $obra->cliente,
            'data' => \App\Support\Fuso::agora()->format('d/m/Y'),
        ];
    }

    /**
     * Fonte explícita do cabeçalho/rodapé — sem isso o texto saía
     * "ridiculamente pequeno" (achado pelo Lucas, 30/09/2026): o
     * `headerTemplate`/`footerTemplate` do Puppeteer roda num contexto
     * ISOLADO, sem acesso a nenhum CSS da página nem do editor (nem
     * `font-family`/`font-size` herdados) — só o padrão minúsculo do
     * próprio Chromium, a menos que o HTML em si já traga o tamanho.
     * `width:100%` também é necessário pro Puppeteer esticar o conteúdo
     * pela largura da página (comportamento documentado dele).
     *
     * 14/10/2026: toda a geometria do cabeçalho/rodapé (fonte, entrelinha
     * fixa, margens, bloco predefinido) é ESPELHADA no editor
     * (`contrato-modelo-editor.scss`: `.caixa-pagina`, `.previa-*` e
     * `.area-editavel-sincronizada`) — mexeu num número aqui, mexe lá
     * também: é essa igualdade que faz cada folha da edição terminar no
     * mesmo ponto do PDF. Entrelinha fixa (1.4) de
     * propósito: a fonte do servidor (Linux) não é a mesma do navegador do
     * usuário, mas com a altura de linha fixa a altura do cabeçalho não
     * muda com a fonte.
     */
    private const FONTE_PAGINA = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

    /** Logomarca do ComTrena no canto superior direito (mesmo padrão de `CabecalhoImpressao` dos outros PDFs) — cópia de `frontend/public/marca/`. */
    private const ARQUIVO_LOGOMARCA_COMTRENA = 'marca/comtrena-logomarca-para-fundo-claro.svg';

    /**
     * O Chromium coloca o `headerTemplate`/`footerTemplate` dentro de um
     * `#header`/`#footer` próprio, com ~20px de preenchimento (medido em
     * 14/10/2026 num PDF de teste: o cabeçalho começava 5,3mm abaixo da
     * borda e o rodapé terminava 5,3mm acima dela) — o texto do cabeçalho
     * escorregava pra dentro do corpo. Era isso que a antiga folga de 4mm
     * tentava cobrir. Zerando esse preenchimento (o `<style>` do template
     * vale pro documento inteiro do cabeçalho), a caixa vai de 0 até a
     * altura medida, exatamente — sem depender da versão do Chromium.
     *
     * Também zera a margem de parágrafo/título/lista do texto próprio
     * (`.conteudo-proprio`) — o editor faz o mesmo (`contrato-modelo-
     * editor.scss`, `.area-editavel-sincronizada`), pra caixa ter a mesma
     * altura nos dois lados.
     */
    private const ESTILO_ZERA_TEMPLATE = '<style>#header,#footer{padding:0!important;}'
        . 'html,body{margin:0!important;padding:0!important;}'
        . '.conteudo-proprio p,.conteudo-proprio h1,.conteudo-proprio h2,.conteudo-proprio h3,.conteudo-proprio h4,'
        . '.conteudo-proprio h5,.conteudo-proprio h6,.conteudo-proprio blockquote,.conteudo-proprio ul,.conteudo-proprio ol{margin:0;}'
        . '.conteudo-proprio ul,.conteudo-proprio ol{padding-left:6mm;}'
        . '.conteudo-proprio img{max-width:100%;height:auto;}</style>';

    /** Substitui `{{chave}}`/`{{pagina}}`/`{{total_paginas}}` — extraído de `prepararHtmlPagina` (30/09/2026) pra poder combinar o texto do usuário com o bloco de itens predefinidos ANTES de envolver tudo numa única `<div>` só (`construirCabecalhoPdf`). */
    private function substituirVariaveis(string $html, array $variaveis): string
    {
        $miolo = preg_replace('/\{\{\s*pagina\s*\}\}/', '<span class="pageNumber"></span>', $html);
        $miolo = preg_replace('/\{\{\s*total_paginas\s*\}\}/', '<span class="totalPages"></span>', $miolo);

        return preg_replace_callback('/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/', function (array $m) use ($variaveis) {
            return array_key_exists($m[1], $variaveis)
                ? htmlspecialchars($variaveis[$m[1]], ENT_QUOTES, 'UTF-8')
                : $m[0];
        }, $miolo);
    }

    /**
     * Caixa externa comum do cabeçalho e do rodapé: fonte/entrelinha fixas
     * e as MESMAS margens laterais do corpo (`margem_esquerda_mm`/
     * `margem_direita_mm` do modelo — era 15mm fixo até 14/10/2026, e o
     * cabeçalho não acompanhava quem mudava a margem no editor).
     */
    private function estiloCaixaPagina(ContratoModelo $modelo): string
    {
        return 'width:100%; box-sizing:border-box; margin:0; font-family:' . self::FONTE_PAGINA . '; '
            . 'font-size:9.5pt; line-height:1.4; color:#333; '
            . "padding-left:{$modelo->margem_esquerda_mm}mm; padding-right:{$modelo->margem_direita_mm}mm; "
            . '-webkit-print-color-adjust:exact; print-color-adjust:exact;';
    }

    /**
     * Cabeçalho/rodapé "vazio" de verdade (14/10/2026): o `contenteditable`
     * do editor costuma deixar um `<br>` ou `<div><br></div>` sobrando depois
     * de apagar tudo, e isso não pode virar uma linha em branco a mais no
     * PDF — é o que garante o cabeçalho MÍNIMO quando não há texto próprio
     * (pedido do Lucas). Imagem, linha e tabela contam como conteúdo mesmo
     * sem texto. Mesma regra de `temConteudoProprio` no editor.
     */
    private function htmlTemConteudo(?string $html): bool
    {
        if ($html === null || trim($html) === '') {
            return false;
        }
        if (preg_match('/<(img|hr|table)\b/i', $html)) {
            return true;
        }
        $texto = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return trim(str_replace("\u{00A0}", ' ', $texto)) !== '';
    }

    /**
     * Imagem do disco `public` (logo da empresa) EMBUTIDA em base64 —
     * 14/10/2026, bug relatado pelo Lucas ("a imagem do cabeçalho deu
     * erro"): o `headerTemplate` do Puppeteer não baixa NADA por URL (roda
     * isolado, fora da página), então a `<img src="http://nginx/storage/...">`
     * de antes saía quebrada em toda página. Embutida, não depende de rede.
     */
    private function imagemDoStorageComoDataUri(?string $caminho): ?string
    {
        if (!$caminho) {
            return null;
        }

        try {
            $disco = Storage::disk('public');
            if (!$disco->exists($caminho)) {
                return null;
            }
            $conteudo = (string) $disco->get($caminho);
        } catch (\Throwable) {
            return null;
        }

        $mime = match (strtolower(pathinfo($caminho, PATHINFO_EXTENSION))) {
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            default => null,
        };

        return $conteudo !== '' && $mime ? "data:{$mime};base64," . base64_encode($conteudo) : null;
    }

    private function logomarcaComtrenaDataUri(): ?string
    {
        $arquivo = resource_path(self::ARQUIVO_LOGOMARCA_COMTRENA);

        return is_file($arquivo) ? 'data:image/svg+xml;base64,' . base64_encode((string) file_get_contents($arquivo)) : null;
    }

    /**
     * Rodapé de verdade do PDF. `margem_rodape_mm` é a distância da borda
     * de baixo da folha até o texto (igual ao "Do rodapé" do Word); o texto
     * próprio (se houver) fica 2mm abaixo da linha tracejada do editor.
     */
    private function construirRodapePdf(ContratoModelo $modelo, array $variaveis): string
    {
        $personalizado = $this->htmlTemConteudo($modelo->rodape_html)
            ? '<div class="conteudo-proprio" style="padding-top:2mm;">'
                . $this->substituirVariaveis((string) $modelo->rodape_html, $variaveis) . '</div>'
            : '';

        return self::ESTILO_ZERA_TEMPLATE
            . '<div style="' . $this->estiloCaixaPagina($modelo) . " padding-bottom:{$modelo->margem_rodape_mm}mm;\">"
            . $personalizado . '</div>';
    }

    /**
     * Cabeçalho de verdade do PDF (30/09/2026, pedido do Lucas: "inclua os
     * itens predefinidos (logo da empresa, nome da empresa, título do
     * documento e data de geração) dentro do cabeçalho... aparecendo em
     * todas as folhas"). Antes esses itens só apareciam no CORPO da
     * página (via `<app-cabecalho-impressao>` no Angular), então só
     * existiam na 1ª página do PDF — movidos pra cá, pro
     * `headerHtml()`/`headerTemplate` de verdade do Puppeteer, repetem em
     * TODA página automaticamente, junto com o texto de cabeçalho que o
     * usuário escreveu no modelo (se houver).
     *
     * 14/10/2026 (pedido do Lucas): mesmo padrão dos outros PDFs
     * (`CabecalhoImpressao`) — "Gerado em" + logomarca do ComTrena no canto
     * direito — e cabeçalho MÍNIMO: sem texto próprio, a distância da linha
     * horizontal até o fim do cabeçalho (onde o corpo começa) é igual à
     * distância da borda da folha até o topo do cabeçalho
     * (`margem_cabecalho_mm`, as duas). Com texto próprio, ele entra entre
     * a linha e essa mesma folga.
     */
    private function construirCabecalhoPdf(ContratoModelo $modelo, array $variaveis, \App\Models\Empresa $empresa, string $subtitulo): string
    {
        $nomeEmpresa = (string) ($empresa->nome ?: $empresa->razao_social ?: 'ComTrena');
        $geradoEm = \App\Support\Fuso::agora()->format('d/m/Y H:i');

        $logoEmpresa = $this->imagemDoStorageComoDataUri($empresa->logo_path);
        $logoEmpresaHtml = $logoEmpresa
            ? '<img src="' . $logoEmpresa . '" style="display:block; max-height:12mm; max-width:40mm; object-fit:contain;" alt="">'
            : '';
        $logoComtrena = $this->logomarcaComtrenaDataUri();
        $logoComtrenaHtml = $logoComtrena
            ? '<img src="' . $logoComtrena . '" style="display:block; height:8.5mm; width:auto;" alt="ComTrena">'
            : '';

        $predefinido = '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4mm; '
            . 'border-bottom:2px solid #1b3a4b; padding-bottom:3mm;">'
            . '<div style="display:flex; align-items:center; gap:3mm; min-width:0;">' . $logoEmpresaHtml
            . '<div style="min-width:0;">'
            . '<div style="font-size:13pt; font-weight:700; color:#1b3a4b; line-height:1.2;">'
            . htmlspecialchars($nomeEmpresa, ENT_QUOTES, 'UTF-8') . '</div>'
            . '<div style="font-size:7.5pt; text-transform:uppercase; letter-spacing:0.08em; color:#666; line-height:1.2; margin-top:0.8mm;">'
            . htmlspecialchars($subtitulo, ENT_QUOTES, 'UTF-8') . '</div>'
            . '</div></div>'
            . '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.8mm; flex-shrink:0;">'
            . '<div style="font-size:7.5pt; color:#666; white-space:nowrap; line-height:1.2;">Gerado em ' . $geradoEm . '</div>'
            . $logoComtrenaHtml
            . '</div>'
            . '</div>';

        $personalizado = $this->htmlTemConteudo($modelo->cabecalho_html)
            ? '<div class="conteudo-proprio" style="padding-top:2mm;">'
                . $this->substituirVariaveis((string) $modelo->cabecalho_html, $variaveis) . '</div>'
            : '';

        return self::ESTILO_ZERA_TEMPLATE
            . '<div style="' . $this->estiloCaixaPagina($modelo)
            . " padding-top:{$modelo->margem_cabecalho_mm}mm; padding-bottom:{$modelo->margem_cabecalho_mm}mm;\">"
            . $predefinido . $personalizado . '</div>';
    }

    /**
     * Mede a altura REAL renderizada de um HTML de cabeçalho/rodapé, na
     * mesma largura da página (30/09/2026) — necessário porque agora a
     * margem superior/inferior do PDF passou a ser CALCULADA a partir do
     * conteúdo do cabeçalho/rodapé, não mais um número fixo escolhido à
     * parte (pedido do Lucas: "as bordas superiores e inferiores da
     * página devem ser calculadas com base na base e topo do cabeçalho e
     * rodapé"). O `headerTemplate`/`footerTemplate` do Puppeteer não
     * ajusta a margem sozinho pro conteúdo — precisa vir pronta ANTES de
     * gerar o PDF de verdade, por isso esta é uma chamada separada ao
     * Chromium, só pra medir, antes da chamada que gera o PDF de verdade
     * com a margem já certa.
     *
     * Três correções feitas testando o PDF de verdade (não só a medição
     * isolada) — o texto do corpo saía sobrepondo o cabeçalho mesmo com
     * uma altura "medida":
     * 1. **A causa raiz**: `Browsershot::html($html)` recebe só um
     *    FRAGMENTO (`<div>...</div>`, sem `<!DOCTYPE html>`) — o Chromium
     *    então renderiza em MODO QUIRKS (sem doctype declarado), onde
     *    `<body>` historicamente estica pra preencher a altura da janela
     *    inteira em vez de só o conteúdo. Resultado: `scrollHeight` media
     *    sempre ~igual à altura da JANELA de medição, não a altura real
     *    do cabeçalho/rodapé (confirmado testando: aumentar a janela de
     *    100px pra 2000px fez a medição pular de ~100 pra ~2000, em vez
     *    de continuar estável — prova de que não estava medindo
     *    conteúdo). Corrigido envolvendo o HTML num documento de verdade
     *    (`<!DOCTYPE html><html><body>...`) antes de medir — modo
     *    STANDARDS, onde `<body>` volta a ter altura automática baseada
     *    só no próprio conteúdo.
     * 2. Janela de medição mais alta (2000px, bem acima de qualquer
     *    cabeçalho/rodapé real) só por segurança, agora que a altura de
     *    verdade é medida certo.
     * 3. O `headerTemplate`/`footerTemplate` DE VERDADE do Puppeteer roda
     *    num mecanismo interno do Chromium diferente de uma página
     *    normal (`Page.printToPDF`, não uma navegação comum) — a altura
     *    renderizada ali pode não bater 100% com a mesma HTML medida
     *    como página normal aqui. Por segurança, somava uma folga de 4mm
     *    por cima do que foi medido.
     *
     * 14/10/2026: a folga de 4mm SAIU — o editor não somava nada parecido,
     * então cada folha do PDF tinha 4mm a menos de corpo que a da edição
     * (quebra de página fora de lugar) e o cabeçalho mínimo pedido pelo
     * Lucas (folga abaixo da linha = folga acima) ficava 4mm maior no PDF.
     * A parte de baixo do cabeçalho agora é sempre a própria folga em
     * branco (`padding-bottom` = `margem_cabecalho_mm`), então uma diferença
     * de 1px entre a medição e o `headerTemplate` cai em espaço vazio, nunca
     * em texto. O deslocamento de verdade que existia (preenchimento interno
     * do `#header`/`#footer` do Chromium) é zerado por `ESTILO_ZERA_TEMPLATE`.
     * Mede a `<div>` do cabeçalho (não o `<body>`, que agora começa com o
     * `<style>`) com `getBoundingClientRect` arredondado PRA CIMA (o
     * `scrollHeight` arredonda pra baixo) — mesma regra do editor
     * (`medirCabecalhoERodape`).
     */
    private function medirAlturaHtmlMm(string $html, float $larguraMm): ?float
    {
        $larguraPx = (int) round($larguraMm * 96 / 25.4);
        $documento = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;">' . $html . '</body></html>';

        try {
            $browsershot = Browsershot::html($documento)
                ->setChromePath((string) config('pdf.chrome_path'))
                ->noSandbox()
                ->setNodeEnv(['HOME' => '/tmp'])
                ->windowSize($larguraPx, 2000)
                ->waitUntilNetworkIdle()
                // Logos embutidas em base64 passam fácil do limite de 128KB
                // de UM argumento de linha de comando no Linux — opções por
                // arquivo em vez de argumento.
                ->writeOptionsToFile()
                ->timeout(15);

            $resultado = trim((string) $browsershot->evaluate(
                "(function () { var caixa = document.body.querySelector(':scope > div');"
                . ' return caixa ? Math.ceil(caixa.getBoundingClientRect().height) : 0; })()'
            ), "\" \n\r\t");
            $alturaPx = is_numeric($resultado) ? (float) $resultado : null;
        } catch (\Throwable) {
            $alturaPx = null;
        }

        return $alturaPx !== null && $alturaPx > 0 ? $alturaPx / 96 * 25.4 : null;
    }

    private function aplicarTamanhoPapel(Browsershot $browsershot, string $tamanho): Browsershot
    {
        return match ($tamanho) {
            'carta' => $browsershot->format('Letter'),
            // Ofício (ABNT/uso comum no Brasil): 216 x 330mm — não tem nome
            // pronto no Puppeteer, por isso as dimensões direto.
            'oficio' => $browsershot->paperSize(216, 330, 'mm'),
            default => $browsershot->format('A4'),
        };
    }

    /** `$consultaExtra`: parâmetros a mais na URL da tela de impressão (ex.: `config` da proposta). */
    private function gerar(Request $request, string $caminhoImpressao, string $modeloId, array $variaveis, array $consultaExtra = []): string
    {
        $user = $request->user();
        $modelo = ContratoModelo::findOrFail($modeloId);
        $empresa = $user->empresa;

        $tokenTemporario = $user->createToken(
            'impressao-pdf-contrato-' . $modeloId,
            ['*'],
            now()->addMinutes(2),
        );

        $baseFrontend = rtrim((string) config('pdf.frontend_url'), '/');
        $baseApi = (string) config('pdf.api_url');
        $url = "{$baseFrontend}/imprimir/{$caminhoImpressao}"
            . '?token=' . urlencode($tokenTemporario->plainTextToken)
            . '&apiUrl=' . urlencode($baseApi)
            . '&modeloId=' . urlencode($modeloId);
        foreach ($consultaExtra as $chave => $valor) {
            $url .= '&' . urlencode((string) $chave) . '=' . urlencode((string) $valor);
        }

        $subtitulo = match (true) {
            str_contains($caminhoImpressao, '/contratos/proposta') => 'Proposta comercial',
            str_contains($caminhoImpressao, '/contratos/fvs') => 'Ficha de verificação de serviço',
            str_contains($caminhoImpressao, '/contratos/obra') => 'Contrato de obra',
            default => 'Contrato de empreitada',
        };

        try {
            // 30/09/2026: cabeçalho e rodapé passaram a ser medidos de
            // verdade ANTES de gerar o PDF — as margens superior/inferior
            // da página não são mais um número escolhido à parte, são
            // CALCULADAS a partir da altura real de cada um (pedido do
            // Lucas: "as bordas superiores e inferiores da página devem
            // ser calculadas com base na base e topo do cabeçalho e
            // rodapé... entender a lógica de quebra do Chromium"). O
            // Puppeteer não ajusta `margin.top`/`margin.bottom` sozinho
            // pro tamanho do `headerTemplate`/`footerTemplate` — ele só
            // RESERVA o espaço que a gente manda, então sem medir antes o
            // conteúdo do cabeçalho cortaria (ou sobraria espaço demais)
            // sempre que o texto/logo não batesse com o valor fixo de
            // antes. Mede na LARGURA real da página (afeta quebra de
            // linha do texto do cabeçalho/rodapé do usuário).
            [$larguraBase, $alturaBase] = self::TAMANHOS_PAPEL_MM[$modelo->tamanho_papel] ?? self::TAMANHOS_PAPEL_MM['a4'];
            $larguraMm = $modelo->orientacao === 'paisagem' ? $alturaBase : $larguraBase;

            $htmlCabecalho = $this->construirCabecalhoPdf($modelo, $variaveis, $empresa, $subtitulo);
            $htmlRodape = $this->construirRodapePdf($modelo, $variaveis);

            // Sem conseguir medir (erro/timeout), cai pra uma altura
            // conservadora — melhor um cabeçalho com mais respiro do que
            // arriscar o corpo invadir o texto dele.
            $margemSuperiorFinal = $this->medirAlturaHtmlMm($htmlCabecalho, $larguraMm)
                ?? (2 * $modelo->margem_cabecalho_mm + 24.0);
            // Rodapé sem texto próprio = só a folga; arredondada pra cima em
            // px inteiro, igual à medição (e ao editor).
            $margemInferiorFinal = $this->htmlTemConteudo($modelo->rodape_html)
                ? ($this->medirAlturaHtmlMm($htmlRodape, $larguraMm) ?? ($modelo->margem_rodape_mm + 14.0))
                : ceil($modelo->margem_rodape_mm * 96 / 25.4) / 96 * 25.4;

            $browsershot = Browsershot::url($url)
                ->setChromePath((string) config('pdf.chrome_path'))
                ->noSandbox()
                ->setNodeEnv(['HOME' => '/tmp'])
                ->waitUntilNetworkIdle()
                ->writeOptionsToFile()
                ->margins($margemSuperiorFinal, $modelo->margem_direita_mm, $margemInferiorFinal, $modelo->margem_esquerda_mm)
                ->landscape($modelo->orientacao === 'paisagem')
                ->showBackground()
                ->timeout(30);

            $this->aplicarTamanhoPapel($browsershot, $modelo->tamanho_papel);

            // Sempre (não só quando o usuário escreveu cabeçalho/rodapé
            // próprio) — os itens predefinidos (logo, nome, data) agora
            // moram DENTRO do cabeçalho de verdade do Puppeteer, então
            // precisam do header/footer ligados mesmo em modelo sem texto
            // de cabeçalho/rodapé próprio.
            $browsershot->showBrowserHeaderAndFooter()
                ->headerHtml($htmlCabecalho)
                ->footerHtml($htmlRodape);

            return $browsershot->pdf();
        } finally {
            $tokenTemporario->accessToken->delete();
        }
    }
}
