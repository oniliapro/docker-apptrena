<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DiarioFoto;
use App\Models\DiarioRegistro;
use App\Models\Obra;
use App\Services\PermissaoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Diário de Obra: lista/cria/remove registros do dia a dia do canteiro
 * (texto + fotos), por obra.
 *
 * Importante: a regra `exists:obras,id` do validator faz uma consulta SQL
 * direta e NÃO respeita o global scope multiempresa do model Obra — por
 * isso, depois de validar que o id existe, confirmamos a posse chamando
 * Obra::find($id) (esse sim passa pelo scope) antes de aceitar o registro.
 * Sem essa segunda checagem, uma empresa poderia gravar um registro de
 * diário associado à obra de OUTRA empresa só adivinhando o UUID.
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

        $query = DiarioRegistro::with(['fotos', 'obra:id,obra_nome'])
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

    public function store(Request $request)
    {
        $data = $request->validate([
            'obra_id' => 'required|string|exists:obras,id',
            'data' => 'required|date',
            'titulo' => 'nullable|string|max:180',
            'descricao' => 'nullable|string',
            'autor' => 'nullable|string|max:120',
            'clima' => 'nullable|string|max:40',
            'fotos' => 'nullable|array|max:10',
            'fotos.*' => 'file|image|max:8192',
        ]);

        $obra = Obra::find($data['obra_id']);
        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }

        $registro = DiarioRegistro::create([
            'obra_id' => $obra->id,
            'data' => $data['data'],
            'titulo' => $data['titulo'] ?? '',
            'descricao' => $data['descricao'] ?? '',
            'autor' => $data['autor'] ?? optional($request->user())->name,
            'clima' => $data['clima'] ?? '',
        ]);

        foreach ($request->file('fotos', []) as $ordem => $arquivo) {
            $caminho = $arquivo->store('diario', 'public');
            DiarioFoto::create([
                'registro_id' => $registro->id,
                'caminho' => $caminho,
                'ordem' => $ordem,
            ]);
        }

        return response()->json($registro->load('fotos'), 201);
    }

    public function destroy(DiarioRegistro $registro)
    {
        foreach ($registro->fotos as $foto) {
            Storage::disk('public')->delete($foto->caminho);
        }
        $registro->delete();

        return response()->noContent();
    }
}
