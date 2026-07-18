<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EapItem;
use App\Models\Obra;
use App\Models\TipoCusto;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CRUD padrão de obras + os dois endpoints principais de integração com o
 * frontend atual: GET/PUT /api/obras/{obra}/eap, que falam exatamente o
 * mesmo "dialeto" JSON que hoje vive em localStorage/storage.php na chave
 * controleObra.eap.v2 (ver js/eap/02-state-utils.js: salvarEstadoObra /
 * carregarEstadoObra). Isso permite, no futuro, trocar
 * `storageEap.getItem/setItem` por uma chamada fetch a estas rotas sem
 * reescrever a lógica de tela.
 */
class ObraController extends Controller
{
    public function index()
    {
        return Obra::orderBy('obra_nome')->get();
    }

    public function store(Request $request)
    {
        $obra = Obra::create($this->validated($request));
        return response()->json($obra, 201);
    }

    public function show(Obra $obra)
    {
        return $obra->load(['bdiPorTipo', 'uiConfig', 'tiposVisiveis', 'eapItens.custosPorTipo']);
    }

    public function update(Request $request, Obra $obra)
    {
        $obra->update($this->validated($request));
        return $obra;
    }

    public function destroy(Obra $obra)
    {
        $obra->delete();
        return response()->noContent();
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'map_number' => 'nullable|string|max:50',
            'obra_nome' => 'nullable|string|max:180',
            'cliente' => 'nullable|string|max:120',
            'data_base' => 'nullable|date',
            'responsavel' => 'nullable|string|max:120',
            'local_obra' => 'nullable|string|max:180',
            'periodo' => 'nullable|string|max:80',
            'obs' => 'nullable|string',
            'bdi_scope' => 'nullable|in:global,category,item',
            'bdi_mode' => 'nullable|in:pct,value',
            'bdi_percent' => 'nullable|numeric',
            'bdi_value' => 'nullable|numeric',
            'is_confirmed' => 'nullable|boolean',
            'confirmed_at' => 'nullable|date',
        ]);
    }

    /**
     * GET /api/obras/{obra}/eap
     * Reconstrói o JSON { header, ui, eapItems } a partir das tabelas
     * relacionais — mesma forma que o frontend espera ao ler
     * controleObra.eap.v2.
     */
    public function showEap(Obra $obra)
    {
        $tipos = TipoCusto::orderBy('ordem')->pluck('chave')->all();
        $obra->load(['bdiPorTipo', 'uiConfig', 'tiposVisiveis', 'eapItens.custosPorTipo']);

        $bdiByType = [];
        foreach ($tipos as $chave) {
            $row = $obra->bdiPorTipo->firstWhere('tipo_custo_id', TipoCusto::where('chave', $chave)->value('id'));
            $bdiByType[$chave] = [
                'mode' => $row->bdi_mode ?? 'pct',
                'percent' => (float) ($row->bdi_percent ?? 0),
                'value' => (float) ($row->bdi_value ?? 0),
            ];
        }

        $visibleTypes = [];
        foreach ($tipos as $chave) {
            $tipoId = TipoCusto::where('chave', $chave)->value('id');
            $row = $obra->tiposVisiveis->firstWhere('tipo_custo_id', $tipoId);
            $visibleTypes[$chave] = $row ? (bool) $row->visivel : true;
        }

        $eapItems = $obra->eapItens->map(function (EapItem $item) use ($tipos) {
            $unit = [];
            foreach ($tipos as $chave) {
                $tipoId = TipoCusto::where('chave', $chave)->value('id');
                $custo = $item->custosPorTipo->firstWhere('tipo_custo_id', $tipoId);
                $unit[$chave] = (float) ($custo->valor_unitario ?? 0);
            }

            return [
                'id' => $item->id,
                'isGroup' => (bool) $item->is_group,
                'eap' => $item->codigo_eap,
                'desc' => $item->descricao,
                'qtde' => (float) $item->quantidade,
                'unid' => $item->unidade,
                'unit' => $unit,
                'bdiMode' => $item->bdi_mode,
                'bdiPercent' => (float) $item->bdi_percent,
                'bdiValue' => (float) $item->bdi_value,
            ];
        })->values();

        return response()->json([
            'header' => [
                'mapNumber' => $obra->map_number ?? '',
                'obraNome' => $obra->obra_nome,
                'cliente' => $obra->cliente,
                'dataBase' => optional($obra->data_base)->format('Y-m-d') ?? '',
                'responsavel' => $obra->responsavel,
                'local' => $obra->local_obra,
                'periodo' => $obra->periodo,
                'obs' => $obra->obs,
                'bdiScope' => $obra->bdi_scope,
                'bdiMode' => $obra->bdi_mode,
                'bdiPercent' => (float) $obra->bdi_percent,
                'bdiValue' => (float) $obra->bdi_value,
                'bdiByType' => $bdiByType,
                'isConfirmed' => (bool) $obra->is_confirmed,
                'confirmedAt' => optional($obra->confirmed_at)->format('Y-m-d') ?? '',
            ],
            'ui' => [
                'showUnit' => (bool) ($obra->uiConfig->show_unit ?? true),
                'showTotal' => (bool) ($obra->uiConfig->show_total ?? true),
                'showBDI' => (bool) ($obra->uiConfig->show_bdi ?? true),
                'showTypes' => (bool) ($obra->uiConfig->show_types ?? true),
                'orcRealMode' => $obra->uiConfig->orc_real_mode ?? 'value',
                'visibleTypes' => $visibleTypes,
            ],
            'eapItems' => $eapItems,
        ]);
    }

    /**
     * PUT /api/obras/{obra}/eap
     * Aceita exatamente o payload { header, ui, eapItems } que
     * salvarEstadoObra() em js/eap/02-state-utils.js já produz e grava tudo
     * de forma normalizada, em transação (substitui os itens da EAP por
     * completo — é o mesmo comportamento de "salvar tudo de novo" que o
     * frontend já faz hoje a cada mudança).
     */
    public function syncEap(Request $request, Obra $obra)
    {
        $data = $request->validate([
            'header' => 'required|array',
            'ui' => 'nullable|array',
            'eapItems' => 'nullable|array',
        ]);

        $tipoIds = TipoCusto::pluck('id', 'chave');

        DB::transaction(function () use ($data, $obra, $tipoIds) {
            $header = $data['header'];
            $obra->update([
                'map_number' => $header['mapNumber'] ?? $obra->map_number,
                'obra_nome' => $header['obraNome'] ?? '',
                'cliente' => $header['cliente'] ?? '',
                'data_base' => $header['dataBase'] ?: null,
                'responsavel' => $header['responsavel'] ?? '',
                'local_obra' => $header['local'] ?? '',
                'periodo' => $header['periodo'] ?? '',
                'obs' => $header['obs'] ?? '',
                'bdi_scope' => $header['bdiScope'] ?? 'global',
                'bdi_mode' => $header['bdiMode'] ?? 'pct',
                'bdi_percent' => $header['bdiPercent'] ?? 0,
                'bdi_value' => $header['bdiValue'] ?? 0,
                'is_confirmed' => $header['isConfirmed'] ?? false,
                'confirmed_at' => ($header['confirmedAt'] ?? null) ?: null,
            ]);

            foreach ((array) ($header['bdiByType'] ?? []) as $chave => $bdi) {
                if (!isset($tipoIds[$chave])) continue;
                $obra->bdiPorTipo()->updateOrCreate(
                    ['tipo_custo_id' => $tipoIds[$chave]],
                    [
                        'bdi_mode' => $bdi['mode'] ?? 'pct',
                        'bdi_percent' => $bdi['percent'] ?? 0,
                        'bdi_value' => $bdi['value'] ?? 0,
                    ]
                );
            }

            $ui = $data['ui'] ?? [];
            $obra->uiConfig()->updateOrCreate([], [
                'show_unit' => $ui['showUnit'] ?? true,
                'show_total' => $ui['showTotal'] ?? true,
                'show_bdi' => $ui['showBDI'] ?? true,
                'show_types' => $ui['showTypes'] ?? true,
                'orc_real_mode' => $ui['orcRealMode'] ?? 'value',
            ]);

            foreach ((array) ($ui['visibleTypes'] ?? []) as $chave => $visivel) {
                if (!isset($tipoIds[$chave])) continue;
                $obra->tiposVisiveis()->updateOrCreate(
                    ['tipo_custo_id' => $tipoIds[$chave]],
                    ['visivel' => (bool) $visivel]
                );
            }

            $itemsPayload = $data['eapItems'] ?? [];
            $keepIds = [];

            foreach ($itemsPayload as $ordem => $raw) {
                $id = $raw['id'] ?? (string) Str::uuid();
                $keepIds[] = $id;

                $item = EapItem::updateOrCreate(
                    ['id' => $id],
                    [
                        'obra_id' => $obra->id,
                        'ordem' => $ordem,
                        'is_group' => $raw['isGroup'] ?? false,
                        'codigo_eap' => $raw['eap'] ?? '',
                        'descricao' => $raw['desc'] ?? '',
                        'quantidade' => $raw['qtde'] ?? 0,
                        'unidade' => $raw['unid'] ?? '',
                        'bdi_mode' => $raw['bdiMode'] ?? 'pct',
                        'bdi_percent' => $raw['bdiPercent'] ?? 0,
                        'bdi_value' => $raw['bdiValue'] ?? 0,
                    ]
                );

                foreach ((array) ($raw['unit'] ?? []) as $chave => $valor) {
                    if (!isset($tipoIds[$chave])) continue;
                    $item->custosPorTipo()->updateOrCreate(
                        ['tipo_custo_id' => $tipoIds[$chave]],
                        ['valor_unitario' => $valor]
                    );
                }
            }

            // remove itens que não vieram mais no payload (mesma semântica de "array é a fonte da verdade")
            $obra->eapItens()->whereNotIn('id', $keepIds)->delete();
        });

        return $this->showEap($obra);
    }
}
