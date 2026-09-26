<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Obra;
use Illuminate\Http\Request;

/**
 * Cabeçalho técnico do RDO por obra (contrato, responsável técnico, CREA,
 * ART, início, prazo, contratante).
 *
 * Até 26/09/2026 vivia numa tabela própria do módulo (`rdo_obra_dados`,
 * editável dentro do próprio RDO). Pedido do Lucas: "o cabeçalho do diário
 * tem que ser preenchido automaticamente de acordo com os dados da obra e
 * não pode ser editado" — agora só existe `show()` (somente leitura), e os
 * dados vêm de `obras` (mesmo cálculo de `RdoController::cabecalhoDaObra`).
 * A tabela/model `RdoObraDados` ficaram sem uso, não apagados.
 */
class RdoObraDadosController extends Controller
{
    public function show(Request $request)
    {
        $data = $request->validate(['obra_id' => 'required|string|exists:obras,id']);
        $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);

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

    /** Ver nota no RdoController: `exists:` não respeita o scope multiempresa. */
    private function obraDaEmpresaOuAborta(string $obraId): Obra
    {
        $obra = Obra::find($obraId);

        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }

        return $obra;
    }
}
