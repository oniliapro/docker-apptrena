<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppStorageItem;
use App\Models\ContratoEquipamentoItem;
use App\Models\Diaria;
use App\Models\EapItem;
use App\Models\FvsPreenchimento;
use App\Models\FvsPreenchimentoItem;
use App\Models\FvsVinculo;
use App\Models\Obra;
use App\Models\RdoContratanteLink;
use App\Models\RdoEquipamento;
use App\Models\RdoEquipamentoCatalogo;
use App\Models\RdoEtapa;
use App\Models\RdoFoto;
use App\Models\RdoMaoDeObra;
use App\Models\RdoOcorrencia;
use App\Models\RdoPendencia;
use App\Models\RdoRegistro;
use App\Models\RdoResponsavelPresente;
use App\Models\RdoTarefa;
use App\Services\PermissaoService;
use App\Support\ValidacaoMidia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Relatório Diário de Obra (RDO) — módulo reconstruído em 17/09/2026.
 *
 * Herda do módulo anterior duas armadilhas do projeto, que continuam valendo:
 *
 *  1. A regra `exists:obras,id` do validator faz SQL direto e NÃO respeita o
 *     global scope multiempresa. Depois de validar, sempre reconfirmar a posse
 *     com Obra::find() (esse passa pelo scope). Sem isso, uma empresa gravaria
 *     RDO na obra de outra só adivinhando o UUID. O mesmo vale para qualquer
 *     id vindo do cliente que referencie tabela de outra empresa (ex.: o
 *     catálogo de equipamentos).
 *  2. Quem assina é sempre a CONTRATADA (o usuário autenticado). O contratante
 *     da obra nunca assina e nunca escreve — só lê, pelo link público.
 *
 * Edição depois de assinado É permitida (decisão da Onilia, 15/09/2026). Foi
 * registrada uma ressalva de que isso enfraquece o diário como prova jurídica,
 * mas a decisão está fechada; por isso `update()` não checa status.
 */
class RdoController extends Controller
{
    /** Relações carregadas em toda resposta de RDO. */
    private const RELACOES = [
        'obra:id,obra_nome,local_obra,cliente',
        'autorUser:id,name',
        'assinadoPor:id,name',
        'tarefas',
        'fotos',
        'maoDeObra',
        'equipamentos',
        'ocorrencias',
        'pendencias',
        'etapas',
        'responsaveisPresentes',
        'comentariosInternos',
        'fvsPreenchimentos.itens.fotos',
    ];

    public function index(Request $request, PermissaoService $permissoes)
    {
        $data = $request->validate([
            'obra_id' => 'nullable|string|exists:obras,id',
            'limite' => 'nullable|integer|min:1|max:100',
        ]);

        $query = RdoRegistro::with(self::RELACOES)
            ->orderByDesc('data')
            ->orderByDesc('numero');

        $usuario = $request->user();

        if (!empty($data['obra_id'])) {
            $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);
            if ($usuario && !$permissoes->podeObra($usuario, $obra->id, 'ver')) {
                abort(403, 'Sem acesso a esta obra.');
            }
            $query->where('obra_id', $obra->id);
        } elseif ($usuario && !$usuario->ehAdmin()) {
            $obraIdsNegados = $usuario->obraAcessos()->where('pode_ver', false)->pluck('obra_id');
            $query->whereNotIn('obra_id', $obraIdsNegados);
        }

