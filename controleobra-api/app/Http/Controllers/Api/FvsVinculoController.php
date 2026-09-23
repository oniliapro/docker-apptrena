<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EapItem;
use App\Models\FvsModelo;
use App\Models\FvsVinculo;
use App\Models\Obra;
use Illuminate\Http\Request;

/**
 * Vínculo entre um item da EAP e um modelo de FVS (F10) — "qualquer linha da
 * EAP pode ter uma ou mais fichas". Rotas por OBRA (não por item isolado)
 * porque a tela da EAP carrega tudo de uma vez, igual às outras listas
 * pousadas na EAP.
 */
class FvsVinculoController extends Controller
{
    /** Todos os vínculos dos itens desta obra, com o modelo carregado — a tela da EAP monta o mapa item->modelos sozinha. */
    public function index(Obra $obra)
    {
        return FvsVinculo::whereIn('eap_item_id', EapItem::where('obra_id', $obra->id)->pluck('id'))
            ->with('modelo')
            ->get();
    }

    public function store(Request $request, Obra $obra)
    {
        $data = $request->validate([
            'eap_item_id' => 'required|string|max:36',
            'fvs_modelo_id' => 'required|string|max:36',
        ]);

        // Mesmo cuidado do resto do RDO/EAP: os dois ids vêm do cliente, então
        // confirma que o item é desta obra e o modelo é desta empresa antes de
        // gravar — senão daria pra ligar um item de outra obra/empresa só
        // adivinhando o UUID.
        $item = EapItem::where('obra_id', $obra->id)->where('id', $data['eap_item_id'])->first();
        if (!$item) {
            abort(404, 'Item da EAP não encontrado nesta obra.');
        }
        $modelo = FvsModelo::find($data['fvs_modelo_id']);
        if (!$modelo) {
            abort(404, 'Modelo de FVS não encontrado.');
        }

        $vinculo = FvsVinculo::firstOrCreate([
            'eap_item_id' => $item->id,
            'fvs_modelo_id' => $modelo->id,
        ]);

        return response()->json($vinculo->load('modelo'), 201);
    }

    public function destroy(Obra $obra, FvsVinculo $fvsVinculo)
    {
        $item = EapItem::where('obra_id', $obra->id)->where('id', $fvsVinculo->eap_item_id)->first();
        if (!$item) {
            abort(404);
        }

        $fvsVinculo->delete();

        return response()->noContent();
    }
}
