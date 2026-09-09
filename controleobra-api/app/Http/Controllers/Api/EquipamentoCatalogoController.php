<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EquipamentoCatalogo;
use Illuminate\Http\Request;

/**
 * Catálogo de equipamentos da empresa (08/09/2026) — cadastro simples,
 * reutilizado entre obras e lançamentos do Diário de Obra (item E da
 * especificação: "cadastro inicial, depois selecionado e quantificado
 * no lançamento diário"). Protegido pelo mesmo módulo `diario_obra`
 * (não é um módulo à parte na matriz de permissões).
 */
class EquipamentoCatalogoController extends Controller
{
    public function index()
    {
        return EquipamentoCatalogo::orderBy('nome')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nome' => 'required|string|max:150',
            'tipo' => 'nullable|string|max:80',
        ]);

        return response()->json(EquipamentoCatalogo::create($data), 201);
    }
}