        return $query->limit($data['limite'] ?? 30)->get();
    }

    public function show(RdoRegistro $rdo)
    {
        return $rdo->load(self::RELACOES);
    }

    /**
     * Dados que o formulário precisa ANTES de o usuário começar a preencher:
     * cabeçalho da obra, próximo número de RDO e o pré-preenchimento vindo do
     * lançamento anterior (etapas não concluídas e a mão de obra do dia
     * anterior, que na prática muda pouco de um dia para o outro).
     */
    public function preparar(Request $request)
    {
        $data = $request->validate([
            'obra_id' => 'required|string|exists:obras,id',
        ]);

        $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);
        $anterior = RdoRegistro::where('obra_id', $obra->id)
            ->orderByDesc('data')
            ->orderByDesc('numero')
            ->with(['etapas', 'maoDeObra'])
            ->first();

        return [
            'obra' => $obra->only(['id', 'obra_nome', 'local_obra', 'cliente']),
            'cabecalho' => $this->cabecalhoDaObra($obra),
            'proximo_numero' => $this->proximoNumero($obra->id),
            'etapas_sugeridas' => $anterior
                ? $anterior->etapas->where('concluida', false)->values()
                    ->map(fn ($e) => ['eap_item_id' => $e->eap_item_id, 'nome' => $e->nome, 'concluida' => false])
                : [],
            'mao_de_obra_sugerida' => $anterior
                ? $anterior->maoDeObra->map(fn ($m) => [
                    'categoria' => $m->categoria,
                    'profissional_id' => $m->profissional_id,
                    'profissional_nome' => $m->profissional_nome,
                    'funcao' => $m->funcao,
                    'quantidade' => $m->quantidade,
                ])->values()
                : [],
            'equipamentos_catalogo' => RdoEquipamentoCatalogo::orderBy('nome')->get(),
            // Equipamentos alugados (26/09/2026) — só contratos ainda não encerrados, com os
            // itens ainda com o cliente. Um RDO NOVO já nasce com uma linha por item ativo
            // (o usuário só marca se está presente ou não); só dá pra ADICIONAR manualmente
            // equipamento SEM contrato.
            'contratos_equipamentos_ativos' => \App\Models\ContratoEquipamento::where('obra_id', $obra->id)
                ->whereNull('encerrado_em')
                ->with(['itens' => fn ($q) => $q->whereNull('devolvido_em')])
                ->get()
                ->filter(fn ($c) => $c->itens->isNotEmpty())
                ->map(fn ($c) => [
                    'id' => $c->id,
                    'numero' => $c->numero,
                    'nome_contrato' => $c->nome_contrato,
                    'itens' => $c->itens->map(fn ($i) => ['id' => $i->id, 'descricao' => $i->descricao, 'quantidade' => $i->quantidade])->values(),
                ])
                ->values(),
            // Autocomplete de função pras linhas MANUAIS (sem profissional
            // vinculado): as funções que esta empresa já usou em RDOs
            // anteriores. O cadastro de Profissionais (F6, na ponte
            // chave-valor, `controleObra.empreiteiros.v1`) é a via preferida
            // desde a F9 — o frontend lê ele direto (mesmo jeito que
            // `DiariasStore` já lê), este endpoint não precisa duplicar.
            'funcoes_usadas' => RdoMaoDeObra::query()
                ->join('rdo_registros', 'rdo_registros.id', '=', 'rdo_mao_de_obra.rdo_id')
                ->where('rdo_registros.empresa_id', $request->user()->empresa_id)
                ->select('rdo_mao_de_obra.categoria', 'rdo_mao_de_obra.funcao')
                ->distinct()
                ->orderBy('rdo_mao_de_obra.funcao')
                ->get(),
        ];
    }

    public function store(Request $request)
    {
        $data = $this->validarPayload($request, true);
        $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);
        $usuario = $request->user();

        $rdo = DB::transaction(function () use ($data, $obra, $usuario, $request) {
            $rdo = RdoRegistro::create([
                'id' => $data['id'] ?? null,
                'empresa_id' => $usuario->empresa_id,
                'obra_id' => $obra->id,
                'numero' => $this->proximoNumero($obra->id),
                'data' => $data['data'],
                'clima_manha' => $data['clima_manha'] ?? null,
                'clima_tarde' => $data['clima_tarde'] ?? null,
                'clima_noite' => $data['clima_noite'] ?? null,
                // 14/10/2026: NÃO usar `?? 'praticavel'` aqui — `??` trata "null
                // explícito" igual a "chave ausente", e o frontend manda null de
                // propósito quando o turno está marcado "S/ expediente". Usar o
                // fallback apagava essa marcação sempre que salvava de novo.
                'condicao_manha' => array_key_exists('condicao_manha', $data) ? $data['condicao_manha'] : 'praticavel',
                'condicao_tarde' => array_key_exists('condicao_tarde', $data) ? $data['condicao_tarde'] : 'praticavel',
                'condicao_noite' => array_key_exists('condicao_noite', $data) ? $data['condicao_noite'] : 'praticavel',
                'impacto_cronograma' => $data['impacto_cronograma'] ?? null,
                'observacoes' => $data['observacoes'] ?? null,
                'status' => RdoRegistro::STATUS_RASCUNHO,
                'autor_user_id' => $usuario->id,
            ]);

            $this->sincronizarFilhos($rdo, $data, $usuario);
            $this->guardarFotos($rdo, $request, $data);
            $this->copiarFichasReprovadasParaNovoRdo($rdo);

            return $rdo;
        });

        return response()->json($rdo->fresh(self::RELACOES), 201);
    }

    /**
     * Regrava o RDO inteiro a partir do payload. Os filhos são substituídos
     * (apagados e recriados) porque o formulário sempre manda a lista completa
     * — é mais simples e menos sujeito a divergência do que um diff linha a
     * linha. Fotos já salvas NÃO são apagadas aqui: são removidas uma a uma
     * por `removerFoto`, para não perder arquivo por engano num salvamento.
     */
    public function update(Request $request, RdoRegistro $rdo)
    {
        $data = $this->validarPayload($request, false);
        $usuario = $request->user();

        DB::transaction(function () use ($rdo, $data, $usuario, $request) {
            $rdo->update([
                'data' => $data['data'],
                'clima_manha' => $data['clima_manha'] ?? null,
                'clima_tarde' => $data['clima_tarde'] ?? null,
                'clima_noite' => $data['clima_noite'] ?? null,
                // 14/10/2026: ver comentário em store() — `??` apagava o "S/
                // expediente" (null explícito) de volta pro padrão antigo.
                'condicao_manha' => array_key_exists('condicao_manha', $data) ? $data['condicao_manha'] : 'praticavel',
                'condicao_tarde' => array_key_exists('condicao_tarde', $data) ? $data['condicao_tarde'] : 'praticavel',
                'condicao_noite' => array_key_exists('condicao_noite', $data) ? $data['condicao_noite'] : 'praticavel',
                'impacto_cronograma' => $data['impacto_cronograma'] ?? null,
                'observacoes' => $data['observacoes'] ?? null,
            ]);

            $this->sincronizarFilhos($rdo, $data, $usuario, true);
            $this->guardarFotos($rdo, $request, $data);
        });

        return $rdo->fresh(self::RELACOES);
    }

    /**
     * Finalizar É assinar — não existe botão separado (decisão de 08/09/2026).
     * O nome e o CREA de quem assinou ficam congelados no registro: o
     * documento precisa continuar dizendo quem assinou mesmo que o cadastro
     * mude depois.
     */
    public function finalizar(Request $request, RdoRegistro $rdo)
    {
        $usuario = $request->user();

        if ($rdo->estaFinalizado()) {
            return response()->json(['mensagem' => 'Este RDO já está finalizado.'], 422);
        }

        $rdo->update([
            'status' => RdoRegistro::STATUS_FINALIZADO,
            'assinado_em' => now(),
            'assinado_por_user_id' => $usuario->id,
            'assinante_nome' => $rdo->obra->responsavel_tecnico ?: $usuario->name,
            'assinante_crea' => $rdo->obra->crea,
        ]);

        $this->gerarDiariasAutomaticas($rdo);
        $this->avisarContratante($rdo);

        return $rdo->fresh(self::RELACOES);
    }

    /**
     * F9 (24/09/2026): ao finalizar o RDO, cada linha de mão de obra COM
     * profissional vinculado vira uma diária em rascunho (aba Diárias, F7) —
     * sem etapa/vales/meia-diária: quem for fechar o pagamento completa isso
     * depois na própria aba (decisão do Lucas, 23/09/2026 — manter o
     * formulário do RDO enxuto, principalmente com equipes grandes).
     *
     * O valor da diária vem do cadastro de Profissionais NO MOMENTO da
     * finalização (lido direto de `app_storage`, mesma tabela que
     * `StorageController` usa — não há cadastro relacional, ver
     * `Empreiteiro`/"Profissionais"). Idempotente: reabrir e finalizar de
     * novo o mesmo RDO não duplica a diária de um profissional que já tem
     * uma gerada por ele nesta data.
     */
    private function gerarDiariasAutomaticas(RdoRegistro $rdo): void
    {
        $linhas = $rdo->maoDeObra()->whereNotNull('profissional_id')->get();
        if ($linhas->isEmpty()) {
            return;
        }

        $bruto = AppStorageItem::where('empresa_id', $rdo->empresa_id)
            ->where('key_name', 'controleObra.empreiteiros.v1')
            ->value('value');
        $profissionais = collect(json_decode($bruto ?? '[]', true) ?: [])->keyBy('id');

        foreach ($linhas as $linha) {
            $jaExiste = Diaria::where('empresa_id', $rdo->empresa_id)
                ->where('profissional_id', $linha->profissional_id)
                ->where('data', $rdo->data)
                ->where('origem', 'rdo')
                ->exists();
            if ($jaExiste) {
                continue;
            }

            $profissional = $profissionais->get($linha->profissional_id);

            Diaria::create([
                'empresa_id' => $rdo->empresa_id,
                'obra_id' => $rdo->obra_id,
                'profissional_id' => $linha->profissional_id,
                'profissional_nome' => $linha->profissional_nome ?: ($profissional['nome'] ?? $linha->funcao),
                'profissional_funcao' => $linha->funcao,
                'data' => $rdo->data,
                'meia_diaria' => false,
                'valor_diaria_base' => (float) ($profissional['valorDiaria'] ?? 0),
                'vale_transporte' => 0,
                'vale_alimentacao' => 0,
                'combustivel' => 0,
                'valor_extra' => 0,
                'observacoes' => "Gerada automaticamente ao finalizar o RDO nº {$rdo->numero}.",
                'status' => 'rascunho',
                'origem' => 'rdo',
            ]);
        }
    }

    public function destroy(RdoRegistro $rdo)
    {
        $rdo->load('fotos');

        foreach ($rdo->fotos as $foto) {
            Storage::disk('public')->delete($foto->caminho);
        }

        $rdo->delete();

        return response()->noContent();
    }

    public function removerFoto(RdoRegistro $rdo, string $fotoId)
    {
        $foto = RdoFoto::where('rdo_id', $rdo->id)->findOrFail($fotoId);

        Storage::disk('public')->delete($foto->caminho);
        $foto->delete();

        return response()->noContent();
    }

    // ------------------------------------------------------------------
    // Internos
    // ------------------------------------------------------------------

    /**
     * Confirma que a obra pertence à empresa do usuário. Obra::find() passa
     * pelo global scope multiempresa; `exists:obras,id` do validator não.
     */
    private function obraDaEmpresaOuAborta(string $obraId): Obra
    {
        $obra = Obra::find($obraId);

        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }

        return $obra;
    }

    /**
     * Cabeçalho técnico do RDO, montado a partir da própria obra — não mais
     * digitado dentro do RDO (26/09/2026, pedido do Lucas: "o cabeçalho do
     * diário tem que ser preenchido automaticamente de acordo com os dados
     * da obra e não pode ser editado"). `RdoObraDados`/`rdo_obra_dados`
     * ficou sem uso a partir de agora — tabela não apagada, só parada, mesmo
     * padrão já usado para o Diário antigo e "Responsáveis presentes".
     * `numero_contrato`/`responsavel_tecnico`/`crea`/`art` são campos novos
     * de `obras`; início/prazo/contratante reaproveitam `data_base`,
     * `periodo` e `cliente`, que a obra já tinha.
     */
    private function cabecalhoDaObra(Obra $obra): array
    {
        return [
            'numero_contrato' => $obra->numero_contrato,
            'responsavel_tecnico' => $obra->responsavel_tecnico,
            'crea' => $obra->crea,
            'art' => $obra->art,
            'data_inicio' => $obra->data_base,
            'prazo' => $obra->periodo,
            'contratante_nome' => $obra->cliente,
        ];
    }

    /** Sequencial por obra — é o "Nº" impresso no documento. */
    private function proximoNumero(string $obraId): int
    {
        $maior = RdoRegistro::where('obra_id', $obraId)->max('numero');

        return (int) $maior + 1;
    }

    /**
     * F10 — pedido do Lucas (23/09/2026): a ficha nasce PENDENTE assim que a
     * etapa (ligada a um item com FVS vinculada) entra no RDO do dia, sem
     * precisar de nenhuma ação extra do usuário. Idempotente por natureza
     * (`firstOrCreate`): salvar o mesmo RDO de novo com a mesma etapa não
     * duplica a ficha. Opcional — não preencher nada não impede finalizar.
     */
    private function gerarFichasFvsPendentes(RdoRegistro $rdo, string $eapItemId): void
    {
        $vinculos = \App\Models\FvsVinculo::where('eap_item_id', $eapItemId)->with('modelo')->get();

        foreach ($vinculos as $vinculo) {
            $modelo = $vinculo->modelo;
            if (!$modelo) {
                continue;
            }

            $existe = \App\Models\FvsPreenchimento::where('rdo_id', $rdo->id)
                ->where('eap_item_id', $eapItemId)
                ->where('fvs_modelo_id', $modelo->id)
                ->exists();
            if ($existe) {
                continue;
            }

            $preenchimento = \App\Models\FvsPreenchimento::create([
                'empresa_id' => $rdo->empresa_id,
                'obra_id' => $rdo->obra_id,
                'eap_item_id' => $eapItemId,
                'fvs_modelo_id' => $modelo->id,
                'modelo_nome_snapshot' => $modelo->nome,
                'rdo_id' => $rdo->id,
                'numero' => $this->proximoNumeroFvs($rdo->obra_id),
                'revisao' => 0,
                'status' => 'pendente',
            ]);

            foreach ($modelo->itens as $ordem => $item) {
                \App\Models\FvsPreenchimentoItem::create([
                    'fvs_preenchimento_id' => $preenchimento->id,
                    'ordem' => $ordem,
                    'descricao' => $item['descricao'],
                ]);
            }
        }
    }

    private function proximoNumeroFvs(string $obraId): int
    {
        $maior = \App\Models\FvsPreenchimento::where('obra_id', $obraId)->max('numero');

        return (int) $maior + 1;
    }

    /**
     * F10 — "reprovada gera... no PRÓXIMO RDO da obra, uma cópia completa em
     * branco da mesma verificação, sem perder a anterior": roda só ao CRIAR
     * um RDO (não em update — senão duplicaria a cada salvamento). Cobre
     * qualquer ficha reprovada da obra que ainda não tenha uma revisão
     * seguinte, não só a do RDO imediatamente anterior — se pularem RDOs sem
     * corrigir, a cópia continua sendo oferecida.
     */
    private function copiarFichasReprovadasParaNovoRdo(RdoRegistro $rdo): void
    {
        $reprovadas = \App\Models\FvsPreenchimento::where('obra_id', $rdo->obra_id)
            ->where('status', 'reprovada')
            ->whereDoesntHave('origemDe')
            ->with('itens')
            ->get();

        foreach ($reprovadas as $origem) {
            $copia = \App\Models\FvsPreenchimento::create([
                'empresa_id' => $rdo->empresa_id,
                'obra_id' => $rdo->obra_id,
                'eap_item_id' => $origem->eap_item_id,
                'fvs_modelo_id' => $origem->fvs_modelo_id,
                'modelo_nome_snapshot' => $origem->modelo_nome_snapshot,
                'rdo_id' => $rdo->id,
                'numero' => $origem->numero,
                'revisao' => $origem->revisao + 1,
                'status' => 'pendente',
                'origem_preenchimento_id' => $origem->id,
            ]);

            foreach ($origem->itens as $item) {
                \App\Models\FvsPreenchimentoItem::create([
                    'fvs_preenchimento_id' => $copia->id,
                    'ordem' => $item->ordem,
                    'descricao' => $item->descricao,
                ]);
            }
        }
    }

    private function validarPayload(Request $request, bool $criando): array
    {
        $regras = [
            'id' => 'nullable|string|max:36',
            'data' => 'required|date',
            'clima_manha' => 'nullable|string|in:'.implode(',', RdoRegistro::CLIMAS),
            'clima_tarde' => 'nullable|string|in:'.implode(',', RdoRegistro::CLIMAS),
            'clima_noite' => 'nullable|string|in:'.implode(',', RdoRegistro::CLIMAS),
            // "Impraticável" saiu do clima e virou uma condição de trabalho à parte, por turno (26/09/2026).
            'condicao_manha' => 'nullable|string|in:'.implode(',', RdoRegistro::CONDICOES_TRABALHO),
            'condicao_tarde' => 'nullable|string|in:'.implode(',', RdoRegistro::CONDICOES_TRABALHO),
            'condicao_noite' => 'nullable|string|in:'.implode(',', RdoRegistro::CONDICOES_TRABALHO),
            'impacto_cronograma' => 'nullable|string',
            'observacoes' => 'nullable|string',

            'tarefas' => 'nullable|array|max:50',
            'tarefas.*.id' => 'nullable|string|max:36',
            'tarefas.*.descricao' => 'required|string',
            // Observação própria da tarefa (26/09/2026) — nota distinta da "Descrição do serviço".
            'tarefas.*.observacoes' => 'nullable|string',

            // profissional_id/profissional_nome (F9): linha "de verdade",
            // vinculada ao cadastro de Profissionais — só ela gera diária
            // automática ao finalizar. Sem os dois = linha manual (ex.:
            // "Ajudante avulso", quantidade > 1), continua valendo.
            'mao_de_obra' => 'nullable|array|max:100',
            'mao_de_obra.*.categoria' => 'required|string|in:interno,externo',
            'mao_de_obra.*.profissional_id' => 'nullable|string|max:36',
            'mao_de_obra.*.profissional_nome' => 'nullable|string|max:150',
            'mao_de_obra.*.funcao' => 'required|string|max:120',
            'mao_de_obra.*.quantidade' => 'required|integer|min:0',

            // categoria/contrato_equipamento_item_id (26/09/2026): "Equipamentos" virou
            // duas colunas — próprios (igual sempre foi) e alugados (linkados a um
            // contrato ativo do módulo de Contratos de equipamentos).
            'equipamentos' => 'nullable|array|max:100',
            'equipamentos.*.categoria' => 'nullable|string|in:proprio,alugado',
            'equipamentos.*.equipamento_id' => 'nullable|string|max:36',
            'equipamentos.*.contrato_equipamento_item_id' => 'nullable|string|max:36',
            'equipamentos.*.contrato_referencia' => 'nullable|string|max:150',
            'equipamentos.*.presente' => 'nullable|boolean',
            'equipamentos.*.descricao' => 'required|string|max:150',
            'equipamentos.*.quantidade' => 'required|integer|min:0',

            // tarefa_id (26/09/2026): uma tarefa pode gerar várias ocorrências —
            // deixaram de ser uma seção solta e passaram a nascer dentro dela.
            'ocorrencias' => 'nullable|array|max:100',
            'ocorrencias.*.tarefa_id' => 'nullable|string|max:36',
            'ocorrencias.*.tipo' => 'nullable|string|max:40',
            'ocorrencias.*.descricao' => 'required|string',
            'ocorrencias.*.responsavel' => 'nullable|string|max:150',
            'ocorrencias.*.motivo' => 'nullable|string',
            'ocorrencias.*.danos_materiais' => 'nullable|string',

            // tarefa_id (26/09/2026): idem — uma tarefa pode gerar mais de uma pendência.
            'pendencias' => 'nullable|array|max:100',
            'pendencias.*.tarefa_id' => 'nullable|string|max:36',
            'pendencias.*.descricao' => 'required|string',
            'pendencias.*.responsavel' => 'nullable|string|max:150',
            'pendencias.*.prazo' => 'nullable|date',
            'pendencias.*.status' => 'nullable|string|in:aberta,concluida',

            // "Nome da etapa" virou "Descrição do serviço" e mora dentro de cada tarefa
            // (26/09/2026, pedido do Lucas) — sem max:150, mesmo motivo de `tarefas.*.descricao`.
            'etapas' => 'nullable|array|max:50',
            'etapas.*.eap_item_id' => 'nullable|string|max:36',
            'etapas.*.nome' => 'required|string',
            'etapas.*.concluida' => 'nullable|boolean',

            // "Responsáveis presentes" foi removido da tela (26/09/2026, pedido do Lucas) — a
            // regra fica só pra não quebrar quem eventualmente ainda mandar o campo.
            'responsaveis' => 'nullable|array|max:50',
            'responsaveis.*.nome' => 'required|string|max:150',
            'responsaveis.*.empresa' => 'nullable|string|max:150',
            'responsaveis.*.funcao' => 'nullable|string|max:120',
            'responsaveis.*.contrato_referencia' => 'nullable|string|max:150',

            // "Observações internas" (comentários) foi removida da tela (26/09/2026, pedido do
            // Lucas — virou observação por tarefa + observações gerais do dia). Tabela
            // `rdo_comentarios_internos` não apagada, só parou de receber dados novos.

            // Fotos: arquivo + metadados posicionais (índice 0 = fotos[0]).
            // 30/09/2026: regra centralizada em `ValidacaoMidia::IMAGEM` —
            // ver o comentário lá (era `image|max:8192`, rejeitava foto de
            // celular grande/HEIC sem erro nenhum na tela).
            'fotos.*' => ValidacaoMidia::IMAGEM,
            'fotos_meta' => 'nullable|array',
            'fotos_meta.*.tarefa_id' => 'nullable|string|max:36',
            'fotos_meta.*.legenda' => 'nullable|string|max:200',
            'fotos_meta.*.x' => 'nullable|numeric|min:0|max:1',
            'fotos_meta.*.y' => 'nullable|numeric|min:0|max:1',
            'fotos_meta.*.nota' => 'nullable|string|max:200',

            // Vídeo (F8, 22/09/2026, "D1" do plano) — junto das fotos na mesma
            // galeria; sem croqui (não faz sentido marcar ponto num vídeo).
            // 100 MB por arquivo, cabe no limite do servidor (110 MB).
            'videos' => 'nullable|array|max:5',
            'videos.*' => ValidacaoMidia::VIDEO,
            'videos_meta' => 'nullable|array',
            'videos_meta.*.tarefa_id' => 'nullable|string|max:36',
            'videos_meta.*.legenda' => 'nullable|string|max:200',
        ];

        if ($criando) {
            $regras['obra_id'] = 'required|string|exists:obras,id';
        }

        return $request->validate($regras);
    }

    private function sincronizarFilhos(RdoRegistro $rdo, array $data, $usuario, bool $substituindo = false): void
    {
        if ($substituindo) {
            // As tarefas são apagadas por último entre as que têm dependente:
            // `rdo_fotos.tarefa_id` é nullOnDelete, então uma foto de tarefa
            // apagada vira foto do dia em vez de sumir junto.
            RdoMaoDeObra::where('rdo_id', $rdo->id)->delete();
            RdoEquipamento::where('rdo_id', $rdo->id)->delete();
            RdoOcorrencia::where('rdo_id', $rdo->id)->delete();
            RdoPendencia::where('rdo_id', $rdo->id)->delete();
            RdoEtapa::where('rdo_id', $rdo->id)->delete();
            RdoResponsavelPresente::where('rdo_id', $rdo->id)->delete();
            // "Observações internas" (comentários) aposentada em 26/09/2026 — não apaga
            // mais o que já existia, só parou de gravar (ver validarPayload/o fim deste método).

            $idsMantidos = collect($data['tarefas'] ?? [])->pluck('id')->filter()->all();
            RdoTarefa::where('rdo_id', $rdo->id)->whereNotIn('id', $idsMantidos)->delete();
        }

        foreach ($data['tarefas'] ?? [] as $ordem => $item) {
            RdoTarefa::updateOrCreate(
                ['id' => $item['id'] ?? (string) \Illuminate\Support\Str::uuid()],
                ['rdo_id' => $rdo->id, 'ordem' => $ordem + 1, 'descricao' => $item['descricao'], 'observacoes' => $item['observacoes'] ?? null]
            );
        }

        foreach ($data['mao_de_obra'] ?? [] as $ordem => $item) {
            RdoMaoDeObra::create([
                'rdo_id' => $rdo->id,
                'categoria' => $item['categoria'],
                'profissional_id' => $item['profissional_id'] ?? null,
                'profissional_nome' => $item['profissional_nome'] ?? null,
                'funcao' => $item['funcao'],
                'quantidade' => $item['quantidade'],
                'ordem' => $ordem,
            ]);
        }

        foreach ($data['equipamentos'] ?? [] as $ordem => $item) {
            $categoria = $item['categoria'] ?? 'proprio';

            // Mesmo cuidado do obra_id: o catálogo é por empresa e o id vem do
            // cliente, então confirmamos pelo model (que passa pelo scope).
            // Só se aplica a "próprio" — "alugado" vincula a um item de
            // contrato, não ao catálogo.
            $catalogoId = null;
            if ($categoria === 'proprio' && !empty($item['equipamento_id'])) {
                $catalogoId = RdoEquipamentoCatalogo::find($item['equipamento_id'])?->id;
            }

            // Equipamento PRÓPRIO digitado à mão entra no catálogo da empresa,
            // para aparecer sugerido no próximo RDO. Sem isto o catálogo nunca
            // era alimentado por ninguém (não existe tela de cadastro dele) e a
            // sugestão vinha sempre vazia — verificado em 18/09/2026.
            // `firstOrCreate` pelo nome evita duplicar a cada lançamento; a
            // comparação usa o collation da coluna, que não diferencia caixa.
            if ($categoria === 'proprio' && !$catalogoId && $usuario?->empresa_id) {
                $catalogoId = RdoEquipamentoCatalogo::firstOrCreate(
                    ['empresa_id' => $usuario->empresa_id, 'nome' => trim($item['descricao'])],
                )->id;
            }

            // Item de contrato vem do cliente — confirma que é mesmo um item
            // ATIVO (ainda não devolvido) de um contrato DESTA obra, senão
            // daria pra "adivinhar" o item de outra obra/empresa só pelo UUID.
            // Vinculado, fornecedor/contrato são um SNAPSHOT tirado do contrato
            // agora (não o que o cliente mandou); manual, é o texto digitado.
            $contratoItem = null;
            if ($categoria === 'alugado' && !empty($item['contrato_equipamento_item_id'])) {
                $contratoItem = ContratoEquipamentoItem::whereNull('devolvido_em')
                    ->whereHas('contrato', fn ($q) => $q->where('obra_id', $rdo->obra_id))
                    ->where('id', $item['contrato_equipamento_item_id'])
                    ->with('contrato')
                    ->first();
            }

            RdoEquipamento::create([
                'rdo_id' => $rdo->id,
                'categoria' => $categoria,
                'equipamento_id' => $catalogoId,
                'contrato_equipamento_item_id' => $contratoItem?->id,
                'contrato_referencia' => $contratoItem
                    ? "Nº {$contratoItem->contrato->numero} — {$contratoItem->contrato->nome_contrato}"
                    : ($item['contrato_referencia'] ?? null),
                'presente' => (bool) ($item['presente'] ?? true),
                'descricao' => $item['descricao'],
                'quantidade' => $item['quantidade'],
                'ordem' => $ordem,
            ]);
        }

        // Tarefas já foram gravadas no laço acima (nesta mesma chamada), então dá
        // pra confirmar aqui que o tarefa_id recebido é mesmo de uma tarefa DESTE
        // RDO — mesmo cuidado do eap_item_id/equipamento: o id vem do cliente.
        $idsDeTarefa = RdoTarefa::where('rdo_id', $rdo->id)->pluck('id')->all();
        $tarefaValida = fn (?string $tarefaId) => $tarefaId && in_array($tarefaId, $idsDeTarefa, true) ? $tarefaId : null;

        foreach ($data['ocorrencias'] ?? [] as $ordem => $item) {
            RdoOcorrencia::create([
                'rdo_id' => $rdo->id,
                'tarefa_id' => $tarefaValida($item['tarefa_id'] ?? null),
                'ordem' => $ordem + 1,
                'tipo' => $item['tipo'] ?? 'outra',
                'descricao' => $item['descricao'],
                'responsavel' => $item['responsavel'] ?? null,
                'motivo' => $item['motivo'] ?? null,
                'danos_materiais' => $item['danos_materiais'] ?? null,
            ]);
        }

        foreach ($data['pendencias'] ?? [] as $ordem => $item) {
            RdoPendencia::create([
                'rdo_id' => $rdo->id,
                'tarefa_id' => $tarefaValida($item['tarefa_id'] ?? null),
                'descricao' => $item['descricao'],
                'responsavel' => $item['responsavel'] ?? null,
                'prazo' => $item['prazo'] ?? null,
                'status' => $item['status'] ?? 'aberta',
                'ordem' => $ordem,
            ]);
        }

        foreach ($data['etapas'] ?? [] as $ordem => $item) {
            // Mesmo cuidado do obra_id/equipamento: o item vem do cliente,
            // então confirmamos que é mesmo um item da EAP DESTA obra antes de
            // gravar o vínculo — senão daria pra "adivinhar" um id de outra
            // obra (ou de outra empresa) só digitando o UUID.
            $eapItemId = null;
            if (!empty($item['eap_item_id'])) {
                $eapItemId = EapItem::where('obra_id', $rdo->obra_id)
                    ->where('id', $item['eap_item_id'])
                    ->value('id');
            }

            RdoEtapa::create([
                'rdo_id' => $rdo->id,
                'eap_item_id' => $eapItemId,
                'nome' => $item['nome'],
                'concluida' => (bool) ($item['concluida'] ?? false),
                'ordem' => $ordem,
            ]);

            if ($eapItemId) {
                $this->gerarFichasFvsPendentes($rdo, $eapItemId);
            }
        }

        foreach ($data['responsaveis'] ?? [] as $ordem => $item) {
            RdoResponsavelPresente::create([
                'rdo_id' => $rdo->id,
                'nome' => $item['nome'],
                'empresa' => $item['empresa'] ?? null,
                'funcao' => $item['funcao'] ?? null,
                'contrato_referencia' => $item['contrato_referencia'] ?? null,
                'ordem' => $ordem,
            ]);
        }

        // "Observações internas" (comentários) aposentada em 26/09/2026 — ver nota no início deste método.
    }

    /**
     * Grava os arquivos enviados — fotos e vídeos (F8) na mesma tabela e na
     * mesma sequência de `ordem`, é assim que a galeria mistura os dois.
     * `fotos_meta[i]`/`videos_meta[i]` descreve `fotos[i]`/`videos[i]`: a
     * qual tarefa a mídia pertence (opcional — sem isso é mídia do dia) e a
     * legenda; só foto tem o ponto do croqui.
     */
    private function guardarFotos(RdoRegistro $rdo, Request $request, array $data): void
    {
        $ultimaOrdem = (int) RdoFoto::where('rdo_id', $rdo->id)->max('ordem');
        $idsDeTarefa = RdoTarefa::where('rdo_id', $rdo->id)->pluck('id')->all();

        $tarefaValida = function (?string $tarefaId) use ($idsDeTarefa): ?string {
            // Só aceita tarefa deste mesmo RDO — impede pendurar mídia na
            // tarefa de outro registro passando um id qualquer.
            return $tarefaId && in_array($tarefaId, $idsDeTarefa, true) ? $tarefaId : null;
        };

        foreach ($request->file('fotos', []) as $i => $arquivo) {
            $meta = $data['fotos_meta'][$i] ?? [];

            RdoFoto::create([
                'rdo_id' => $rdo->id,
                'tarefa_id' => $tarefaValida($meta['tarefa_id'] ?? null),
                'tipo' => 'foto',
                'caminho' => $arquivo->store('rdo', 'public'),
                'legenda' => $meta['legenda'] ?? null,
                'ordem' => ++$ultimaOrdem,
                'marcador_x' => $meta['x'] ?? null,
                'marcador_y' => $meta['y'] ?? null,
                'marcador_nota' => $meta['nota'] ?? null,
            ]);
        }

        foreach ($request->file('videos', []) as $i => $arquivo) {
            $meta = $data['videos_meta'][$i] ?? [];

            RdoFoto::create([
                'rdo_id' => $rdo->id,
                'tarefa_id' => $tarefaValida($meta['tarefa_id'] ?? null),
                'tipo' => 'video',
                'caminho' => $arquivo->store('rdo', 'public'),
                'legenda' => $meta['legenda'] ?? null,
                'ordem' => ++$ultimaOrdem,
            ]);
        }
    }

    /**
     * Aviso por e-mail ao contratante quando um RDO é finalizado (decisão de
     * 15/09/2026: sem WhatsApp). Falha de envio não derruba a finalização —
     * o documento já está assinado, o aviso é secundário.
     */
    private function avisarContratante(RdoRegistro $rdo): void
    {
        $links = RdoContratanteLink::where('obra_id', $rdo->obra_id)
            ->where('ativo', true)
            ->whereNotNull('email')
            ->get();

        foreach ($links as $link) {
            if (!$link->estaValido()) {
                continue;
            }

            try {
                \Illuminate\Support\Facades\Mail::to($link->email)->send(
                    new \App\Mail\RdoDisponivel($rdo, $link)
                );
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }
}
