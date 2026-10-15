<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AgendaEvento;
use App\Models\Arquivo;
use App\Models\Empreita;
use App\Models\EmpreitaItem;
use App\Models\Obra;
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
        // `obra:id,obra_nome` (14/09/2026) — card "Empreitas" do dashboard.
        // Total/Pago/Saldo continuam calculados no frontend (ver
        // `EmpreitasObra.total/totalPago/saldo`) — não duplicar aquela
        // regra aqui.
        $query = Empreita::with('obra:id,obra_nome')->orderBy('numero_empreita');
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

        return $query->get()->map(function (Empreita $empreita) {
            $array = $empreita->toArray();
            $array['obra_nome'] = $array['obra']['obra_nome'] ?? '';
            unset($array['obra']);
            return $array;
        })->values();
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
            'previsao_conclusao' => 'nullable|date',
            'competencia' => 'nullable|string|max:30',
            'obs' => 'nullable|string',
            'is_confirmed' => 'nullable|boolean',
            'confirmed_at' => 'nullable|date',
            'pagamento_iniciado' => 'nullable|boolean',
            'pagamento_iniciado_at' => 'nullable|date',
            'medicao_habilitada' => 'nullable|boolean',
            'itens' => 'nullable|array',
        ]);

        DB::transaction(function () use ($data, $empreita) {
            // 03/09/2026, pedido do Lucas: numeração e nº da obra deixam de
            // ser digitados à mão — `obra_number` sempre reflete
            // `Obra.map_number` (mesmo padrão de Mapa/Pagamentos/
            // Recebimentos), os dois travados pra sempre (o que vier de
            // `$data` pra esses 2 campos é ignorado). Só calculados na
            // CRIAÇÃO — numa atualização, os valores já gravados na
            // empreita são preservados como estão.
            //
            // 15/10/2026, pedido do Lucas: `numero_empreita` passou a ser só
            // `EMP-0001`, com a sequência POR OBRA (antes `OBR-{map_number}-
            // EMP-001` — como `map_number` já é "OBR-011", saía
            // "OBR-OBR-011-EMP-001"). O próximo número é o MAIOR já usado na
            // obra + 1 (não `count()+1`: excluir uma empreita do meio fazia o
            // contador repetir um número que ainda existia).
            $souCriacao = !$empreita->exists;
            $obraId = $data['obra_id'] ?? $empreita->obra_id;

            if ($souCriacao) {
                $obra = $obraId ? Obra::find($obraId) : null;
                $codigoObra = $obra ? trim((string) $obra->map_number) : '';
                if ($codigoObra === '') $codigoObra = 'SN';

                $maior = Empreita::where('obra_id', $obraId)
                    ->pluck('numero_empreita')
                    ->map(fn ($numero) => preg_match('/(\d+)\s*$/', (string) $numero, $m) ? (int) $m[1] : 0)
                    ->max() ?? 0;

                $obraNumber = $codigoObra;
                $numeroEmpreita = sprintf('EMP-%04d', $maior + 1);
            } else {
                $obraNumber = $empreita->obra_number;
                $numeroEmpreita = $empreita->numero_empreita;
            }

            $empreita->fill([
                'obra_id' => $obraId,
                'obra_number' => $obraNumber,
                'numero_empreita' => $numeroEmpreita,
                'empreiteiro' => $data['empreiteiro'] ?? '',
                'descricao_empreita' => $data['descricao_empreita'] ?? '',
                'medicao_date' => $data['medicao_date'] ?? null,
                // Só muda quando o campo vem na requisição (15/10/2026) — quem não manda não apaga.
                'previsao_conclusao' => array_key_exists('previsao_conclusao', $data)
                    ? ($data['previsao_conclusao'] ?: null)
                    : $empreita->previsao_conclusao,
                'competencia' => $data['competencia'] ?? '',
                'obs' => $data['obs'] ?? '',
                'is_confirmed' => $data['is_confirmed'] ?? false,
                'confirmed_at' => ($data['confirmed_at'] ?? null) ?: null,
                'pagamento_iniciado' => $data['pagamento_iniciado'] ?? false,
                'pagamento_iniciado_at' => ($data['pagamento_iniciado_at'] ?? null) ?: null,
                'medicao_habilitada' => $data['medicao_habilitada'] ?? true,
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

        $this->verificarMedicao80($empreita, $request->user());

        return $registro->load('linhas.tipos');
    }

    /**
     * PUT /api/empreitas/{empreita}/contrato-assinado (27/09/2026, pedido do
     * Lucas) — marcar/desmarcar que o contrato desta empreita está assinado.
     * Desmarcar com um contrato já anexado recria o lembrete de assinatura
     * pendente; marcar como assinado apaga o lembrete, se tiver um.
     */
    public function marcarContratoAssinado(Request $request, Empreita $empreita)
    {
        $data = $request->validate(['assinado' => 'required|boolean']);

        if ($data['assinado']) {
            if ($empreita->contrato_agenda_evento_id) {
                AgendaEvento::where('id', $empreita->contrato_agenda_evento_id)->delete();
            }
            $empreita->update([
                'contrato_assinado' => true,
                'contrato_assinado_em' => now(),
                'contrato_agenda_evento_id' => null,
            ]);
        } else {
            $empreita->update(['contrato_assinado' => false, 'contrato_assinado_em' => null]);
            if (Arquivo::where('origem_tipo', 'empreita')->where('origem_id', $empreita->id)->exists()) {
                $this->garantirLembreteContratoPendente($empreita, $request->user());
            }
        }

        return $empreita->fresh();
    }

    /**
     * Garante que existe um lembrete de "assinatura pendente" — chamado por
     * `AnexoController::storeEmpreita` a cada arquivo novo anexado e por
     * `marcarContratoAssinado` ao desmarcar. Não duplica se já existir um
     * lembrete, e não cria nada se o contrato já estiver assinado.
     */
    public function garantirLembreteContratoPendente(Empreita $empreita, $usuario): void
    {
        if ($empreita->contrato_assinado || $empreita->contrato_agenda_evento_id) {
            return;
        }

        $hoje = now()->startOfDay();
        $evento = AgendaEvento::create([
            'empresa_id' => $usuario->empresa_id,
            'obra_id' => $empreita->obra_id,
            'criado_por_id' => $usuario->id,
            'titulo' => "Assinatura pendente — contrato da empreita {$empreita->numero_empreita} ({$empreita->empreiteiro})",
            'descricao' => 'Um contrato foi anexado a esta empreita, mas ainda não foi marcado como assinado.',
            'dia_inteiro' => true,
            'inicio' => $hoje->format('Y-m-d').' 00:00:00',
            'fim' => $hoje->format('Y-m-d').' 23:59:00',
        ]);

        $empreita->update(['contrato_agenda_evento_id' => $evento->id]);
    }

    /**
     * Aviso único (27/09/2026, pedido do Lucas) quando a medição física
     * (ponderada pelo contrato do empreiteiro por item, mesma conta de
     * `empreitas-obra.ts#pctFisicoPorEmpreita`) cruza 80% — hora de
     * providenciar o contrato, se ainda não tiver. `medicao80_alertada`
     * garante que só avisa uma vez, não a cada medição nova depois disso.
     */
    private function verificarMedicao80(Empreita $empreita, $usuario): void
    {
        if ($empreita->medicao80_alertada) {
            return;
        }

        $somaPonderada = 0.0;
        $somaContrato = 0.0;
        foreach ($empreita->itens()->get() as $item) {
            $contrato = (float) $item->contrato_emp;
            if ($contrato <= 0) continue;
            $atual = $item->medicao_atual !== null ? (float) $item->medicao_atual : (float) $item->medicao_acum;
            $somaPonderada += $atual * $contrato;
            $somaContrato += $contrato;
        }
        if ($somaContrato <= 0) {
            return;
        }

        $percentual = $somaPonderada / $somaContrato;
        if ($percentual < 80) {
            return;
        }

        $hoje = now()->startOfDay();
        AgendaEvento::create([
            'empresa_id' => $usuario->empresa_id,
            'obra_id' => $empreita->obra_id,
            'criado_por_id' => $usuario->id,
            'titulo' => sprintf('Medição física em %d%% — empreita %s (%s)', round($percentual), $empreita->numero_empreita, $empreita->empreiteiro),
            'descricao' => 'A medição física já passou de 80% — hora de providenciar o contrato, se ainda não tiver um.',
            'dia_inteiro' => true,
            'inicio' => $hoje->format('Y-m-d').' 00:00:00',
            'fim' => $hoje->format('Y-m-d').' 23:59:00',
        ]);

        $empreita->update(['medicao80_alertada' => true]);
    }
}
