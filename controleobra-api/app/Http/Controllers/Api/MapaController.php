<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Mapa;
use App\Models\MapaFornecedor;
use App\Models\MapaItem;
use App\Models\Obra;
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

        // 31/08/2026, "Controle de permissões" — o middleware de rota só
        // protege `permissaoModulo` aqui (essa listagem cruza várias
        // obras, não dá pra checar `permissaoObra` de uma vez só). Acesso
        // por obra é "aberto por exceção" (ver `PermissaoService::podeObra`):
        // um usuário secundário enxerga mapas de toda obra, EXCETO as que
        // têm uma linha explícita negando `pode_ver` — admin nunca filtra.
        $usuario = $request->user();
        if ($usuario && !$usuario->ehAdmin()) {
            $obraIdsNegados = $usuario->obraAcessos()->where('pode_ver', false)->pluck('obra_id');
            $query->whereNotIn('obra_id', $obraIdsNegados);
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

    /**
     * Código interno único do mapa — "MAPA-{código da obra}-{nº do
     * mapa}" (21/08/2026, pedido do Lucas — antes era "MAPA-NNN"
     * sequencial no sistema inteiro, sem nenhuma relação com a obra).
     * Só é gerado na criação, nunca reescrito depois (ver chamada
     * abaixo). A composição já garante unicidade sozinha — o código da
     * obra é único (`obras.map_number` tem UNIQUE) e o nº do mapa é
     * único dentro da obra (`MapasObra`/`MapaStore.duplicar()` sempre
     * geram o próximo sequencial da obra) — mas a coluna `codigo`
     * continua com UNIQUE no banco como rede de segurança final: se duas
     * requisições concorrentes gerarem o mesmo nº pro mesmo mapa, o
     * segundo INSERT falha em vez de duplicar o código silenciosamente.
     */
    private function gerarCodigo(?string $obraId, string $numeroMapa): string
    {
        $codigoObra = $obraId ? Obra::find($obraId)?->map_number : null;
        $codigoObra = $codigoObra ?: 'SEMOBRA';
        $numero = $numeroMapa !== '' ? $numeroMapa : '00';

        return "MAPA-{$codigoObra}-{$numero}";
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
            'freteiro_particular' => 'nullable|string|max:120',
            'lancar_frete_como_item' => 'nullable|boolean',
            'frete_etapa_id' => 'nullable|string|exists:eap_itens,id',
            'frete_categoria_tipo' => 'nullable|string|in:material,maoDeObra,equipamento,outros,administracao',
            'modo_manual' => 'nullable|boolean',
            'is_confirmed' => 'nullable|boolean',
            'confirmed_at' => 'nullable|date',
            'ultima_finalizacao_em' => 'nullable|date',
            'total_mapa' => 'nullable|numeric',
            'fornecedores' => 'nullable|array',
            'itens' => 'nullable|array',
        ]);

        DB::transaction(function () use ($data, $mapa, $request) {
            $ehNovo = !$mapa->exists;
            $obraIdFinal = $data['obra_id'] ?? $mapa->obra_id;
            $numeroMapaFinal = $data['numero_mapa'] ?? '';

            $mapa->fill([
                'codigo' => $ehNovo ? $this->gerarCodigo($obraIdFinal, $numeroMapaFinal) : $mapa->codigo,
                'obra_id' => $obraIdFinal,
                'numero_mapa' => $numeroMapaFinal,
                'descricao' => $data['descricao'] ?? '',
                'cliente' => $data['cliente'] ?? '',
                'responsavel_mapa' => $data['responsavel_mapa'] ?? '',
                'responsavel_obra' => $data['responsavel_obra'] ?? '',
                'data_finalizacao' => $data['data_finalizacao'] ?? null,
                'data_necessidade' => $data['data_necessidade'] ?? null,
                'frete_particular' => $data['frete_particular'] ?? 0,
                'freteiro_particular' => $data['freteiro_particular'] ?? null,
                'lancar_frete_como_item' => $data['lancar_frete_como_item'] ?? true,
                'frete_etapa_id' => $data['frete_etapa_id'] ?? null,
                'frete_categoria_tipo' => $data['frete_categoria_tipo'] ?? null,
                'modo_manual' => $data['modo_manual'] ?? false,
                'is_confirmed' => $data['is_confirmed'] ?? $mapa->is_confirmed ?? false,
                // "Finalização do mapa" trava na PRIMEIRA finalização e nunca
                // mais muda (20/08/2026, pedido do Lucas — antes era
                // regravada a cada "Finalizar mapa", perdendo a data
                // original sempre que o mapa era reaberto e finalizado de
                // novo). Por isso a ordem aqui é invertida em relação aos
                // outros campos: só aceita o valor do payload enquanto
                // `$mapa->confirmed_at` ainda não existe.
                'confirmed_at' => $mapa->confirmed_at ?? ($data['confirmed_at'] ?? null),
                // "Última edição" é o par que acompanha toda finalização
                // (inclusive a primeira) — grava livremente o que vier do
                // frontend, sem a trava acima.
                'ultima_finalizacao_em' => $data['ultima_finalizacao_em'] ?? $mapa->ultima_finalizacao_em,
                'total_mapa' => $data['total_mapa'] ?? 0,
            ]);
            $mapa->save();

            // fornecedores (ex.: [{id?, fornecedor, contato, impostoPercent, frete, desconto, descontoParcial, ativo}])
            //
            // Importante (04/08/2026, investigação de mapas de teste que
            // sumiram): só mexe nos fornecedores existentes se a chave
            // "fornecedores" vier de fato no payload. Antes, um payload sem
            // essa chave caía no `?? []` e o passo de limpeza abaixo
            // apagava TODOS os fornecedores do mapa — destrutivo para
            // qualquer chamador futuro (ou qualquer PUT parcial) que não
            // reenvie a lista inteira a cada gravação.
            if ($request->has('fornecedores')) {
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
            } else {
                // Sem a chave no payload: mantém os fornecedores atuais,
                // só reconstrói o mapa índice->id pra casar os preços dos
                // itens (também opcionais) com quem já existe no banco.
                $fornecedorIdMap = $mapa->fornecedores()->orderBy('ordem')
                    ->pluck('id', 'ordem')->all();
            }

            // itens (ex.: [{id?, descricao, tipoCustoId, quantidade, unidade, eapItemId, modoEtapa,
            //               precos: [{fornecedorIndex, valorUnitario, comprar}], etapas: [{eapItemId, valor}]}])
            //
            // Mesma proteção do bloco de fornecedores acima: só sincroniza
            // (e portanto só apaga o que não vier na lista) se "itens" foi
            // de fato enviado no payload.
            if ($request->has('itens')) {
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
            }
        });

        return $mapa->load(['fornecedores.precos', 'itens.precos', 'itens.etapas']);
    }
}
