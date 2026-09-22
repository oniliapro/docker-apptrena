<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pagamento;
use App\Services\AnexoNomeador;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CRUD de pagamentos. Espelha window.pagamentosUtil (js/shared/pagamentos-utils.js)
 * e a tela js/pagamentos/*, decomposto em pagamentos / pagamento_itens.
 */
class PagamentoController extends Controller
{
    public function index(Request $request)
    {
        // `withCount('anexos')` (06/09/2026) — coluna "Anexos" da Lista de
        // Pagamentos, sem 1 query por linha. `obra:id,obra_nome` (14/09/2026)
        // — card "Pagamentos" do dashboard precisa do nome da obra, não só
        // do número.
        $query = Pagamento::with('itens.tipoCusto', 'obra:id,obra_nome')
            ->withCount('anexos')
            ->orderByDesc('data_solicitacao');

        if ($request->filled('origem_tipo')) {
            $query->where('origem_tipo', $request->string('origem_tipo'));
        }
        if ($request->filled('origem_ref_id')) {
            $query->where('origem_ref_id', $request->string('origem_ref_id'));
        }
        if ($request->filled('obra_id')) {
            $query->where('obra_id', $request->string('obra_id'));
        }

        // 31/08/2026, "Controle de permissões" — mesmo raciocínio de
        // EmpreitaController::index: listagem cruza várias obras, filtro
        // por obra roda aqui (acesso "aberto por exceção").
        $usuario = $request->user();
        if ($usuario && !$usuario->ehAdmin()) {
            $obraIdsNegados = $usuario->obraAcessos()->where('pode_ver', false)->pluck('obra_id');
            $query->whereNotIn('obra_id', $obraIdsNegados);
        }

        return $query->get()->map(fn (Pagamento $p) => $this->paraFrontend($p))->values();
    }

    public function show(Pagamento $pagamento)
    {
        return $this->paraFrontend($pagamento->load('itens.tipoCusto')->loadCount('anexos'));
    }

    public function store(Request $request)
    {
        return $this->syncCompleto($request, new Pagamento());
    }

    public function update(Request $request, Pagamento $pagamento)
    {
        return $this->syncCompleto($request, $pagamento);
    }

    public function destroy(Pagamento $pagamento)
    {
        $pagamento->delete();
        return response()->noContent();
    }

    private function syncCompleto(Request $request, Pagamento $pagamento)
    {
        $data = $request->validate([
            'numero_pagamento' => 'required|string|max:30',
            'obra_id' => 'nullable|string|exists:obras,id',
            'obra_number' => 'nullable|string|max:50',
            'data_solicitacao' => 'nullable|date',
            'data_pagamento' => 'nullable|date',
            'fornecedor' => 'nullable|string|max:120',
            'descricao' => 'nullable|string',
            'valor_total' => 'required|numeric',
            'origem_tipo' => 'nullable|in:mapa,empreita,diaria,manual,outro',
            'origem_ref_id' => 'nullable|string',
            'mapa_id' => 'nullable|string|exists:mapas,id',
            'empreita_id' => 'nullable|string|exists:empreitas,id',
            'status' => 'nullable|in:' . implode(',', \App\Models\Pagamento::STATUS_OPCOES),
            'medicao_snapshot' => 'nullable|array',
            'itens' => 'required|array|min:1',
        ]);

        // regra de negócio já existente no frontend (validarPagamento em js/pagamentos/03-app.js):
        // soma dos itens precisa bater com o valor total (tolerância de 1 centavo)
        $somaItens = collect($data['itens'])->sum(fn ($it) => (float) ($it['valor'] ?? 0));
        if (abs($somaItens - (float) $data['valor_total']) > 0.01) {
            return response()->json([
                'message' => 'A soma dos itens deve ser igual ao valor total do pagamento.',
            ], 422);
        }

        // Capturado ANTES do fill()/save() — só existe (não é null) numa
        // edição de verdade, nunca numa criação (aí não tem anexo nenhum
        // ainda pra renomear). Usado depois da transação pra saber se o
        // número mudou (06/09/2026, pedido do Lucas: "trocar a numeração
        // dele renomeia todos os anexos").
        $numeroAntigo = $pagamento->exists ? $pagamento->numero_pagamento : null;

        DB::transaction(function () use ($data, $pagamento) {
            $pagamento->fill([
                'numero_pagamento' => $data['numero_pagamento'],
                'obra_id' => $data['obra_id'] ?? null,
                'obra_number' => $data['obra_number'] ?? '',
                'data_solicitacao' => $data['data_solicitacao'] ?? null,
                'data_pagamento' => $data['data_pagamento'] ?? null,
                'fornecedor' => $data['fornecedor'] ?? '',
                'descricao' => $data['descricao'] ?? '',
                'valor_total' => $data['valor_total'],
                'origem_tipo' => $data['origem_tipo'] ?? 'manual',
                'origem_ref_id' => $data['origem_ref_id'] ?? null,
                'mapa_id' => $data['mapa_id'] ?? null,
                'empreita_id' => $data['empreita_id'] ?? null,
                'status' => $data['status'] ?? 'confirmado',
                'medicao_snapshot' => $data['medicao_snapshot'] ?? null,
            ]);
            $pagamento->save();

            $keepItens = [];
            foreach ($data['itens'] as $i => $raw) {
                $id = $raw['id'] ?? (string) Str::uuid();
                $keepItens[] = $id;

                $tipoId = isset($raw['tipo'])
                    ? \App\Models\TipoCusto::where('chave', $raw['tipo'])->value('id')
                    : null;

                $pagamento->itens()->updateOrCreate(['id' => $id], [
                    'ordem' => $i,
                    'descricao' => $raw['descricao'] ?? '',
                    'tipo_custo_id' => $tipoId,
                    'eap_item_id' => $raw['eapId'] ?? null,
                    'valor' => $raw['valor'] ?? 0,
                    'modo_valor' => $raw['modoValor'] ?? 'valor',
                    // 25/08/2026, redesign da Empreita: qual lado do
                    // contrato este item representa (empreiteiro/reserva,
                    // null pra itens de Mapa/manual) + o snapshot do valor
                    // calculado no momento da geração, usado pra "Divergência".
                    'parcela_empreita' => $raw['parcela'] ?? null,
                    'empreita_item_id' => $raw['empreitaItemId'] ?? null,
                    'valor_referencia' => $raw['valorReferencia'] ?? null,
                ]);
            }
            $pagamento->itens()->whereNotIn('id', $keepItens ?: ['__none__'])->delete();
        });

        if ($numeroAntigo !== null && $numeroAntigo !== $data['numero_pagamento']) {
            AnexoNomeador::aposMudarNumero('pagamento', $pagamento->id, $data['numero_pagamento']);
        }

        return $this->paraFrontend($pagamento->load('itens.tipoCusto')->loadCount('anexos'));
    }

