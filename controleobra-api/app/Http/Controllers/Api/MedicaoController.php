<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Medicao;
use App\Models\MedicaoItem;
use App\Models\Obra;
use App\Models\TipoCusto;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Medição física da obra (23/08/2026, pedido do Lucas) — ver a migration
 * de `medicoes` pro desenho da fila (sequência estrita, uma medição em
 * rascunho por vez, só a última pode ser excluída).
 *
 * O cálculo (média ponderada dos grupos, "Medição total" por item, %/R$)
 * vive todo no frontend (`medicao-engine.ts`), igual ao resto do
 * sistema (EAP, Empreita) — este controller só persiste o que o
 * frontend manda, sem recalcular nada.
 */
class MedicaoController extends Controller
{
    /** GET /api/obras/{obra}/medicoes — lista leve, sem os itens. */
    public function index(Obra $obra)
    {
        return $obra->medicoes()->get()->map(fn (Medicao $m) => $this->resumo($m));
    }

    /**
     * POST /api/obras/{obra}/medicoes — cria uma medição em rascunho,
     * com uma linha por item da EAP atual (folha ou grupo). Só uma
     * medição em rascunho por obra por vez — a fila é estritamente
     * sequencial (ver a migration).
     *
     * Cada célula já nasce pré-preenchida com o valor da última medição
     * aprovada (25/08/2026, pedido do Lucas: "os campos da nova medição
     * tem que vir pré preenchido iguais ao campos da última medição") —
     * como `valor_percentual` é o acumulado absoluto (não um delta do
     * período), começar do zero forçaria redigitar tudo; começar do valor
     * anterior deixa só o avanço do período a lançar.
     */
    public function store(Request $request, Obra $obra)
    {
        if ($obra->medicoes()->where('status', 'rascunho')->exists()) {
            abort(422, 'Já existe uma medição em rascunho nesta obra — aprove ou exclua antes de criar outra.');
        }

        $data = $request->validate(['dataMedicao' => 'nullable|date']);

        $medicao = DB::transaction(function () use ($obra, $data) {
            $proximaSequencia = ((int) $obra->medicoes()->max('sequencia')) + 1;

            $medicao = Medicao::create([
                'obra_id' => $obra->id,
                'sequencia' => $proximaSequencia,
                'data_medicao' => $data['dataMedicao'] ?? null,
                'status' => 'rascunho',
            ]);

            $anterior = Medicao::where('obra_id', $obra->id)
                ->where('status', 'aprovada')
                ->orderByDesc('sequencia')
                ->first();

            $valoresAnterioresPorEap = [];
            if ($anterior) {
                $anterior->load('itens.valoresPorTipo');
                foreach ($anterior->itens as $itemAnterior) {
                    $valoresAnterioresPorEap[$itemAnterior->eap_item_id] = $itemAnterior->valoresPorTipo;
                }
            }

            foreach ($obra->eapItens()->orderBy('ordem')->get() as $ordem => $eapItem) {
                $novoItem = MedicaoItem::create([
                    'medicao_id' => $medicao->id,
                    'eap_item_id' => $eapItem->id,
                    'ordem' => $ordem,
                ]);

                foreach ($valoresAnterioresPorEap[$eapItem->id] ?? [] as $valorAnterior) {
                    $novoItem->valoresPorTipo()->create([
                        'tipo_custo_id' => $valorAnterior->tipo_custo_id,
                        'valor_percentual' => $valorAnterior->valor_percentual,
                        'manual' => $valorAnterior->manual,
                    ]);
                }
            }

            return $medicao;
        });

        return $this->show($medicao);
    }

