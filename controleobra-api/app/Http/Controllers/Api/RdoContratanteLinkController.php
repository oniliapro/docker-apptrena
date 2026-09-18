<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Obra;
use App\Models\RdoContratanteLink;
use Illuminate\Http\Request;

/**
 * Geração e revogação do link de acompanhamento do contratante. Sempre feito
 * do lado da contratada — o contratante nunca cria nada.
 */
class RdoContratanteLinkController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate(['obra_id' => 'required|string|exists:obras,id']);
        $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);

        return RdoContratanteLink::where('obra_id', $obra->id)->orderByDesc('created_at')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'obra_id' => 'required|string|exists:obras,id',
            'email' => 'nullable|email|max:180',
            'expira_em' => 'nullable|date',
        ]);

        $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);

        return response()->json(RdoContratanteLink::create([
            'empresa_id' => $request->user()->empresa_id,
            'obra_id' => $obra->id,
            'email' => $data['email'] ?? null,
            'expira_em' => $data['expira_em'] ?? null,
            'ativo' => true,
        ]), 201);
    }

    public function revogar(string $id)
    {
        $link = RdoContratanteLink::findOrFail($id);
        $link->update(['ativo' => false]);

        return $link;
    }

    private function obraDaEmpresaOuAborta(string $obraId): Obra
    {
        $obra = Obra::find($obraId);

        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }

        return $obra;
    }
}
