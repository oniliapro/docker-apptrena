<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Diaria;
use App\Models\DiariaCategoriaCusto;
use App\Models\Obra;
use App\Models\Pagamento;
use App\Models\PagamentoItem;
use App\Models\TipoCusto;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Diárias (F7, 22/09/2026) — ver o plano ("Aba Diárias") e o motor de
 * rateio no frontend (`features/diarias/diarias-engine.ts`).
 *
 * Divisão de responsabilidade, mesmo espírito da EAP (decisão nº 1 do
 * plano): o RATEIO por etapa/percentual é calculado no frontend — o motor
 * puro já tem os testes que garantem "extra de uma diária nunca vaza pra
 * etapa de outra". Este controller só GRAVA o que o frontend calculou
 * (`fechar()`) e faz as checagens de integridade que não dependem de
 * refazer a conta: diárias existem, são da mesma obra, nenhuma já fechada,
 * e a soma dos itens bate com o total informado (mesma checagem que
 * `PagamentoController::store` já faz).
 */
class DiariaController extends Controller
{
    private const RELACOES = ['etapas'];

    public function index(Request $request, Obra $obra)
    {
        return $obra->diarias()
            ->with(self::RELACOES)
            ->orderByDesc('data')
            ->get()
            ->map(fn (Diaria $diaria) => $this->paraFrontend($diaria));
    }

    public function store(Request $request, Obra $obra)
    {
        $data = $this->validarDiaria($request);

        $diaria = DB::transaction(function () use ($data, $obra) {
            $diaria = Diaria::create([...$data['diaria'], 'obra_id' => $obra->id, 'status' => 'rascunho', 'origem' => 'manual']);
            $this->sincronizarEtapas($diaria, $data['etapas']);

            return $diaria;
        });

        return response()->json($this->paraFrontend($diaria->load(self::RELACOES)), 201);
    }

    public function update(Request $request, Obra $obra, Diaria $diaria)
    {
        if ($diaria->obra_id !== $obra->id) {
            abort(404);
        }
        if ($diaria->status === 'fechada') {
            return response()->json(['message' => 'Esta diária já foi fechada — não pode mais ser editada.'], 422);
        }

        $data = $this->validarDiaria($request);

        DB::transaction(function () use ($data, $diaria) {
            $diaria->update($data['diaria']);
            $this->sincronizarEtapas($diaria, $data['etapas']);
        });

        return $this->paraFrontend($diaria->fresh(self::RELACOES));
    }

    public function destroy(Obra $obra, Diaria $diaria)
    {
        if ($diaria->obra_id !== $obra->id) {
            abort(404);
        }
        if ($diaria->status === 'fechada') {
            return response()->json([
                'message' => 'Esta diária já foi fechada e gerou um pagamento — exclua o pagamento primeiro, se for o caso.',
            ], 422);
        }

        $diaria->delete();

        return response()->noContent();
    }

