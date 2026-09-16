<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Obra;
use App\Models\ObraContratanteLink;
use App\Services\PermissaoService;
use Illuminate\Http\Request;

/**
 * Gerenciamento (autenticado) dos links de acesso do contratante da
 * obra (cliente final) — quem vê/gera/revoga é sempre alguém do lado
 * da contratada, nunca o próprio contratante (08/09/2026). O acesso de
 * LEITURA do link em si (sem login) é servido por
 * `PublicoDiarioController`.
 */
class ObraContratanteLinkController extends Controller
{
    public function index(Request $request, PermissaoService $permissoes, string $obraId)
    {
        $obra = Obra::find($obraId);
        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }
        if (!$permissoes->podeObra($request->user(), $obra->id, 'ver')) {
            abort(403, 'Sem acesso a esta obra.');
        }

        return ObraContratanteLink::where('obra_id', $obra->id)->orderByDesc('created_at')->get();
    }

    public function store(Request $request, PermissaoService $permissoes, string $obraId)
    {
        $obra = Obra::find($obraId);
        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }
        if (!$permissoes->podeObra($request->user(), $obra->id, 'lancar')) {
            abort(403, 'Sem permissão para gerar link nesta obra.');
        }

        $data = $request->validate([
            'nome_contato' => 'nullable|string|max:150',
            'telefone_whatsapp' => 'nullable|string|max:30',
            // E-mail é quem recebe o aviso de novo diário (16/09/2026, item
            // 12: decisão de trocar o canal de WhatsApp pra e-mail).
            'email' => 'nullable|email|max:190',
            'expira_em' => 'nullable|date',
        ]);

        $link = ObraContratanteLink::create([
            'obra_id' => $obra->id,
            'nome_contato' => $data['nome_contato'] ?? null,
            'telefone_whatsapp' => $data['telefone_whatsapp'] ?? null,
            'email' => $data['email'] ?? null,
            'expira_em' => $data['expira_em'] ?? null,
            'criado_por_user_id' => optional($request->user())->id,
        ]);

        return response()->json($link, 201);
    }

    public function destroy(Request $request, PermissaoService $permissoes, ObraContratanteLink $link)
    {
        $obra = Obra::find($link->obra_id);
        if (!$obra || !$permissoes->podeObra($request->user(), $obra->id, 'lancar')) {
            abort(403, 'Sem permissão para revogar este link.');
        }

        $link->update(['revogado_em' => now()]);

        return response()->noContent();
    }
}
