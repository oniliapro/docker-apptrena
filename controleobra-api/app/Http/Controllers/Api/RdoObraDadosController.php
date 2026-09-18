<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Obra;
use App\Models\RdoObraDados;
use Illuminate\Http\Request;

/**
 * Cabeçalho técnico do RDO por obra (contrato, responsável técnico, CREA,
 * ART, início, prazo).
 *
 * Vive em tabela própria do módulo, e não em `obras`, de propósito: `obras` é
 * compartilhada com EAP, Mapa, Empreita e Pagamentos, e este módulo não altera
 * nada fora do próprio escopo.
 */
class RdoObraDadosController extends Controller
{
    public function show(Request $request)
    {
        $data = $request->validate(['obra_id' => 'required|string|exists:obras,id']);
        $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);

        return RdoObraDados::where('obra_id', $obra->id)->first() ?? new RdoObraDados();
    }

    public function salvar(Request $request)
    {
        $data = $request->validate([
            'obra_id' => 'required|string|exists:obras,id',
            'numero_contrato' => 'nullable|string|max:80',
            'responsavel_tecnico' => 'nullable|string|max:150',
            'crea' => 'nullable|string|max:60',
            'art' => 'nullable|string|max:60',
            'data_inicio' => 'nullable|date',
            'prazo' => 'nullable|string|max:80',
            'contratante_nome' => 'nullable|string|max:180',
        ]);

        $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);

        return RdoObraDados::updateOrCreate(
            ['obra_id' => $obra->id],
            array_merge($data, ['empresa_id' => $request->user()->empresa_id])
        );
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
