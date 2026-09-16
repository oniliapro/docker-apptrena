<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DiarioComentarioInterno;
use App\Models\DiarioEquipamentoUso;
use App\Models\DiarioEtapa;
use App\Models\DiarioFoto;
use App\Models\DiarioOcorrencia;
use App\Models\DiarioPendencia;
use App\Models\DiarioRegistro;
use App\Models\DiarioResponsavelPresente;
use App\Models\EquipamentoCatalogo;
use App\Models\Obra;
use App\Models\ObraContratanteLink;
use App\Services\Notificacao\ContratanteNotifier;
use App\Services\PermissaoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Diário de Obra: lista/cria/finaliza registros do dia a dia do
 * canteiro, por obra. Estendido em 08/09/2026 (especificação
 * consolidada com a Onilia e o Lucas) a partir do v0 original
 * (texto + fotos) pra cobrir o checklist completo — responsáveis
 * presentes, mão de obra, equipamentos, ocorrências, pendências,
 * comentário interno ocultável do contratante, e assinatura
 * eletrônica automática ao finalizar.
 *
 * Importante (herdado do v0): a regra `exists:obras,id` do validator
 * faz uma consulta SQL direta e NÃO respeita o global scope
 * multiempresa do model Obra — por isso, depois de validar que o id
 * existe, confirmamos a posse chamando Obra::find($id) (esse sim passa
 * pelo scope) antes de aceitar o registro. Sem essa segunda checagem,
 * uma empresa poderia gravar um registro de diário associado à obra de
 * OUTRA empresa só adivinhando o UUID.
 *
 * Quem assina o diário é sempre o lado da CONTRATADA (quem elaborou/
 * validou — o usuário autenticado que criou ou finalizou o registro).
 * O contratante da obra (cliente final) nunca assina nada — só
 * visualiza, via `PublicoDiarioController` (acesso por link, sem
 * login) — ver `claude/apptrena-diario-de-obra-especificacao.md`.
 */
