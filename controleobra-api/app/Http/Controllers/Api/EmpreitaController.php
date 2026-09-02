<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Empreita;
use App\Models\EmpreitaItem;
use App\Models\TipoCusto;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CRUD de empreitas (contratos de empreitada). Espelha o que
 * js/empreita/11-empreita-state.js guarda em controleObra.empreita.v1
 * (cabecalhoEmpreita + itensEmpreita), só que decomposto nas tabelas
 * empreitas / empreita_itens.
 *
 * 25/08/2026 (pedido do Lucas: "cada item da lista só vai ter um tipo"):
 * cada serviço pertence a UMA categoria de custo só (`tipo_custo_id`
 * direto em `empreita_itens`) — as antigas tabelas de detalhamento por
 * categoria (`empreita_item_contrato_tipo`/`_medicoes_tipo`/
 * `_pagamento_tipo`) e `empreita_tipos_incluidos` foram removidas nesta
 * mesma migração (confirmado sem dado real perdido — ver comentário da
 * migration `2026_08_25_000002_simplificar_empreita_item_para_um_tipo`).
 */
class EmpreitaController extends Controller
{
    /** GET /api/empreitas — aceita `obra_id` para listar só as empreitas de uma obra. */
    public function index(Request $request)
    {
        $query = Empreita::orderBy('numero_empreita');
        if ($request->filled('obra_id')) {
            $query->where('obra_id', $request->query('obra_id'));
        }

        // 31/08/2026, "Controle de permissões" — essa listagem cruza
        // várias obras (o middleware de rota só protege `permissaoModulo`
        // aqui), então o filtro por obra roda no controller: acesso é
        // "aberto por exceção" — um secundário vê tudo, exceto obra com
        // linha explícita negando `pode_ver` (ver `PermissaoService`).
        $usuario = $request->user();
        if ($usuario && !$usuario->ehAdmin()) {
            $obraIdsNegados = $usuario->obraAcessos()->where('pode_ver', false)->pluck('obra_id');
            $query->whereNotIn('obra_id', $obraIdsNegados);
        }

        return $query->get();
    }

    /**
     * GET /api/empreitas/resumo?obra_id= — 25/08/2026, redesign da tela de
     * Empreita: dá pro frontend calcular o "Saldo disp." de cada linha, que
     * agora precisa considerar o contrato de TODAS as outras empreitas da
     * mesma obra (ordenadas por criação), não só desta. Devolve já traduzido
     * pra camelCase — mesmo motivo de sempre (`aplicar()`/`normalizarItem()`
     * em `empreita.store.ts`): expor `tipo_custo_id` numérico obrigaria o
     * frontend a conhecer o id interno de `TipoCusto`.
     *
     * Precisa estar registrada ANTES de `Route::apiResource('empreitas', ...)`
     * em routes/api.php — senão o route-model-binding do apiResource tenta
     * interpretar "resumo" como um `{empreita}` e nunca chega aqui.
     */
    public function resumoObra(Request $request)
    {
        $chavePorId = TipoCusto::pluck('chave', 'id');

        $empreitas = Empreita::where('obra_id', $request->query('obra_id'))
            ->with('itens')
            ->orderBy('created_at')
            ->get();

        return $empreitas->map(fn (Empreita $empreita) => [
            'id' => $empreita->id,
            'numeroEmpreita' => $empreita->numero_empreita,
            'criadoEm' => optional($empreita->created_at)->toIso8601String() ?? '',
            'itens' => $empreita->itens
                ->filter(fn (EmpreitaItem $item) => $chavePorId->has($item->tipo_custo_id))
                ->map(fn (EmpreitaItem $item) => [
                    'eapId' => $item->eap_item_id ?? '',
                    'tipo' => $chavePorId[$item->tipo_custo_id],
                    'qtdeContratada' => (float) $item->qtde_contratada,
                    'contratoEmp' => (float) $item->contrato_emp,
                    'contratoReserva' => (float) $item->contrato_reserva,
                    // 01/09/2026, pedido do Lucas: "% medida" na lista de
                    // empreitas da obra — precisa do acumulado/atual de
                    // cada item pra calcular um percentual ponderado pelo
                    // contrato, sem precisar de uma chamada extra por
                    // empreita (ver EmpreitasObra.percentualMedido).
                    'medicaoAcum' => (float) $item->medicao_acum,
                    'medicaoAtual' => $item->medicao_atual === null ? null : (float) $item->medicao_atual,
                ])->values(),
        ])->values();
    }

    public function show(Empreita $empreita)
    {
        return $empreita->load(['itens.tipoCusto', 'registros.linhas.tipos']);
    }

    public function store(Request $request)
    {
        return $this->syncCompleto($request, new Empreita());
    }

    public function update(Request $request, Empreita $empreita)
    {
        return $this->syncCompleto($request, $empreita);
    }

    public function destroy(Empreita $empreita)
    {
        $empreita->delete();
        return response()->noContent();
    }

