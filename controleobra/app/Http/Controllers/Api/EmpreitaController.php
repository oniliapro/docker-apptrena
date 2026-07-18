<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Empreita;
use App\Models\EmpreitaItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CRUD de empreitas (contratos de empreitada). Espelha o que
 * js/empreita/11-empreita-state.js guarda em controleObra.empreita.v1
 * (cabecalhoEmpreita + itensEmpreita), só que decomposto nas tabelas
 * empreitas / empreita_itens / empreita_item_medicoes_tipo.
 */
class EmpreitaController extends Controller
{
    public function index()
    {
        return Empreita::orderBy('numero_empreita')->get();
    }

    public function show(Empreita $empreita)
    {
        return $empreita->load(['itens.medicoesPorTipo', 'itens.contratoPorTipo', 'tiposIncluidos', 'registros.linhas.tipos']);
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
            'descricao_empreita' => 'nullable|string',
            'medicao_date' => 'nullable|date',
            'competencia' => 'nullable|string|max:30',
            'obs' => 'nullable|string',
            'itens' => 'nullable|array',
            'tipos_incluidos' => 'nullable|array', // { chave: true/false } - resolvido no controller pelo tipo_custo_id
        ]);

        DB::transaction(function () use ($data, $empreita) {
            $empreita->fill([
                'obra_id' => $data['obra_id'] ?? $empreita->obra_id,
                'obra_number' => $data['obra_number'] ?? '',
                'numero_empreita' => $data['numero_empreita'] ?? '',
                'descricao_empreita' => $data['descricao_empreita'] ?? '',
                'medicao_date' => $data['medicao_date'] ?? null,
                'competencia' => $data['competencia'] ?? '',
                'obs' => $data['obs'] ?? '',
            ]);
            $empreita->save();

            $keepItens = [];
            foreach ((array) ($data['itens'] ?? []) as $i => $raw) {
                $id = $raw['id'] ?? (string) Str::uuid();
                $keepItens[] = $id;

                // Contrato hoje é discriminado por categoria no frontend
                // (contratoEmpPorTipo/contratoReservaPorTipo — ver task #45).
                // valor_emp/valor_reserva continuam existindo como soma das
                // categorias, para compatibilidade com quem só lê o total.
                $contratoEmpPorTipo = (array) ($raw['contratoEmpPorTipo'] ?? []);
                $contratoReservaPorTipo = (array) ($raw['contratoReservaPorTipo'] ?? []);
                $somaContratoEmp = array_sum($contratoEmpPorTipo) ?: ($raw['valorEmp'] ?? 0);
                $somaContratoReserva = array_sum($contratoReservaPorTipo) ?: ($raw['valorReserva'] ?? 0);

                $item = EmpreitaItem::updateOrCreate(['id' => $id], [
                    'empreita_id' => $empreita->id,
                    'ordem' => $i,
                    'eap_item_id' => $raw['eapId'] ?? null,
                    'descricao' => $raw['desc'] ?? '',
                    'valor_emp' => $somaContratoEmp,
                    'valor_reserva' => $somaContratoReserva,
                    'medicao_acum_legacy' => $raw['medicaoAcum'] ?? 0,
                    'medicao_atual_legacy' => $raw['medicaoAtual'] ?? null,
                ]);

                foreach ((array) ($raw['medicaoAcumByType'] ?? []) as $chave => $valor) {
                    $tipoId = \App\Models\TipoCusto::where('chave', $chave)->value('id');
                    if (!$tipoId) continue;
                    $item->medicoesPorTipo()->updateOrCreate(
                        ['tipo_custo_id' => $tipoId],
                        [
                            'medicao_acum' => $valor,
                            'medicao_atual' => $raw['medicaoAtualByType'][$chave] ?? null,
                        ]
                    );
                }

                $tiposEnvolvidos = array_unique(array_merge(array_keys($contratoEmpPorTipo), array_keys($contratoReservaPorTipo)));
                foreach ($tiposEnvolvidos as $chave) {
                    $tipoId = \App\Models\TipoCusto::where('chave', $chave)->value('id');
                    if (!$tipoId) continue;
                    $item->contratoPorTipo()->updateOrCreate(
                        ['tipo_custo_id' => $tipoId],
                        [
                            'contrato_emp' => $contratoEmpPorTipo[$chave] ?? 0,
                            'contrato_reserva' => $contratoReservaPorTipo[$chave] ?? 0,
                        ]
                    );
                }
            }
            $empreita->itens()->whereNotIn('id', $keepItens ?: ['__none__'])->delete();

            foreach ((array) ($data['tipos_incluidos'] ?? []) as $chave => $ativo) {
                $tipoId = \App\Models\TipoCusto::where('chave', $chave)->value('id');
                if (!$tipoId) continue;
                $empreita->tiposIncluidos()->updateOrCreate(
                    ['tipo_custo_id' => $tipoId],
                    ['ativo' => (bool) $ativo]
                );
            }
        });

        return $empreita->load(['itens.medicoesPorTipo', 'itens.contratoPorTipo', 'tiposIncluidos']);
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
                    $tipoId = \App\Models\TipoCusto::where('chave', $chave)->value('id');
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
