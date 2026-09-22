<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EapItem;
use App\Models\Obra;
use App\Models\ObraAcesso;
use App\Models\Pasta;
use App\Models\Tag;
use App\Models\TipoCusto;
use App\Models\User;
use App\Services\PastaRaizes;
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
    /**
     * 31/08/2026, "Controle de permissões" — obra é "aberta por exceção":
     * um usuário secundário vê toda obra, EXCETO as que têm uma linha
     * explícita negando `pode_ver` (ver `PermissaoService::podeObra`).
     * Pedido do Lucas: quem não acessa uma obra não pode nem enxergá-la
     * na lista.
     */
    public function index(Request $request)
    {
        $query = Obra::orderBy('obra_nome');

        $usuario = $request->user();
        if ($usuario && !$usuario->ehAdmin()) {
            $obraIdsNegados = $usuario->obraAcessos()->where('pode_ver', false)->pluck('obra_id');
            $query->whereNotIn('id', $obraIdsNegados);
        }

        return $query->get();
    }

    public function store(Request $request)
    {
        $obra = Obra::create($this->validated($request));
        $this->criarPastasDeTagsAtivas($obra);

        return response()->json($obra, 201);
    }

    /**
     * 06/09/2026 — tags cadastradas ANTES desta obra existir também
     * ganham uma pasta aqui (o oposto do que `TagController::store` faz
     * pras obras que já existiam quando a tag foi criada). Sem isso, uma
     * tag só apareceria em obras que já existiam no momento em que ela
     * foi cadastrada.
     */
    private function criarPastasDeTagsAtivas(Obra $obra): void
    {
        $compartilhada = PastaRaizes::compartilhada($obra);

        foreach (Tag::where('ativo', true)->get() as $tag) {
            Pasta::firstOrCreate(
                ['obra_id' => $obra->id, 'tag_id' => $tag->id],
                ['parent_id' => $compartilhada->id, 'owner_user_id' => null, 'nome' => $tag->nome],
            );
        }
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
        // Atenção: o middleware global ConvertEmptyStringsToNull (ativo por
        // padrão no Laravel, ver bootstrap/app.php) troca toda string vazia
        // "" recebida na requisição por null ANTES da validação rodar. E
        // como uma regra tipo 'string' (sem 'required') é simplesmente
        // pulada quando o valor é null, esse null passa reto pela
        // validação e chega em Obra::create() — quebrando o insert nas
        // colunas abaixo, que são NOT NULL no banco com default ''
        // (ver migration 2024_01_01_000000_create_controle_obra_schema.php).
        // Corrigir só a regra de validação (tirar 'nullable') NÃO resolve,
        // porque o problema é anterior à validação. Por isso, depois do
        // validate(), forçamos de volta pra string vazia qualquer uma
        // dessas colunas que tenha vindo null.
        //
        // BUG CORRIGIDO EM 03/08/2026: esse loop usava `$data[$campo] ??
        // ''` sem checar se $campo sequer existia em $data — e
        // ->validated() só inclui uma chave quando ela veio na requisição.
        // Resultado: um PUT parcial tipo `{status: 'em_andamento'}` (usado
        // pela troca de status inline na lista de Obras) recriava
        // obra_nome/cliente/responsavel/etc. como '' e o
        // $obra->update($data) apagava esses campos na obra inteira,
        // mesmo eles não fazendo parte do payload. Agora só normaliza um
        // campo se ele de fato veio na requisição — update parcial
        // continua parcial.
        $data = $request->validate([
            'map_number' => 'nullable|string|max:50',
            'obra_nome' => 'nullable|string|max:180',
            'cliente' => 'nullable|string|max:120',
            'data_base' => 'nullable|date',
            'prazo_meses' => 'nullable|integer|min:1|max:600',
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
            'status' => 'nullable|in:' . implode(',', Obra::STATUS_OPCOES),
        ]);

        foreach (['obra_nome', 'cliente', 'responsavel', 'local_obra', 'periodo'] as $campo) {
            if (array_key_exists($campo, $data)) {
                $data[$campo] = $data[$campo] ?? '';
            }
        }

        return $data;
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
        $obra->load(['bdiPorTipo', 'uiConfig', 'tiposVisiveis', 'eapItens.custosPorTipo', 'eapItens.orcadosCongelados']);

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

            // Ausência de qualquer linha em orcadosCongelados = item nunca
            // confirmado (ou EAP reaberta depois) — Orçado continua ao vivo.
            $orcadoCongelado = null;
            if ($item->orcadosCongelados->isNotEmpty()) {
                $orcadoCongelado = [];
                foreach ($tipos as $chave) {
                    $tipoId = TipoCusto::where('chave', $chave)->value('id');
                    $congelado = $item->orcadosCongelados->firstWhere('tipo_custo_id', $tipoId);
                    $orcadoCongelado[$chave] = (float) ($congelado->valor ?? 0);
                }
            }

            return [
                'id' => $item->id,
                'isGroup' => (bool) $item->is_group,
                'nivel' => (int) $item->nivel,
                'adicional' => (bool) $item->adicional,
                'eap' => $item->codigo_eap,
                'desc' => $item->descricao,
                'qtde' => (float) $item->quantidade,
                'unid' => $item->unidade,
                'unit' => $unit,
                'bdiMode' => $item->bdi_mode,
                'bdiPercent' => (float) $item->bdi_percent,
                'bdiValue' => (float) $item->bdi_value,
                'orcadoCongelado' => $orcadoCongelado,
                // Fórmulas das células (F5): só as que existem; ausente = tudo número comum.
                'formulas' => !empty($item->formulas) ? $item->formulas : null,
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
                'modoTotais' => $obra->uiConfig->modo_totais ?? 'detalhado',
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
                'modo_totais' => $ui['modoTotais'] ?? 'detalhado',
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
                        'nivel' => $raw['nivel'] ?? 0,
                        'adicional' => $raw['adicional'] ?? false,
                        'codigo_eap' => $raw['eap'] ?? '',
                        'descricao' => $raw['desc'] ?? '',
                        'quantidade' => $raw['qtde'] ?? 0,
                        'unidade' => $raw['unid'] ?? '',
                        'bdi_mode' => $raw['bdiMode'] ?? 'pct',
                        'bdi_percent' => $raw['bdiPercent'] ?? 0,
                        'bdi_value' => $raw['bdiValue'] ?? 0,
                        'formulas' => $this->formulasValidas($raw['formulas'] ?? null),
                    ]
                );

                foreach ((array) ($raw['unit'] ?? []) as $chave => $valor) {
                    if (!isset($tipoIds[$chave])) continue;
                    $item->custosPorTipo()->updateOrCreate(
                        ['tipo_custo_id' => $tipoIds[$chave]],
                        ['valor_unitario' => $valor]
                    );
                }

                // Orçado congelado: presente (não-null) => grava/atualiza o
                // snapshot; ausente => apaga (item foi reaberto/nunca
                // confirmado, volta a recalcular ao vivo).
                if (isset($raw['orcadoCongelado']) && is_array($raw['orcadoCongelado'])) {
                    foreach ($raw['orcadoCongelado'] as $chave => $valor) {
                        if (!isset($tipoIds[$chave])) continue;
                        $item->orcadosCongelados()->updateOrCreate(
                            ['tipo_custo_id' => $tipoIds[$chave]],
                            ['valor' => $valor]
                        );
                    }
                } else {
                    $item->orcadosCongelados()->delete();
                }
            }

            // remove itens que não vieram mais no payload (mesma semântica de "array é a fonte da verdade")
            $obra->eapItens()->whereNotIn('id', $keepIds)->delete();
        });

        return $this->showEap($obra);
    }

    /**
     * GET /api/obras/{obra}/acessos (31/08/2026, "Controle de
     * permissões") — todo usuário secundário da empresa, com
     * `podeVer`/`podeLancar` NESTA obra. Sem linha em `obra_acessos` =
     * acesso liberado por padrão (`true`) — o modelo é "aberto por
     * exceção" (ver `PermissaoService::podeObra`): por padrão todo
     * mundo acessa toda obra, só quem tem uma linha explícita fica
     * restrito.
     */
    /**
     * Fórmulas de um item da EAP (F5): só pares campo => texto, ambos strings
     * não vazios. Qualquer outra coisa vira `null` (item sem fórmulas). O texto
     * em si é validado no frontend (motor de fórmulas); aqui só se garante o
     * formato e um limite de tamanho.
     */
    private function formulasValidas(mixed $bruto): ?array
    {
        if (!is_array($bruto)) return null;

        $limpas = [];
        foreach ($bruto as $campo => $texto) {
            if (!is_string($campo) || !is_string($texto)) continue;
            $texto = trim($texto);
            if ($texto === '' || strlen($texto) > 2000) continue;
            $limpas[$campo] = $texto;
        }

        return $limpas ?: null;
    }

    public function listarAcessos(Request $request, Obra $obra)
    {
        $this->garantirPodeGerenciar($request);

        $acessos = $obra->acessos()->get()->keyBy('user_id');

        return User::where('empresa_id', $obra->empresa_id)
            ->where('papel', 'secundario')
            ->orderBy('name')
            ->get()
            ->map(function (User $usuario) use ($acessos) {
                $acesso = $acessos->get($usuario->id);
                return [
                    'userId' => $usuario->id,
                    'nome' => $usuario->name,
                    'email' => $usuario->email,
                    'podeVer' => $acesso ? (bool) $acesso->pode_ver : true,
                    'podeLancar' => $acesso ? (bool) $acesso->pode_lancar : true,
                ];
            })
            ->values();
    }

    /** PUT /api/obras/{obra}/acessos — grava em lote, upsert por usuário. */
    public function syncAcessos(Request $request, Obra $obra)
    {
        $this->garantirPodeGerenciar($request);

        $data = $request->validate([
            'usuarios' => 'required|array',
            'usuarios.*.userId' => 'required|integer|exists:users,id',
            'usuarios.*.podeVer' => 'nullable|boolean',
            'usuarios.*.podeLancar' => 'nullable|boolean',
        ]);

        foreach ($data['usuarios'] as $linha) {
            ObraAcesso::updateOrCreate(
                ['obra_id' => $obra->id, 'user_id' => $linha['userId']],
                [
                    'empresa_id' => $obra->empresa_id,
                    'pode_ver' => $linha['podeVer'] ?? false,
                    'pode_lancar' => $linha['podeLancar'] ?? false,
                ],
            );
        }

        return $this->listarAcessos($request, $obra);
    }

    private function garantirPodeGerenciar(Request $request): User
    {
        $ator = $request->user();
        abort_unless($ator && ($ator->ehAdmin() || $ator->pode_gerenciar_permissoes), 403, 'Sem permissão para gerenciar acessos.');
        return $ator;
    }
}