    /**
     * Traduz o modelo relacional (snake_case, tipo_custo_id como FK) pro
     * formato que o frontend usa (camelCase, `tipo` já resolvido pra
     * chave — mesmo princípio de ObraController::showEap: o front nunca
     * lida com o id interno de TipoCusto, só com a chave curta).
     *
     * `origem` fica null pra lançamento manual — mesma semântica que a
     * ponte chave-valor tinha antes desta migração (03/08/2026).
     */
    private function paraFrontend(Pagamento $pagamento): array
    {
        return [
            'id' => $pagamento->id,
            'numeroPagamento' => $pagamento->numero_pagamento,
            'obraId' => $pagamento->obra_id,
            'obraNumber' => $pagamento->obra_number ?? '',
            'obraNome' => optional($pagamento->obra)->obra_nome ?? '',
            'dataSolicitacao' => optional($pagamento->data_solicitacao)->format('Y-m-d') ?? '',
            // Datetime, não só data (26/08/2026) — `confirmar()` no
            // frontend grava a hora do clique junto com a data.
            'dataPagamento' => optional($pagamento->data_pagamento)->toIso8601String() ?? '',
            'fornecedor' => $pagamento->fornecedor ?? '',
            'descricao' => $pagamento->descricao ?? '',
            'valorTotal' => (float) $pagamento->valor_total,
            'itens' => $pagamento->itens->map(fn ($item) => [
                'id' => $item->id,
                'descricao' => $item->descricao ?? '',
                'tipo' => optional($item->tipoCusto)->chave ?? '',
                'eapId' => $item->eap_item_id ?? '',
                'valor' => (float) $item->valor,
                'modoValor' => $item->modo_valor ?? 'valor',
                'parcela' => $item->parcela_empreita,
                'empreitaItemId' => $item->empreita_item_id ?? '',
                'valorReferencia' => $item->valor_referencia !== null ? (float) $item->valor_referencia : null,
            ])->values(),
            'origem' => ($pagamento->origem_tipo && $pagamento->origem_tipo !== 'manual')
                ? ['tipo' => $pagamento->origem_tipo, 'refId' => $pagamento->origem_ref_id]
                : null,
            'status' => $pagamento->status ?? 'confirmado',
            'medicaoSnapshot' => $pagamento->medicao_snapshot,
            // `anexos_count` vem de `withCount`/`loadCount` (index/show/
            // syncCompleto) — cai pra uma query direta só se, por algum
            // motivo, nenhum dos dois rodou antes de chegar aqui.
            'anexosCount' => $pagamento->anexos_count ?? $pagamento->anexos()->count(),
        ];
    }
}
