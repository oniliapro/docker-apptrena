<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MaterialEquipamento;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Cadastro "Materiais e equipamentos" (22/09/2026, F6). CRUD + foto.
 * A foto vai por rota própria (multipart) para o restante continuar JSON.
 */
class MaterialEquipamentoController extends Controller
{
    public function index()
    {
        return MaterialEquipamento::orderBy('nome')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validar($request);

        return response()->json(MaterialEquipamento::create($data), 201);
    }

    public function update(Request $request, MaterialEquipamento $materiaisEquipamento)
    {
        $data = $this->validar($request, $materiaisEquipamento);
        $materiaisEquipamento->update($data);

        return $materiaisEquipamento->fresh();
    }

    public function destroy(MaterialEquipamento $materiaisEquipamento)
    {
        if ($materiaisEquipamento->foto_path) {
            Storage::disk('public')->delete($materiaisEquipamento->foto_path);
        }
        $materiaisEquipamento->delete();

        return response()->noContent();
    }

    public function salvarFoto(Request $request, MaterialEquipamento $materiaisEquipamento)
    {
        $request->validate(['foto' => 'required|file|image|max:8192']);

        if ($materiaisEquipamento->foto_path) {
            Storage::disk('public')->delete($materiaisEquipamento->foto_path);
        }
        $materiaisEquipamento->update(['foto_path' => $request->file('foto')->store('materiais', 'public')]);

        return $materiaisEquipamento->fresh();
    }

    public function removerFoto(MaterialEquipamento $materiaisEquipamento)
    {
        if ($materiaisEquipamento->foto_path) {
            Storage::disk('public')->delete($materiaisEquipamento->foto_path);
            $materiaisEquipamento->update(['foto_path' => null]);
        }

        return $materiaisEquipamento->fresh();
    }

    /**
     * Nome único por empresa + tipo. O global scope multiempresa não vale para
     * `Rule::unique`, então o filtro por empresa é explícito (mesmo cuidado das Tags).
     */
    private function validar(Request $request, ?MaterialEquipamento $atual = null): array
    {
        $tipo = $request->input('tipo', $atual?->tipo ?? 'material');

        $data = $request->validate([
            'tipo' => ['required', Rule::in(MaterialEquipamento::TIPOS)],
            'nome' => [
                'required', 'string', 'max:150',
                Rule::unique('materiais_equipamentos', 'nome')
                    ->where('empresa_id', optional($request->user())->empresa_id)
                    ->where('tipo', $tipo)
                    ->ignore($atual?->id),
            ],
            'unidade' => 'nullable|string|max:20',
            'valor_unitario' => 'nullable|numeric|min:0',
            'marcas' => 'nullable|array|max:50',
            'marcas.*' => 'nullable|string|max:80',
            'ativo' => 'nullable|boolean',
        ], [
            'nome.unique' => 'Já existe um cadastro com este nome.',
        ]);

        $data['valor_unitario'] = $data['valor_unitario'] ?? 0;
        if (array_key_exists('marcas', $data)) {
            $data['marcas'] = array_values(array_filter(
                array_map('trim', $data['marcas'] ?? []),
                fn ($marca) => $marca !== '',
            ));
        }

        return $data;
    }
}
