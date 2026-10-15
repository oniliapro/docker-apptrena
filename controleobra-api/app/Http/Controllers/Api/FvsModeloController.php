<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContratoModelo;
use App\Models\FvsModelo;
use Illuminate\Http\Request;

/**
 * Cadastro de modelos de Ficha de Verificação de Serviço (F10, Configurações)
 * — mesmo espírito de Materiais/Profissionais: criado uma vez, vinculado a
 * itens da EAP de qualquer obra depois (`FvsVinculoController`).
 */
class FvsModeloController extends Controller
{
    public function index()
    {
        return FvsModelo::orderBy('nome')->get();
    }

    public function store(Request $request)
    {
        return response()->json(FvsModelo::create($this->validar($request)), 201);
    }

    public function update(Request $request, FvsModelo $fvsModelo)
    {
        $fvsModelo->update($this->validar($request));

        return $fvsModelo->fresh();
    }

    public function destroy(FvsModelo $fvsModelo)
    {
        $fvsModelo->delete();

        return response()->noContent();
    }

    private function validar(Request $request): array
    {
        $data = $request->validate([
            'nome' => 'required|string|max:150',
            'itens' => 'required|array|min:1|max:50',
            'itens.*.descricao' => 'required|string|max:255',
            // Documento (Modelos de documentos, tipo `fvs`) que formata a ficha — opcional.
            // `ContratoModelo::where` respeita o escopo de empresa: id de outra empresa reprova.
            'contrato_modelo_id' => [
                'nullable', 'string',
                function (string $atributo, $valor, \Closure $falha) {
                    if ($valor !== null && $valor !== ''
                        && !ContratoModelo::where('id', $valor)->where('tipo', 'fvs')->exists()) {
                        $falha('O modelo de documento escolhido não foi encontrado.');
                    }
                },
            ],
            'ativo' => 'nullable|boolean',
        ]);

        if (array_key_exists('contrato_modelo_id', $data) && $data['contrato_modelo_id'] === '') {
            $data['contrato_modelo_id'] = null;
        }

        $data['itens'] = array_map(fn ($i) => ['descricao' => trim($i['descricao'])], $data['itens']);

        return $data;
    }
}
