<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Recebimento;
use App\Services\AnexoNomeador;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CRUD de recebimentos — mirror de `PagamentoController.php` (01/09/2026,
 * pedido do Lucas: "os recebimentos funcionam exatamente como os
 * pagamentos"). Único módulo novo desta rodada: dinheiro ENTRANDO (do
 * cliente da obra), gerado automaticamente a partir de uma Medição
 * aprovada (`MedicaoStore::gerarRecebimento`) ou lançado manualmente,
 * igual Pagamento é gerado por Mapa/Empreita ou lançado à mão.
 */
class RecebimentoController extends Controller
{
    public function index(Request $request)
    {
        // `obra:id,obra_nome` + `withCount('anexos')` (14/09/2026) — card
        // "Recebimentos" do dashboard, mesmo padrão de PagamentoController::index.
        $query = Recebimento::with('itens.tipoCusto', 'obra:id,obra_nome')
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

        // Mesmo raciocínio de EmpreitaController::index/PagamentoController::index
        // — listagem cruza várias obras, filtro por obra roda aqui (acesso
        // "aberto por exceção").
        $usuario = $request->user();
        if ($usuario && !$usuario->ehAdmin()) {
            $obraIdsNegados = $usuario->obraAcessos()->where('pode_ver', false)->pluck('obra_id');
            $query->whereNotIn('obra_id', $obraIdsNegados);
        }

        return $query->get()->map(fn (Recebimento $r) => $this->paraFrontend($r))->values();
    }

    public function show(Recebimento $recebimento)
    {
        return $this->paraFrontend($recebimento->load('itens.tipoCusto')->loadCount('anexos'));
    }

    public function store(Request $request)
    {
        return $this->syncCompleto($request, new Recebimento());
    }

    public function update(Request $request, Recebimento $recebimento)
    {
        return $this->syncCompleto($request, $recebimento);
    }

    public function destroy(Recebimento $recebimento)
    {
        $recebimento->delete();
        return response()->noContent();
    }

    private function syncCompleto(Request $request, Recebimento $recebimento)
    {
        $data = $request->validate([
            'numero_recebimento' => 'required|string|max:30',
            'obra_id' => 'nullable|string|exists:obras,id',
            'obra_number' => 'nullable|string|max:50',
            'data_solicitacao' => 'nullable|date',
            'data_recebimento' => 'nullable|date',
            'cliente' => 'nullable|string|max:120',
            'descricao' => 'nullable|string',
            'valor_total' => 'required|numeric',
            'origem_tipo' => 'nullable|in:medicao,manual,outro',
            'origem_ref_id' => 'nullable|string',
            'medicao_id' => 'nullable|string|exists:medicoes,id',
            'status' => 'nullable|in:' . implode(',', \App\Models\Recebimento::STATUS_OPCOES),
            'itens' => 'required|array|min:1',
        ]);

        // Mesma regra de negócio de Pagamento: soma dos itens precisa bater
        // com o valor total (tolerância de 1 centavo).
        $somaItens = collect($data['itens'])->sum(fn ($it) => (float) ($it['valor'] ?? 0));
        if (abs($somaItens - (float) $data['valor_total']) > 0.01) {
            return response()->json([
                'message' => 'A soma dos itens deve ser igual ao valor total do recebimento.',
            ], 422);
        }

        // Mesmo raciocínio de `PagamentoController::syncCompleto` —
        // capturado antes do fill()/save() pra saber, depois, se o número
        // mudou numa edição de verdade (nunca numa criação).
        $numeroAntigo = $recebimento->exists ? $recebimento->numero_recebimento : null;

        DB::transaction(function () use ($data, $recebimento) {
            $recebimento->fill([
                'numero_recebimento' => $data['numero_recebimento'],
                'obra_id' => $data['obra_id'] ?? null,
                'obra_number' => $data['obra_number'] ?? '',
                'data_solicitacao' => $data['data_solicitacao'] ?? null,
                'data_recebimento' => $data['data_recebimento'] ?? null,
                'cliente' => $data['cliente'] ?? '',
                'descricao' => $data['descricao'] ?? '',
                'valor_total' => $data['valor_total'],
                'origem_tipo' => $data['origem_tipo'] ?? 'manual',
                'origem_ref_id' => $data['origem_ref_id'] ?? null,
                'medicao_id' => $data['medicao_id'] ?? null,
                'status' => $data['status'] ?? 'confirmado',
            ]);
            $recebimento->save();

            $keepItens = [];
            foreach ($data['itens'] as $i => $raw) {
                $id = $raw['id'] ?? (string) Str::uuid();
                $keepItens[] = $id;

                $tipoId = isset($raw['tipo'])
                    ? \App\Models\TipoCusto::where('chave', $raw['tipo'])->value('id')
                    : null;

                $recebimento->itens()->updateOrCreate(['id' => $id], [
                    'ordem' => $i,
                    'descricao' => $raw['descricao'] ?? '',
                    'tipo_custo_id' => $tipoId,
                    'eap_item_id' => $raw['eapId'] ?? null,
                    'valor' => $raw['valor'] ?? 0,
                    'modo_valor' => $raw['modoValor'] ?? 'valor',
                ]);
            }
            $recebimento->itens()->whereNotIn('id', $keepItens ?: ['__none__'])->delete();
        });

        if ($numeroAntigo !== null && $numeroAntigo !== $data['numero_recebimento']) {
            AnexoNomeador::aposMudarNumero('recebimento', $recebimento->id, $data['numero_recebimento']);
        }

        return $this->paraFrontend($recebimento->load('itens.tipoCusto'));
    }

    /** Traduz o modelo relacional pro formato camelCase do frontend — mirror de `PagamentoController::paraFrontend`. */
    private function paraFrontend(Recebimento $recebimento): array
    {
        return [
            'id' => $recebimento->id,
            'numeroRecebimento' => $recebimento->numero_recebimento,
            'obraId' => $recebimento->obra_id,
            'obraNumber' => $recebimento->obra_number ?? '',
            'obraNome' => optional($recebimento->obra)->obra_nome ?? '',
            'dataSolicitacao' => optional($recebimento->data_solicitacao)->format('Y-m-d') ?? '',
            'dataRecebimento' => optional($recebimento->data_recebimento)->toIso8601String() ?? '',
            'cliente' => $recebimento->cliente ?? '',
            'descricao' => $recebimento->descricao ?? '',
            'valorTotal' => (float) $recebimento->valor_total,
            'itens' => $recebimento->itens->map(fn ($item) => [
                'id' => $item->id,
                'descricao' => $item->descricao ?? '',
                'tipo' => optional($item->tipoCusto)->chave ?? '',
                'eapId' => $item->eap_item_id ?? '',
                'valor' => (float) $item->valor,
                'modoValor' => $item->modo_valor ?? 'valor',
            ])->values(),
            'origem' => ($recebimento->origem_tipo && $recebimento->origem_tipo !== 'manual')
                ? ['tipo' => $recebimento->origem_tipo, 'refId' => $recebimento->origem_ref_id]
                : null,
            'status' => $recebimento->status ?? 'confirmado',
            'anexosCount' => $recebimento->anexos_count ?? $recebimento->anexos()->count(),
        ];
    }
}
