<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CronogramaPlanejamento;
use App\Models\Obra;
use App\Models\TipoCusto;
use Illuminate\Http\Request;

/**
 * Valor planejado de desembolso, discriminado por categoria de custo,
 * por item da EAP × período (24/08/2026, pedido do Lucas — ver o
 * comentário da migration `add_tipo_custo_a_cronograma_planejamentos`).
 * Autosave a cada célula editada no popup do Cronograma de Desembolso,
 * mesmo padrão do resto do sistema.
 */
class CronogramaPlanejamentoController extends Controller
{
    /** GET /api/obras/{obra}/cronograma/planejamentos */
    public function index(Obra $obra)
    {
        $chavesPorId = TipoCusto::pluck('chave', 'id');

        return $obra->planejamentosCronograma()->get()
            ->filter(fn (CronogramaPlanejamento $p) => isset($chavesPorId[$p->tipo_custo_id]))
            ->map(fn (CronogramaPlanejamento $p) => [
                'eapItemId' => $p->eap_item_id,
                'periodoInicio' => $p->periodo_inicio->format('Y-m-d'),
                'tipo' => $chavesPorId[$p->tipo_custo_id],
                'valor' => (float) $p->valor,
            ])
            ->values();
    }

    /** PUT /api/obras/{obra}/cronograma/planejamentos */
    public function store(Request $request, Obra $obra)
    {
        $chavesValidas = TipoCusto::pluck('id', 'chave');

        $data = $request->validate([
            'eapItemId' => 'required|string|exists:eap_itens,id',
            'periodoInicio' => 'required|date',
            'tipo' => 'required|string|in:' . implode(',', $chavesValidas->keys()->all()),
            'valor' => 'required|numeric|min:0',
        ]);

        $obra->planejamentosCronograma()->updateOrCreate(
            [
                'eap_item_id' => $data['eapItemId'],
                'periodo_inicio' => $data['periodoInicio'],
                'tipo_custo_id' => $chavesValidas[$data['tipo']],
            ],
            ['valor' => $data['valor']],
        );

        return response()->noContent();
    }

    /**
     * DELETE /api/obras/{obra}/cronograma/planejamentos — zera todo o
     * planejamento da obra (24/08/2026, pedido do Lucas: "função para
     * resetar os inputs de valores planejados") — usado antes de um
     * replanejamento do zero.
     */
    public function destroy(Obra $obra)
    {
        $obra->planejamentosCronograma()->delete();
        return response()->noContent();
    }
}
