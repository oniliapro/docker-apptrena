<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Mapa;
use App\Models\MapaFornecedor;
use App\Models\MapaItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CRUD de mapas de cotação. Hoje o frontend (js/mapa/*) só persiste um
 * RESUMO de cada mapa em controleObra.mapas.v1 (ver salvarMapaNaLista em
 * js/mapa/07-app.js) — a tela de edição em si (fornecedores, itens, preços,
 * etapas) vive só em memória do navegador enquanto a página está aberta.
 * Este controller já expõe o modelo completo (fornecedores/itens/preços/
 * etapas) via `store`/`update`, para quando o editor de mapa passar a
 * persistir no backend em vez de só no fechamento ("Finalizar mapa").
 */
class MapaController extends Controller
{
    /** GET /api/mapas — aceita `obra_id` para listar só os mapas de uma obra. */
    public function index(Request $request)
    {
        $query = Mapa::orderBy('numero_mapa');
        if ($request->filled('obra_id')) {
            $query->where('obra_id', $request->query('obra_id'));
        }
        return $query->get();
    }

    public function show(Mapa $mapa)
    {
        return $mapa->load(['fornecedores.precos', 'itens.precos', 'itens.etapas']);
    }

    public function store(Request $request)
    {
        return $this->syncCompleto($request, new Mapa());
    }

    public function update(Request $request, Mapa $mapa)
    {
        return $this->syncCompleto($request, $mapa);
    }

    public function destroy(Mapa $mapa)
    {
        $mapa->delete();
        return response()->noContent();
    }

    private function syncCompleto(Request $request, Mapa $mapa)
    {
        $data = $request->validate([
            'obra_id' => 'nullable|string|exists:obras,id',
            'numero_mapa' => 'nullable|string|max:50',
            'descricao' => 'nullable|string',
            'cliente' => 'nullable|string|max:120',
            'responsavel_mapa' => 'nullable|string|max:120',
            'responsavel_obra' => 'nullable|string|max:120',
            'data_finalizacao' => 'nullable|date',
            'data_necessidade' => 'nullable|date',
            'frete_particular' => 'nullable|numeric',
            'modo_manual' => 'nullable|boolean',
            'total_mapa' => 'nullable|numeric',
            'fornecedores' => 'nullable|array',
            'itens' => 'nullable|array',
        ]);

        DB::transaction(function () use ($data, $mapa) {
            $mapa->fill([
                'obra_id' => $data['obra_id'] ?? $mapa->obra_id,
                'numero_mapa' => $data['numero_mapa'] ?? '',
                'descricao' => $data['descricao'] ?? '',
                'cliente' => $data['cliente'] ?? '',
                'responsavel_mapa' => $data['responsavel_mapa'] ?? '',
                'responsavel_obra' => $data['responsavel_obra'] ?? '',
                'data_finalizacao' => $data['data_finalizacao'] ?? null,
                'data_necessidade' => $data['data_necessidade'] ?? null,
                'frete_particular' => $data['frete_particular'] ?? 0,
                'modo_manual' => $data['modo_manual'] ?? false,
                'total_mapa' => $data['total_mapa'] ?? 0,
            ]);
            $mapa->save();

            // fornecedores (ex.: [{id?, fornecedor, contato, impostoPercent, frete, desconto, descontoParcial, ativo}])
            $fornecedorIdMap = []; // índice do payload -> id real (para casar com precos/escolhaFornecedor depois)
            $keepFornecedores = [];
            foreach ((array) ($data['fornecedores'] ?? []) as $i => $f) {
                $id = $f['id'] ?? (string) Str::uuid();
                $fornecedorIdMap[$i] = $id;
                $keepFornecedores[] = $id;

                MapaFornecedor::updateOrCreate(['id' => $id], [
                    'mapa_id' => $mapa->id,
                    'ordem' => $i,
                    'fornecedor' => $f['fornecedor'] ?? '',
                    'contato' => $f['contato'] ?? '',
                    'imposto_percent' => $f['impostoPercent'] ?? 0,
                    'frete' => $f['frete'] ?? 0,
                    'desconto' => $f['desconto'] ?? 0,
                    'desconto_parcial' => $f['descontoParcial'] ?? 0,
                    'ativo' => $f['ativo'] ?? true,
                ]);
            }
            $mapa->fornecedores()->whereNotIn('id', $keepFornecedores ?: ['__none__'])->delete();

            // itens (ex.: [{id?, descricao, tipoCustoId, quantidade, unidade, eapItemId, modoEtapa,
            //               precos: [{fornecedorIndex, valorUnitario, comprar}], etapas: [{eapItemId, valor}]}])
            $keepItens = [];
            foreach ((array) ($data['itens'] ?? []) as $i => $raw) {
                $id = $raw['id'] ?? (string) Str::uuid();
                $keepItens[] = $id;

                $escolhaFornecedorId = isset($raw['fornecedorEscolhidoIndex'])
                    ? ($fornecedorIdMap[$raw['fornecedorEscolhidoIndex']] ?? null)
                    : null;

                $item = MapaItem::updateOrCreate(['id' => $id], [
                    'mapa_id' => $mapa->id,
                    'ordem' => $i,
                    'descricao' => $raw['descricao'] ?? '',
                    'tipo_custo_id' => $raw['tipoCustoId'] ?? null,
                    'quantidade' => $raw['quantidade'] ?? 0,
                    'unidade' => $raw['unidade'] ?? '',
                    'etapa' => $raw['etapa'] ?? '',
                    'eap_item_id' => $raw['eapItemId'] ?? null,
                    'modo_etapa' => $raw['modoEtapa'] ?? 'percentual',
                    'escolha_fornecedor_id' => $escolhaFornecedorId,
                ]);

                $keepPrecos = [];
                foreach ((array) ($raw['precos'] ?? []) as $preco) {
                    $fornecedorId = $fornecedorIdMap[$preco['fornecedorIndex'] ?? null] ?? null;
                    if (!$fornecedorId) continue;
                    $keepPrecos[] = $fornecedorId;
                    $item->precos()->updateOrCreate(
                        ['fornecedor_id' => $fornecedorId],
                        ['valor_unitario' => $preco['valorUnitario'] ?? 0, 'comprar' => $preco['comprar'] ?? false]
                    );
                }
                $item->precos()->whereNotIn('fornecedor_id', $keepPrecos ?: ['__none__'])->delete();

                $keepEtapas = [];
                foreach ((array) ($raw['etapas'] ?? []) as $ordemEtapa => $etapa) {
                    $etapaId = $etapa['id'] ?? (string) Str::uuid();
                    $keepEtapas[] = $etapaId;
                    $item->etapas()->updateOrCreate(['id' => $etapaId], [
                        'ordem' => $ordemEtapa,
                        'eap_item_id' => $etapa['eapItemId'] ?? null,
                        'valor' => $etapa['valor'] ?? 0,
                    ]);
                }
                $item->etapas()->whereNotIn('id', $keepEtapas ?: ['__none__'])->delete();
            }
            $mapa->itens()->whereNotIn('id', $keepItens ?: ['__none__'])->delete();
        });

        return $mapa->load(['fornecedores.precos', 'itens.precos', 'itens.etapas']);
    }
}