    private function syncCompleto(Request $request, Empreita $empreita)
    {
        $data = $request->validate([
            'obra_id' => 'nullable|string|exists:obras,id',
            'obra_number' => 'nullable|string|max:50',
            'numero_empreita' => 'nullable|string|max:50',
            'empreiteiro' => 'nullable|string|max:120',
            'descricao_empreita' => 'nullable|string',
            'medicao_date' => 'nullable|date',
            'competencia' => 'nullable|string|max:30',
            'obs' => 'nullable|string',
            'is_confirmed' => 'nullable|boolean',
            'confirmed_at' => 'nullable|date',
            'itens' => 'nullable|array',
        ]);

        DB::transaction(function () use ($data, $empreita) {
            $empreita->fill([
                'obra_id' => $data['obra_id'] ?? $empreita->obra_id,
                'obra_number' => $data['obra_number'] ?? '',
                'numero_empreita' => $data['numero_empreita'] ?? '',
                'empreiteiro' => $data['empreiteiro'] ?? '',
                'descricao_empreita' => $data['descricao_empreita'] ?? '',
                'medicao_date' => $data['medicao_date'] ?? null,
                'competencia' => $data['competencia'] ?? '',
                'obs' => $data['obs'] ?? '',
                'is_confirmed' => $data['is_confirmed'] ?? false,
                'confirmed_at' => ($data['confirmed_at'] ?? null) ?: null,
            ]);
            $empreita->save();

            $chaveParaId = TipoCusto::pluck('id', 'chave');

            $keepItens = [];
            foreach ((array) ($data['itens'] ?? []) as $i => $raw) {
                $id = $raw['id'] ?? (string) Str::uuid();
                $keepItens[] = $id;

                EmpreitaItem::updateOrCreate(['id' => $id], [
                    'empreita_id' => $empreita->id,
                    'ordem' => $i,
                    'eap_item_id' => $raw['eapId'] ?? null,
                    'tipo_custo_id' => $chaveParaId[$raw['tipo'] ?? ''] ?? null,
                    'qtde_contratada' => $raw['qtdeContratada'] ?? null,
                    'descricao' => $raw['desc'] ?? '',
                    'contrato_emp' => $raw['contratoEmp'] ?? 0,
                    'contrato_reserva' => $raw['contratoReserva'] ?? 0,
                    'medicao_acum' => $raw['medicaoAcum'] ?? 0,
                    'medicao_atual' => $raw['medicaoAtual'] ?? null,
                    'pagamento_emp' => $raw['pagamentoEmp'] ?? null,
                    'pagamento_reserva' => $raw['pagamentoReserva'] ?? null,
                ]);
            }
            $empreita->itens()->whereNotIn('id', $keepItens ?: ['__none__'])->delete();
        });

        return $empreita->load('itens.tipoCusto');
    }

    /**
     * POST /api/empreitas/{empreita}/registros
     * Registra uma medição (equivalente a registrarMedicaoPagamento() em
     * js/empreita/14-empreita-app.js): cria empreita_registros + linhas +
     * tipos dentro de uma transação.
     */
    public function registrarMedicao(Request $request, Empreita $empreita)
    {
        $data = $request->validate([
            'data_medicao' => 'nullable|date',
            'competencia' => 'nullable|string|max:30',
            'obs' => 'nullable|string',
            'linhas' => 'required|array',
            'total_pagar_emp' => 'nullable|numeric',
            'total_reservar_pgto' => 'nullable|numeric',
            'total_periodo' => 'nullable|numeric',
        ]);

        $registro = DB::transaction(function () use ($data, $empreita) {
            $registro = $empreita->registros()->create([
                'data_medicao' => $data['data_medicao'] ?? null,
                'competencia' => $data['competencia'] ?? '',
                'obs' => $data['obs'] ?? '',
                'total_pagar_emp' => $data['total_pagar_emp'] ?? 0,
                'total_reservar_pgto' => $data['total_reservar_pgto'] ?? 0,
                'total_periodo' => $data['total_periodo'] ?? 0,
            ]);

            foreach ($data['linhas'] as $i => $linha) {
                $linhaModel = $registro->linhas()->create([
                    'ordem' => $i,
                    'empreita_item_id' => $linha['empreitaItemId'] ?? null,
                    'eap_item_id' => $linha['eapItemId'] ?? null,
                    'descricao' => $linha['descricao'] ?? '',
                    'total_pagar_emp' => $linha['totalPagarEmp'] ?? 0,
                    'total_reservar_pgto' => $linha['totalReservarPgto'] ?? 0,
                    'total_periodo' => $linha['totalPeriodo'] ?? 0,
                ]);

                foreach ((array) ($linha['porTipo'] ?? []) as $chave => $t) {
                    $tipoId = TipoCusto::where('chave', $chave)->value('id');
                    if (!$tipoId) continue;
                    $linhaModel->tipos()->create([
                        'tipo_custo_id' => $tipoId,
                        'from_percent' => $t['from'] ?? 0,
                        'to_percent' => $t['to'] ?? 0,
                        'avanco_percent' => $t['avanco'] ?? 0,
                        'pagar_valor' => $t['pagar'] ?? 0,
                        'reservar_valor' => $t['reservar'] ?? 0,
                    ]);
                }
            }

            return $registro;
        });

        return $registro->load('linhas.tipos');
    }
}