class DiarioObraController extends Controller
{
    /**
     * Sem obra_id: retorna os registros mais recentes de TODAS as obras da
     * empresa (usado no dashboard inicial). Com obra_id: só dessa obra.
     */
    public function index(Request $request, PermissaoService $permissoes)
    {
        $data = $request->validate([
            'obra_id' => 'nullable|string|exists:obras,id',
            'limite' => 'nullable|integer|min:1|max:100',
        ]);

        $query = DiarioRegistro::with([
            'fotos', 'obra:id,obra_nome', 'autorUser:id,name', 'assinadoPor:id,name',
            'responsaveisPresentes', 'equipamentosUso.equipamento', 'ocorrencias', 'pendencias',
            'comentariosInternos', 'etapas',
        ])
            ->orderByDesc('data')
            ->orderByDesc('created_at');

        $usuario = $request->user();

        if (!empty($data['obra_id'])) {
            $obra = Obra::find($data['obra_id']);
            if (!$obra) {
                abort(403, 'Obra não encontrada para esta empresa.');
            }
            // 31/08/2026, "Controle de permissões" — mesma checagem que o
            // middleware `permissaoObra` faria, feita aqui na mão porque
            // esta rota também precisa funcionar SEM obra_id nenhum
            // (resumo de todas as obras pro dashboard).
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

    /**
     * Registros ainda não finalizados (sem assinatura), pra qualquer obra
     * que o usuário enxergue — "relatório de pendências de assinatura"
     * da especificação (item K).
     */
    public function pendentesAssinatura(Request $request, PermissaoService $permissoes)
    {
        $data = $request->validate([
            'obra_id' => 'nullable|string|exists:obras,id',
        ]);

        $query = DiarioRegistro::with(['obra:id,obra_nome', 'autorUser:id,name'])
            ->where('status', DiarioRegistro::STATUS_RASCUNHO)
            ->orderBy('data');

        $usuario = $request->user();

        if (!empty($data['obra_id'])) {
            $obra = Obra::find($data['obra_id']);
            if (!$obra) {
                abort(403, 'Obra não encontrada para esta empresa.');
            }
            if ($usuario && !$permissoes->podeObra($usuario, $obra->id, 'ver')) {
                abort(403, 'Sem acesso a esta obra.');
            }
            $query->where('obra_id', $obra->id);
        } elseif ($usuario && !$usuario->ehAdmin()) {
            $obraIdsNegados = $usuario->obraAcessos()->where('pode_ver', false)->pluck('obra_id');
            $query->whereNotIn('obra_id', $obraIdsNegados);
        }

        return $query->get();
    }

    /**
     * Quantidade de operários do último lançamento da obra — usado pelo
     * frontend pra pré-preencher o campo "Mão de obra" do novo registro
     * (item D da especificação: mostra o valor do dia anterior pra
     * confirmar/ajustar, não força repetir digitação).
     */
    public function ultimaMaoDeObra(Request $request, PermissaoService $permissoes)
    {
        $data = $request->validate([
            'obra_id' => 'required|string|exists:obras,id',
        ]);

        $obra = Obra::find($data['obra_id']);
        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }
        if (!$permissoes->podeObra($request->user(), $obra->id, 'ver')) {
            abort(403, 'Sem acesso a esta obra.');
        }

        $ultimo = DiarioRegistro::where('obra_id', $obra->id)
            ->whereNotNull('quantidade_operarios')
            ->orderByDesc('data')
            ->orderByDesc('created_at')
            ->first();

        return ['quantidade_operarios' => $ultimo->quantidade_operarios ?? null];
    }

    /**
     * Etapas ainda não concluídas do último lançamento da obra — usado
     * pelo front-end pra pré-preencher o checklist de etapas do novo
     * registro (16/09/2026, item 6/16 dos pedidos de ajuste). Não é
     * ligado ao cronograma nem a um enum fixo: é só uma sugestão de
     * continuidade, que o usuário pode editar livremente (renomear,
     * marcar concluída, adicionar ou remover linhas).
     */
    public function ultimasEtapas(Request $request, PermissaoService $permissoes)
    {
        $data = $request->validate([
            'obra_id' => 'required|string|exists:obras,id',
        ]);

        $obra = Obra::find($data['obra_id']);
        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }
        if (!$permissoes->podeObra($request->user(), $obra->id, 'ver')) {
            abort(403, 'Sem acesso a esta obra.');
        }

        $ultimo = DiarioRegistro::where('obra_id', $obra->id)
            ->orderByDesc('data')
            ->orderByDesc('created_at')
            ->first();

        if (!$ultimo) {
            return ['etapas' => []];
        }

        $etapas = $ultimo->etapas()
            ->where('concluida', false)
            ->get(['nome'])
            ->map(fn (DiarioEtapa $etapa) => ['nome' => $etapa->nome])
            ->values();

        return ['etapas' => $etapas];
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'obra_id' => 'required|string|exists:obras,id',
            'data' => 'required|date',
            'titulo' => 'nullable|string|max:180',
            'descricao' => 'nullable|string',
            'clima' => 'nullable|string|max:40',
            'impacto_cronograma' => 'nullable|string',
            'quantidade_operarios' => 'nullable|integer|min:0',
            'finalizar' => 'nullable|boolean',
            'fotos' => 'nullable|array|max:10',
            'fotos.*' => 'file|image|max:8192',

            // Croqui (16/09/2026, item 9) — marcação opcional de local na
            // foto, indexado pela MESMA posição de `fotos[]` (índice 0 =
            // primeira foto etc.). Uma foto sem marcador simplesmente não
            // tem entrada aqui.
            'fotos_marcadores' => 'nullable|array',
            'fotos_marcadores.*.x' => 'nullable|numeric|min:0|max:1',
            'fotos_marcadores.*.y' => 'nullable|numeric|min:0|max:1',
            'fotos_marcadores.*.nota' => 'nullable|string|max:255',

            'responsaveis_presentes' => 'nullable|array',
            'responsaveis_presentes.*.nome' => 'required_with:responsaveis_presentes|string|max:150',
            'responsaveis_presentes.*.empresa' => 'nullable|string|max:150',
            'responsaveis_presentes.*.funcao' => 'nullable|string|max:120',
            'responsaveis_presentes.*.contrato_referencia' => 'nullable|string|max:150',
            'responsaveis_presentes.*.presente' => 'nullable|boolean',

            'equipamentos' => 'nullable|array',
            'equipamentos.*.equipamento_id' => 'required_with:equipamentos|string|exists:equipamentos_catalogo,id',
            'equipamentos.*.quantidade' => 'nullable|integer|min:1',

            'ocorrencias' => 'nullable|array',
            'ocorrencias.*.tipo' => 'required_with:ocorrencias|string|in:nao_conformidade,mudanca_projeto,interferencia,interrupcao',
            'ocorrencias.*.descricao' => 'required_with:ocorrencias|string',
            'ocorrencias.*.responsavel' => 'nullable|string|max:150',
            'ocorrencias.*.motivo' => 'nullable|string',
            'ocorrencias.*.danos_materiais' => 'nullable|string',

            'pendencias' => 'nullable|array',
            'pendencias.*.descricao' => 'required_with:pendencias|string',
            'pendencias.*.responsavel' => 'nullable|string|max:150',
            'pendencias.*.prazo' => 'nullable|date',
            'pendencias.*.status' => 'nullable|string|in:aberta,concluida',

            'comentarios_internos' => 'nullable|array',
            'comentarios_internos.*.texto' => 'required_with:comentarios_internos|string',
            'comentarios_internos.*.visivel_contratante' => 'nullable|boolean',

            'etapas' => 'nullable|array',
            'etapas.*.nome' => 'required_with:etapas|string|max:150',
            'etapas.*.concluida' => 'nullable|boolean',
        ]);

        $obra = Obra::find($data['obra_id']);
        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }

        // Mesmo cuidado do `obra_id` acima (ver docblock da classe):
        // `exists:equipamentos_catalogo,id` também não respeita o global
        // scope multiempresa, então confirmamos aqui, um a um, que cada
        // equipamento apontado realmente pertence à empresa do usuário
        // autenticado — sem isso, uma empresa poderia gravar no diário
        // uma referência a equipamento do catálogo de OUTRA empresa só
        // adivinhando o UUID.
        foreach ($data['equipamentos'] ?? [] as $item) {
            if (!EquipamentoCatalogo::find($item['equipamento_id'])) {
                abort(403, 'Equipamento não encontrado para esta empresa.');
            }
        }

        $usuario = $request->user();
        $finalizarAgora = (bool) ($data['finalizar'] ?? false);

        $registro = DB::transaction(function () use ($data, $obra, $usuario, $finalizarAgora) {
            $registro = DiarioRegistro::create([
                'obra_id' => $obra->id,
                'data' => $data['data'],
                'titulo' => $data['titulo'] ?? '',
                'descricao' => $data['descricao'] ?? '',
                'autor' => optional($usuario)->name,
                'autor_user_id' => optional($usuario)->id,
                'clima' => $data['clima'] ?? '',
                'impacto_cronograma' => $data['impacto_cronograma'] ?? null,
                'quantidade_operarios' => $data['quantidade_operarios'] ?? null,
                'status' => $finalizarAgora ? DiarioRegistro::STATUS_FINALIZADO : DiarioRegistro::STATUS_RASCUNHO,
                'assinado_em' => $finalizarAgora ? now() : null,
                'assinado_por_user_id' => $finalizarAgora ? optional($usuario)->id : null,
            ]);

            foreach ($data['responsaveis_presentes'] ?? [] as $item) {
                DiarioResponsavelPresente::create([
                    'registro_id' => $registro->id,
                    'nome' => $item['nome'],
                    'empresa' => $item['empresa'] ?? null,
                    'funcao' => $item['funcao'] ?? null,
                    'contrato_referencia' => $item['contrato_referencia'] ?? null,
                    'presente' => $item['presente'] ?? true,
                ]);
            }

            foreach ($data['equipamentos'] ?? [] as $item) {
                DiarioEquipamentoUso::create([
                    'registro_id' => $registro->id,
                    'equipamento_id' => $item['equipamento_id'],
                    'quantidade' => $item['quantidade'] ?? 1,
                ]);
            }

            foreach ($data['ocorrencias'] ?? [] as $item) {
                DiarioOcorrencia::create([
                    'registro_id' => $registro->id,
                    'tipo' => $item['tipo'],
                    'descricao' => $item['descricao'],
                    'responsavel' => $item['responsavel'] ?? null,
                    'motivo' => $item['motivo'] ?? null,
                    'danos_materiais' => $item['danos_materiais'] ?? null,
                ]);
            }

            foreach ($data['pendencias'] ?? [] as $item) {
                DiarioPendencia::create([
                    'registro_id' => $registro->id,
                    'descricao' => $item['descricao'],
                    'responsavel' => $item['responsavel'] ?? null,
                    'prazo' => $item['prazo'] ?? null,
                    'status' => $item['status'] ?? 'aberta',
                ]);
            }

            foreach ($data['comentarios_internos'] ?? [] as $item) {
                DiarioComentarioInterno::create([
                    'registro_id' => $registro->id,
                    'autor_user_id' => optional($usuario)->id,
                    'texto' => $item['texto'],
                    'visivel_contratante' => $item['visivel_contratante'] ?? false,
                ]);
            }

            foreach ($data['etapas'] ?? [] as $item) {
                DiarioEtapa::create([
                    'registro_id' => $registro->id,
                    'nome' => $item['nome'],
                    'concluida' => $item['concluida'] ?? false,
                ]);
            }

            return $registro;
        });

        foreach ($request->file('fotos', []) as $ordem => $arquivo) {
            $caminho = $arquivo->store('diario', 'public');
            $marcador = $data['fotos_marcadores'][$ordem] ?? null;
            DiarioFoto::create([
                'registro_id' => $registro->id,
                'caminho' => $caminho,
                'ordem' => $ordem,
                'marcador_x' => $marcador['x'] ?? null,
                'marcador_y' => $marcador['y'] ?? null,
                'marcador_nota' => $marcador['nota'] ?? null,
            ]);
        }

        if ($finalizarAgora) {
            $this->notificarContratante($obra, $registro);
        }

        return response()->json($this->carregarCompleto($registro), 201);
    }

    /**
     * Marca um registro em rascunho como finalizado — assina
     * automaticamente com o usuário autenticado (que precisa ter
     * permissão de lançar na obra) e dispara o aviso por e-mail.
     * Não existe um botão de "assinar" separado do usuário: finalizar
     * O É assinar (ver especificação, decisão de 08/09/2026).
     */
    public function finalizar(Request $request, DiarioRegistro $registro)
    {
        if ($registro->estaFinalizado()) {
            abort(422, 'Este registro já foi finalizado.');
        }

        $obra = Obra::find($registro->obra_id);
        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }

        $usuario = $request->user();

        $registro->update([
            'status' => DiarioRegistro::STATUS_FINALIZADO,
            'assinado_em' => now(),
            'assinado_por_user_id' => optional($usuario)->id,
        ]);

        $this->notificarContratante($obra, $registro);

        return $this->carregarCompleto($registro);
    }

    public function destroy(DiarioRegistro $registro)
    {
        foreach ($registro->fotos as $foto) {
            Storage::disk('public')->delete($foto->caminho);
        }
        $registro->delete();

        return response()->noContent();
    }

    private function carregarCompleto(DiarioRegistro $registro): DiarioRegistro
    {
        return $registro->load([
            'fotos', 'autorUser:id,name', 'assinadoPor:id,name',
            'responsaveisPresentes', 'equipamentosUso.equipamento', 'ocorrencias', 'pendencias',
            'comentariosInternos', 'etapas',
        ]);
    }

    /**
     * Aviso ao contratante da obra ("tem diário novo disponível") — só
     * dispara se houver ao menos um link de acesso ativo pra essa obra;
     * sem link nenhum, não há pra quem avisar ainda (o gerenciamento do
     * link é feito em `ObraContratanteLinkController`).
     */
    private function notificarContratante(Obra $obra, DiarioRegistro $registro): void
    {
        $link = ObraContratanteLink::where('obra_id', $obra->id)->first();
        if (!$link) {
            return;
        }

        $urlBase = rtrim(config('app.frontend_url', config('app.url')), '/');
        $urlPublica = "{$urlBase}/publico/diario/{$link->token}";

        app(ContratanteNotifier::class)->notificarNovoDiario($obra, $registro, $urlPublica);
    }
}