    /**
     * Fecha uma ou mais diárias (da MESMA obra) num único Pagamento
     * pendente. `itens` é o que `gerarItensPagamento()` (frontend) já
     * calculou — este método confere a integridade e grava.
     */
    public function fechar(Request $request, Obra $obra)
    {
        $data = $request->validate([
            'numero_pagamento' => 'required|string|max:30',
            'fornecedor' => 'nullable|string|max:120',
            'descricao' => 'nullable|string',
            'data_solicitacao' => 'nullable|date',
            'data_pagamento' => 'nullable|date',
            'diaria_ids' => 'required|array|min:1',
            'diaria_ids.*' => 'string|distinct',
            'valor_total' => 'required|numeric',
            'itens' => 'required|array|min:1',
            'itens.*.descricao' => 'required|string',
            'itens.*.tipo' => 'required|string',
            'itens.*.eap_item_id' => 'nullable|string',
            'itens.*.valor' => 'required|numeric',
            'itens.*.diaria_id' => 'required|string',
        ]);

        $diarias = Diaria::whereIn('id', $data['diaria_ids'])->get()->keyBy('id');
        foreach ($data['diaria_ids'] as $id) {
            $diaria = $diarias->get($id);
            if (!$diaria) {
                return response()->json(['message' => 'Uma das diárias não foi encontrada — recarregue a página.'], 422);
            }
            if ($diaria->obra_id !== $obra->id) {
                return response()->json(['message' => 'Todas as diárias precisam ser desta obra.'], 422);
            }
            // Recheca aqui dentro (não só no front): evita fechar duas vezes por causa de
            // duas abas abertas ao mesmo tempo.
            if ($diaria->status === 'fechada') {
                return response()->json([
                    'message' => "A diária de {$diaria->profissional_nome} em {$diaria->data->format('d/m/Y')} já foi fechada por outra ação — recarregue a página.",
                ], 422);
            }
        }

        $idsValidos = collect($data['diaria_ids']);
        foreach ($data['itens'] as $item) {
            if (!$idsValidos->contains($item['diaria_id'])) {
                return response()->json(['message' => 'Um item aponta para uma diária fora do lote.'], 422);
            }
        }

        $somaItens = collect($data['itens'])->sum(fn ($item) => (float) $item['valor']);
        if (abs($somaItens - (float) $data['valor_total']) > 0.01) {
            return response()->json(['message' => 'A soma dos itens deve ser igual ao valor total do pagamento.'], 422);
        }

        $tipoIds = TipoCusto::pluck('id', 'chave');

        $pagamento = DB::transaction(function () use ($data, $obra, $tipoIds) {
            $pagamento = Pagamento::create([
                'numero_pagamento' => $data['numero_pagamento'],
                'obra_id' => $obra->id,
                'obra_number' => $obra->map_number ?? '',
                'data_solicitacao' => $data['data_solicitacao'] ?? null,
                'data_pagamento' => $data['data_pagamento'] ?? null,
                'fornecedor' => $data['fornecedor'] ?? '',
                'descricao' => $data['descricao'] ?? '',
                'valor_total' => $data['valor_total'],
                'origem_tipo' => 'diaria',
                'status' => 'pendente',
            ]);

            foreach ($data['itens'] as $i => $item) {
                PagamentoItem::create([
                    'pagamento_id' => $pagamento->id,
                    'ordem' => $i,
                    'descricao' => $item['descricao'],
                    'tipo_custo_id' => $tipoIds[$item['tipo']] ?? null,
                    'eap_item_id' => $item['eap_item_id'] ?? null,
                    'valor' => $item['valor'],
                    'modo_valor' => 'valor',
                    'diaria_id' => $item['diaria_id'],
                ]);
            }

            Diaria::whereIn('id', $data['diaria_ids'])->update([
                'status' => 'fechada',
                'pagamento_id' => $pagamento->id,
            ]);

            return $pagamento;
        });

        return response()->json([
            'pagamentoId' => $pagamento->id,
            'diarias' => Diaria::whereIn('id', $data['diaria_ids'])->with(self::RELACOES)->get()
                ->map(fn (Diaria $diaria) => $this->paraFrontend($diaria)),
        ]);
    }

    // ------------------------------------------------------------------
    // Configurações — "Categorias de custo padrão" das diárias
    // ------------------------------------------------------------------
    public function categorias()
    {
        $linhas = DiariaCategoriaCusto::with('tipoCusto')->get();

        return $linhas->mapWithKeys(fn (DiariaCategoriaCusto $linha) => [
            $linha->campo => optional($linha->tipoCusto)->chave,
        ]);
    }

