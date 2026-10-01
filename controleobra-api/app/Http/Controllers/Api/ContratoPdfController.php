<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Arquivo;
use App\Models\ContratoModelo;
use App\Models\Empreita;
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
                    . 'defina em Configurações → Modelos de contrato antes de gerar em lote.',
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
            'data' => now()->format('d/m/Y'),
        ];
    }

    /**
     * Substitui `{{chave}}` (valores escapados) e `{{pagina}}`/
     * `{{total_paginas}}` (numeração real do Puppeteer), e envolve o
     * resultado num `<div>` com fonte explícita — sem isso o texto saía
     * "ridiculamente pequeno" (achado pelo Lucas, 30/09/2026): o
     * `headerTemplate`/`footerTemplate` do Puppeteer roda num contexto
     * ISOLADO, sem acesso a nenhum CSS da página nem do editor (nem
     * `font-family`/`font-size` herdados) — só o padrão minúsculo do
     * próprio Chromium, a menos que o HTML em si já traga o tamanho.
     * `width:100%` também é necessário pro Puppeteer esticar o conteúdo
     * pela largura da página (comportamento documentado dele).
     */
    private const FONTE_PAGINA = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

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
     * `$distanciaMm`: `margem_cabecalho_mm`/`margem_rodape_mm` — distância
     * da borda da folha até o texto (igual ao "Do topo"/"Do rodapé" do
     * Word). Usado só pro RODAPÉ agora — o cabeçalho passou a ser montado
     * por `construirCabecalhoPdf()` (30/09/2026), que já embute o próprio
     * preenchimento junto com os itens predefinidos.
     */
    private function prepararHtmlPagina(?string $html, array $variaveis, string $posicao, int $distanciaMm): string
    {
        $miolo = $this->substituirVariaveis($html ?: '', $variaveis);
        $preenchimento = $posicao === 'cabecalho' ? "padding-top:{$distanciaMm}mm;" : "padding-bottom:{$distanciaMm}mm;";

        return '<div style="width:100%; font-family:' . self::FONTE_PAGINA . "; font-size:9.5pt; color:#333; padding-left:15mm; padding-right:15mm; {$preenchimento} box-sizing:border-box;\">"
            . $miolo . '</div>';
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
     */
    private function construirCabecalhoPdf(ContratoModelo $modelo, array $variaveis, \App\Models\Empresa $empresa, string $subtitulo): string
    {
        $baseStorage = rtrim((string) preg_replace('#/api/?$#', '', (string) config('pdf.api_url')), '/');
        $logoUrl = $empresa->logo_url ? $baseStorage . $empresa->logo_url : null;
        $nomeEmpresa = (string) ($empresa->razao_social ?: $empresa->nome ?: 'ComTrena');
        $geradoEm = now()->format('d/m/Y H:i');

        $logoHtml = $logoUrl
            ? '<img src="' . htmlspecialchars($logoUrl, ENT_QUOTES, 'UTF-8')
                . '" style="display:block; max-height:12mm; max-width:40mm; object-fit:contain;" alt="Logo">'
            : '';

        $predefinido = '<div style="display:flex; justify-content:space-between; align-items:center; '
            . 'border-bottom:2px solid #1b3a4b; padding-bottom:3mm; margin-bottom:3mm;">'
            . '<div style="display:flex; align-items:center; gap:3mm;">' . $logoHtml
            . '<div><div style="font-size:13pt; font-weight:700; color:#1b3a4b; line-height:1.2;">'
            . htmlspecialchars($nomeEmpresa, ENT_QUOTES, 'UTF-8') . '</div>'
            . '<div style="font-size:7.5pt; text-transform:uppercase; letter-spacing:0.08em; color:#666; margin-top:2px;">'
            . htmlspecialchars($subtitulo, ENT_QUOTES, 'UTF-8') . '</div></div></div>'
            . '<div style="font-size:7.5pt; color:#666; white-space:nowrap;">Gerado em ' . $geradoEm . '</div>'
            . '</div>';

        $personalizado = $modelo->cabecalho_html ? $this->substituirVariaveis($modelo->cabecalho_html, $variaveis) : '';

        return '<div style="width:100%; font-family:' . self::FONTE_PAGINA
            . "; font-size:9.5pt; color:#333; padding-left:15mm; padding-right:15mm; padding-top:{$modelo->margem_cabecalho_mm}mm; box-sizing:border-box;\">"
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
     * Chromium, só pra medir (`document.body.scrollHeight`), antes da
     * chamada que gera o PDF de verdade com a margem já certa.
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
     *    como página normal aqui. Por segurança, soma uma folga
     *    (`FOLGA_MEDICAO_MM`) por cima do que foi medido — melhor sobrar
     *    um pouco de espaço em branco do que arriscar o corpo invadir o
     *    cabeçalho de novo.
     */
    private const FOLGA_MEDICAO_MM = 4.0;

    private function medirAlturaHtmlMm(string $html, float $larguraMm): float
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
                ->timeout(15);

            $resultado = trim((string) $browsershot->evaluate('document.body.scrollHeight'), "\" \n\r\t");
            $alturaPx = is_numeric($resultado) ? (float) $resultado : null;
        } catch (\Throwable) {
            $alturaPx = null;
        }

        // Sem conseguir medir (erro/timeout), cai pra uma altura conservadora
        // — melhor um cabeçalho com mais respiro do que arriscar cortar.
        $alturaMm = $alturaPx !== null ? ($alturaPx / 96 * 25.4) : 26.0;

        return $alturaMm + self::FOLGA_MEDICAO_MM;
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

    private function gerar(Request $request, string $caminhoImpressao, string $modeloId, array $variaveis): string
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

        $subtitulo = str_contains($caminhoImpressao, '/contratos/obra') ? 'Contrato de obra' : 'Contrato de empreitada';

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
            $htmlRodape = $this->prepararHtmlPagina($modelo->rodape_html, $variaveis, 'rodape', $modelo->margem_rodape_mm);

            $margemSuperiorFinal = $this->medirAlturaHtmlMm($htmlCabecalho, $larguraMm);
            $margemInferiorFinal = $modelo->rodape_html
                ? $this->medirAlturaHtmlMm($htmlRodape, $larguraMm)
                : (float) $modelo->margem_rodape_mm;

            $browsershot = Browsershot::url($url)
                ->setChromePath((string) config('pdf.chrome_path'))
                ->noSandbox()
                ->setNodeEnv(['HOME' => '/tmp'])
                ->waitUntilNetworkIdle()
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
