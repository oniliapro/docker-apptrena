<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pagamento;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CRUD de pagamentos. Espelha window.pagamentosUtil (js/shared/pagamentos-utils.js)
 * e a tela js/pagamentos/*, decomposto em pagamentos / pagamento_itens.
 */
class PagamentoController extends Controller
{
    public function index(Request $request)
    {
        $query = Pagamento::with('itens')->orderByDesc('data_solicitacao');

        if ($request->filled('origem_tipo')) {
            $query->where('origem_tipo', $request->string('origem_tipo'));
        }
        if ($request->filled('origem_ref_id')) {
            $query->where('origem_ref_id', $request->string('origem_ref_id'));
        }
        if ($request->filled('obra_id')) {
            $query->where('obra_id', $request->string('obra_id'));
        }

        return $query->get();
    }

    public function show(Pagamento $pagamento)
    {
        return $pagamento->load('itens');
    }

    public function store(Request $request)
    {
        return $this->syncCompleto($request, new Pagamento());
    }

    public function update(Request $request, Pagamento $pagamento)
    {
        return $this->syncCompleto($request, $pagamento);
    }

    public function destroy(Pagamento $pagamento)
    {
        $pagamento->delete();
        return response()->noContent();
    }

    private function syncCompleto(Request $request, Pagamento $pagamento)
    {
        $data = $request->validate([
            'numero_pagamento' => 'required|string|max:30',
            'obra_id' => 'nullable|string|exists:obras,id',
            'obra_number' => 'nullable|string|max:50',
            'data_solicitacao' => 'nullable|date',
            'data_pagamento' => 'nullable|date',
            'fornecedor' => 'nullable|string|max:120',
            'descricao' => 'nullable|string',
            'valor_total' => 'required|numeric',
            'origem_tipo' => 'nullable|in:mapa,empreita,manual,outro',
            'origem_ref_id' => 'nullable|string',
            'mapa_id' => 'nullable|string|exists:mapas,id',
            'empreita_id' => 'nullable|string|exists:empreitas,id',
            'itens' => 'required|array|min:1',
        ]);

        // regra de negócio já existente no frontend (validarPagamento em js/pagamentos/03-app.js):
        // soma dos itens precisa bater com o valor total (tolerância de 1 centavo)
        $somaItens = collect($data['itens'])->sum(fn ($it) => (float) ($it['valor'] ?? 0));
        if (abs($somaItens - (float) $data['valor_total']) > 0.01) {
            return response()->json([
                'message' => 'A soma dos itens deve ser igual ao valor total do pagamento.',
            ], 422);
        }

        DB::transaction(function () use ($data, $pagamento) {
            $pagamento->fill([
                'numero_pagamento' => $data['numero_pagamento'],
                'obra_id' => $data['obra_id'] ?? null,
                'obra_number' => $data['obra_number'] ?? '',
                'data_solicitacao' => $data['data_solicitacao'] ?? null,
                'data_pagamento' => $data['data_pagamento'] ?? null,
                'fornecedor' => $data['fornecedor'] ?? '',
                'descricao' => $data['descricao'] ?? '',
                'valor_total' => $data['valor_total'],
                'origem_tipo' => $data['origem_tipo'] ?? 'manual',
                'origem_ref_id' => $data['origem_ref_id'] ?? null,
                'mapa_id' => $data['mapa_id'] ?? null,
                'empreita_id' => $data['empreita_id'] ?? null,
            ]);
            $pagamento->save();

            $keepItens = [];
            foreach ($data['itens'] as $i => $raw) {
                $id = $raw['id'] ?? (string) Str::uuid();
                $keepItens[] = $id;

                $tipoId = isset($raw['tipo'])
                    ? \App\Models\TipoCusto::where('chave', $raw['tipo'])->value('id')
                    : null;

                $pagamento->itens()->updateOrCreate(['id' => $id], [
                    'ordem' => $i,
                    'descricao' => $raw['descricao'] ?? '',
                    'tipo_custo_id' => $tipoId,
                    'eap_item_id' => $raw['eapId'] ?? null,
                    'valor' => $raw['valor'] ?? 0,
                    'modo_valor' => $raw['modoValor'] ?? 'valor',
                ]);
            }
            $pagamento->itens()->whereNotIn('id', $keepItens ?: ['__none__'])->delete();
        });

        return $pagamento->load('itens');
    }
}