    public function salvarCategorias(Request $request)
    {
        $data = $request->validate([
            'categorias' => 'required|array',
            'categorias.*' => ['required', 'string', 'exists:tipos_custo,chave'],
        ]);

        $camposValidos = ['diaria', 'valeTransporte', 'valeAlimentacao', 'combustivel', 'valorExtra'];
        $tipoIds = TipoCusto::pluck('id', 'chave');

        foreach ($data['categorias'] as $campo => $chave) {
            if (!in_array($campo, $camposValidos, true)) {
                continue;
            }
            DiariaCategoriaCusto::updateOrCreate(
                ['empresa_id' => $request->user()->empresa_id, 'campo' => $campo],
                ['tipo_custo_id' => $tipoIds[$chave]],
            );
        }

        return $this->categorias();
    }

    // ------------------------------------------------------------------
    private function validarDiaria(Request $request): array
    {
        $data = $request->validate([
            'profissional_id' => 'required|string|max:36',
            'profissional_nome' => 'required|string|max:150',
            'profissional_funcao' => 'nullable|string|max:100',
            'data' => 'required|date',
            'meia_diaria' => 'nullable|boolean',
            'valor_diaria_base' => 'required|numeric|min:0',
            'vale_transporte' => 'nullable|numeric|min:0',
            'vale_alimentacao' => 'nullable|numeric|min:0',
            'combustivel' => 'nullable|numeric|min:0',
            'valor_extra' => 'nullable|numeric|min:0',
            'observacoes' => 'nullable|string',
            'etapas' => 'required|array|min:1',
            'etapas.*.eap_item_id' => 'required|string',
            'etapas.*.percentual' => 'required|numeric|min:0.01|max:100',
        ]);

        $somaPercentuais = collect($data['etapas'])->sum('percentual');
        if (abs($somaPercentuais - 100) > 0.05) {
            abort(response()->json([
                'message' => 'A soma dos percentuais das etapas precisa ser 100%.',
            ], 422));
        }

        return [
            'diaria' => [
                'profissional_id' => $data['profissional_id'],
                'profissional_nome' => $data['profissional_nome'],
                'profissional_funcao' => $data['profissional_funcao'] ?? '',
                'data' => $data['data'],
                'meia_diaria' => $data['meia_diaria'] ?? false,
                'valor_diaria_base' => $data['valor_diaria_base'],
                'vale_transporte' => $data['vale_transporte'] ?? 0,
                'vale_alimentacao' => $data['vale_alimentacao'] ?? 0,
                'combustivel' => $data['combustivel'] ?? 0,
                'valor_extra' => $data['valor_extra'] ?? 0,
                'observacoes' => $data['observacoes'] ?? '',
            ],
            'etapas' => $data['etapas'],
        ];
    }

    private function sincronizarEtapas(Diaria $diaria, array $etapas): void
    {
        $diaria->etapas()->delete();
        foreach ($etapas as $etapa) {
            $diaria->etapas()->create([
                'eap_item_id' => $etapa['eap_item_id'],
                'percentual' => $etapa['percentual'],
            ]);
        }
    }

    private function paraFrontend(Diaria $diaria): array
    {
        return [
            'id' => $diaria->id,
            'obraId' => $diaria->obra_id,
            'profissionalId' => $diaria->profissional_id,
            'profissionalNome' => $diaria->profissional_nome,
            'profissionalFuncao' => $diaria->profissional_funcao,
            'data' => optional($diaria->data)->format('Y-m-d'),
            'meiaDiaria' => (bool) $diaria->meia_diaria,
            'valorDiariaBase' => (float) $diaria->valor_diaria_base,
            'etapas' => $diaria->etapas->map(fn ($etapa) => [
                'eapItemId' => $etapa->eap_item_id,
                'percentual' => (float) $etapa->percentual,
            ])->values(),
            'valeTransporte' => (float) $diaria->vale_transporte,
            'valeAlimentacao' => (float) $diaria->vale_alimentacao,
            'combustivel' => (float) $diaria->combustivel,
            'valorExtra' => (float) $diaria->valor_extra,
            'observacoes' => $diaria->observacoes ?? '',
            'status' => $diaria->status,
            'pagamentoId' => $diaria->pagamento_id,
            'origem' => $diaria->origem,
        ];
    }
}