    /** GET /api/medicoes/{medicao} — grade completa + acumulado anterior. */
    public function show(Medicao $medicao)
    {
        $medicao->load(['itens.valoresPorTipo']);
        $tipos = TipoCusto::orderBy('ordem')->pluck('chave', 'id');

        $anterior = Medicao::where('obra_id', $medicao->obra_id)
            ->where('status', 'aprovada')
            ->where('sequencia', '<', $medicao->sequencia)
            ->orderByDesc('sequencia')
            ->first();

        $acumuladoAnterior = [];
        if ($anterior) {
            $anterior->load(['itens.valoresPorTipo']);
            foreach ($anterior->itens as $item) {
                $valores = [];
                foreach ($item->valoresPorTipo as $valorTipo) {
                    $chave = $tipos[$valorTipo->tipo_custo_id] ?? null;
                    if ($chave) $valores[$chave] = (float) $valorTipo->valor_percentual;
                }
                $acumuladoAnterior[$item->eap_item_id] = $valores;
            }
        }

        return response()->json([
            ...$this->resumo($medicao),
            'itens' => $medicao->itens->map(function (MedicaoItem $item) use ($tipos) {
                $valores = [];
                foreach ($item->valoresPorTipo as $valorTipo) {
                    $chave = $tipos[$valorTipo->tipo_custo_id] ?? null;
                    if (!$chave) continue;
                    $valores[$chave] = [
                        'valor' => (float) $valorTipo->valor_percentual,
                        'manual' => (bool) $valorTipo->manual,
                    ];
                }
                return [
                    'eapItemId' => $item->eap_item_id,
                    'ordem' => $item->ordem,
                    'valores' => $valores,
                ];
            })->values(),
            'acumuladoAnterior' => $acumuladoAnterior,
        ]);
    }

    /**
     * PUT /api/medicoes/{medicao} — grava os valores digitados (autosave,
     * mesmo padrão de EapStore.salvar()). Só permitido em rascunho.
     */
    public function update(Request $request, Medicao $medicao)
    {
        if ($medicao->status !== 'rascunho') {
            abort(422, 'Só é possível editar uma medição em rascunho.');
        }

        $data = $request->validate([
            'itens' => 'required|array',
            'itens.*.eapItemId' => 'required|string',
            'itens.*.valores' => 'nullable|array',
        ]);

        $this->gravarValores($medicao, $data['itens']);

        return $this->show($medicao);
    }

    /**
     * POST /api/medicoes/{medicao}/aprovar — grava o payload final
     * (calculado no frontend: manual quando houver, senão a média
     * ponderada ao vivo dos descendentes — ver `medicao-engine.ts`) e
     * marca a medição como aprovada. A partir daqui ela vira o
     * "acumulado anterior" pra próxima medição da obra.
     */
    public function aprovar(Request $request, Medicao $medicao)
    {
        if ($medicao->status !== 'rascunho') {
            abort(422, 'Esta medição já foi aprovada.');
        }

        $data = $request->validate([
            'itens' => 'required|array',
            'itens.*.eapItemId' => 'required|string',
            'itens.*.valores' => 'nullable|array',
        ]);

        DB::transaction(function () use ($medicao, $data) {
            $this->gravarValores($medicao, $data['itens']);
            $medicao->update(['status' => 'aprovada', 'aprovado_em' => now()]);
        });

        return $this->show($medicao);
    }

    /**
     * DELETE /api/medicoes/{medicao} — só a mais recente da obra (maior
     * `sequencia`) pode ser excluída, rascunho ou aprovada — força
     * excluir de trás pra frente.
     */
    public function destroy(Medicao $medicao)
    {
        $maiorSequencia = Medicao::where('obra_id', $medicao->obra_id)->max('sequencia');
        if ($medicao->sequencia !== $maiorSequencia) {
            abort(422, 'Só é possível excluir a medição mais recente — exclua as medições posteriores primeiro.');
        }

        $medicao->delete();
        return response()->noContent();
    }

    private function gravarValores(Medicao $medicao, array $itensPayload): void
    {
        $tipoIds = TipoCusto::pluck('id', 'chave');

        DB::transaction(function () use ($medicao, $itensPayload, $tipoIds) {
            $itensPorEapId = $medicao->itens()->get()->keyBy('eap_item_id');

            foreach ($itensPayload as $raw) {
                $item = $itensPorEapId->get($raw['eapItemId'] ?? null);
                if (!$item) continue; // item não faz parte desta medição (fora do snapshot original)

                foreach ((array) ($raw['valores'] ?? []) as $chave => $valor) {
                    if (!isset($tipoIds[$chave])) continue;
                    $item->valoresPorTipo()->updateOrCreate(
                        ['tipo_custo_id' => $tipoIds[$chave]],
                        [
                            'valor_percentual' => $valor['valor'] ?? 0,
                            'manual' => (bool) ($valor['manual'] ?? false),
                        ]
                    );
                }
            }
        });
    }

    private function resumo(Medicao $medicao): array
    {
        return [
            'id' => $medicao->id,
            'obraId' => $medicao->obra_id,
            'sequencia' => $medicao->sequencia,
            'dataMedicao' => optional($medicao->data_medicao)->format('Y-m-d'),
            'status' => $medicao->status,
            'aprovadoEm' => optional($medicao->aprovado_em)->toIso8601String(),
        ];
    }
}
