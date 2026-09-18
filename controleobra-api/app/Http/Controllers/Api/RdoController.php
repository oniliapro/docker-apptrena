<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Obra;
use App\Models\RdoComentarioInterno;
use App\Models\RdoContratanteLink;
use App\Models\RdoEquipamento;
use App\Models\RdoEquipamentoCatalogo;
use App\Models\RdoEtapa;
use App\Models\RdoFoto;
use App\Models\RdoMaoDeObra;
use App\Models\RdoObraDados;
use App\Models\RdoOcorrencia;
use App\Models\RdoPendencia;
use App\Models\RdoRegistro;
use App\Models\RdoResponsavelPresente;
use App\Models\RdoTarefa;
use App\Services\PermissaoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Relatório Diário de Obra (RDO) — módulo reconstruído em 17/09/2026.
 *
 * Herda do módulo anterior duas armadilhas do projeto, que continuam valendo:
 *
 *  1. A regra `exists:obras,id` do validator faz SQL direto e NÃO respeita o
 *     global scope multiempresa. Depois de validar, sempre reconfirmar a posse
 *     com Obra::find() (esse passa pelo scope). Sem isso, uma empresa gravaria
 *     RDO na obra de outra só adivinhando o UUID. O mesmo vale para qualquer
 *     id vindo do cliente que referencie tabela de outra empresa (ex.: o
 *     catálogo de equipamentos).
 *  2. Quem assina é sempre a CONTRATADA (o usuário autenticado). O contratante
 *     da obra nunca assina e nunca escreve — só lê, pelo link público.
 *
 * Edição depois de assinado É permitida (decisão da Onilia, 15/09/2026). Foi
 * registrada uma ressalva de que isso enfraquece o diário como prova jurídica,
 * mas a decisão está fechada; por isso `update()` não checa status.
 */
class RdoController extends Controller
{
    /** Relações carregadas em toda resposta de RDO. */
    private const RELACOES = [
        'obra:id,obra_nome,local_obra,cliente',
        'autorUser:id,name',
        'assinadoPor:id,name',
        'tarefas',
        'fotos',
        'maoDeObra',
        'equipamentos',
        'ocorrencias',
        'pendencias',
        'etapas',
        'responsaveisPresentes',
        'comentariosInternos',
    ];

    public function index(Request $request, PermissaoService $permissoes)
    {
        $data = $request->validate([
            'obra_id' => 'nullable|string|exists:obras,id',
            'limite' => 'nullable|integer|min:1|max:100',
        ]);

        $query = RdoRegistro::with(self::RELACOES)
            ->orderByDesc('data')
            ->orderByDesc('numero');

        $usuario = $request->user();

        if (!empty($data['obra_id'])) {
            $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);
            if ($usuario && !$permissoes->podeObra($usuario, $obra->id, 'ver')) {
                abort(403, 'Sem acesso a esta obra.');
            }
            $query->where('obra_id', $obra->id);
        } elseif ($usuario && !$usuario->ehAdmin()) {
            $obraIdsNegados = $usuario->obraAcessos()->where('pode_ver', false)->pluck('obra_id');
            $query->whereNotIn('obra_id', $obraIdsNegados);
        }

        return $query->limit($data['limite'] ?? 30)->get();
    }

    public function show(RdoRegistro $rdo)
    {
        return $rdo->load(self::RELACOES);
    }

    /**
     * Dados que o formulário precisa ANTES de o usuário começar a preencher:
     * cabeçalho da obra, próximo número de RDO e o pré-preenchimento vindo do
     * lançamento anterior (etapas não concluídas e a mão de obra do dia
     * anterior, que na prática muda pouco de um dia para o outro).
     */
    public function preparar(Request $request)
    {
        $data = $request->validate([
            'obra_id' => 'required|string|exists:obras,id',
        ]);

        $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);
        $anterior = RdoRegistro::where('obra_id', $obra->id)
            ->orderByDesc('data')
            ->orderByDesc('numero')
            ->with(['etapas', 'maoDeObra'])
            ->first();

        return [
            'obra' => $obra->only(['id', 'obra_nome', 'local_obra', 'cliente']),
            'cabecalho' => RdoObraDados::where('obra_id', $obra->id)->first(),
            'proximo_numero' => $this->proximoNumero($obra->id),
            'etapas_sugeridas' => $anterior
                ? $anterior->etapas->where('concluida', false)->values()
                    ->map(fn ($e) => ['nome' => $e->nome, 'concluida' => false])
                : [],
            'mao_de_obra_sugerida' => $anterior
                ? $anterior->maoDeObra->map(fn ($m) => [
                    'categoria' => $m->categoria,
                    'funcao' => $m->funcao,
                    'quantidade' => $m->quantidade,
                ])->values()
                : [],
            'equipamentos_catalogo' => RdoEquipamentoCatalogo::orderBy('nome')->get(),
            // Autocomplete de função: as funções que esta empresa já usou em
            // RDOs anteriores. Não há cadastro de profissionais no sistema
            // (verificado em 17/09/2026 — os cadastros de Responsáveis/
            // Empreiteiros nem tabela própria têm, vivem na ponte chave-valor),
            // então a lista se forma sozinha pelo uso, sem tela de cadastro
            // para manter.
            'funcoes_usadas' => RdoMaoDeObra::query()
                ->join('rdo_registros', 'rdo_registros.id', '=', 'rdo_mao_de_obra.rdo_id')
                ->where('rdo_registros.empresa_id', $request->user()->empresa_id)
                ->select('rdo_mao_de_obra.categoria', 'rdo_mao_de_obra.funcao')
                ->distinct()
                ->orderBy('rdo_mao_de_obra.funcao')
                ->get(),
        ];
    }

    public function store(Request $request)
    {
        $data = $this->validarPayload($request, true);
        $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);
        $usuario = $request->user();

        $rdo = DB::transaction(function () use ($data, $obra, $usuario, $request) {
            $rdo = RdoRegistro::create([
                'id' => $data['id'] ?? null,
                'empresa_id' => $usuario->empresa_id,
                'obra_id' => $obra->id,
                'numero' => $this->proximoNumero($obra->id),
                'data' => $data['data'],
                'clima_manha' => $data['clima_manha'] ?? null,
                'clima_tarde' => $data['clima_tarde'] ?? null,
                'clima_noite' => $data['clima_noite'] ?? null,
                'impacto_cronograma' => $data['impacto_cronograma'] ?? null,
                'observacoes' => $data['observacoes'] ?? null,
                'status' => RdoRegistro::STATUS_RASCUNHO,
                'autor_user_id' => $usuario->id,
            ]);

            $this->sincronizarFilhos($rdo, $data, $usuario);
            $this->guardarFotos($rdo, $request, $data);

            return $rdo;
        });

        return response()->json($rdo->fresh(self::RELACOES), 201);
    }

    /**
     * Regrava o RDO inteiro a partir do payload. Os filhos são substituídos
     * (apagados e recriados) porque o formulário sempre manda a lista completa
     * — é mais simples e menos sujeito a divergência do que um diff linha a
     * linha. Fotos já salvas NÃO são apagadas aqui: são removidas uma a uma
     * por `removerFoto`, para não perder arquivo por engano num salvamento.
     */
    public function update(Request $request, RdoRegistro $rdo)
    {
        $data = $this->validarPayload($request, false);
        $usuario = $request->user();

        DB::transaction(function () use ($rdo, $data, $usuario, $request) {
            $rdo->update([
                'data' => $data['data'],
                'clima_manha' => $data['clima_manha'] ?? null,
                'clima_tarde' => $data['clima_tarde'] ?? null,
                'clima_noite' => $data['clima_noite'] ?? null,
                'impacto_cronograma' => $data['impacto_cronograma'] ?? null,
                'observacoes' => $data['observacoes'] ?? null,
            ]);

            $this->sincronizarFilhos($rdo, $data, $usuario, true);
            $this->guardarFotos($rdo, $request, $data);
        });

        return $rdo->fresh(self::RELACOES);
    }

    /**
     * Finalizar É assinar — não existe botão separado (decisão de 08/09/2026).
     * O nome e o CREA de quem assinou ficam congelados no registro: o
     * documento precisa continuar dizendo quem assinou mesmo que o cadastro
     * mude depois.
     */
    public function finalizar(Request $request, RdoRegistro $rdo)
    {
        $usuario = $request->user();

        if ($rdo->estaFinalizado()) {
            return response()->json(['mensagem' => 'Este RDO já está finalizado.'], 422);
        }

        $cabecalho = RdoObraDados::where('obra_id', $rdo->obra_id)->first();

        $rdo->update([
            'status' => RdoRegistro::STATUS_FINALIZADO,
            'assinado_em' => now(),
            'assinado_por_user_id' => $usuario->id,
            'assinante_nome' => $cabecalho?->responsavel_tecnico ?: $usuario->name,
            'assinante_crea' => $cabecalho?->crea,
        ]);

        $this->avisarContratante($rdo);

        return $rdo->fresh(self::RELACOES);
    }

    public function destroy(RdoRegistro $rdo)
    {
        $rdo->load('fotos');

        foreach ($rdo->fotos as $foto) {
            Storage::disk('public')->delete($foto->caminho);
        }

        $rdo->delete();

        return response()->noContent();
    }

    public function removerFoto(RdoRegistro $rdo, string $fotoId)
    {
        $foto = RdoFoto::where('rdo_id', $rdo->id)->findOrFail($fotoId);

        Storage::disk('public')->delete($foto->caminho);
        $foto->delete();

        return response()->noContent();
    }

    // ------------------------------------------------------------------
    // Internos
    // ------------------------------------------------------------------

    /**
     * Confirma que a obra pertence à empresa do usuário. Obra::find() passa
     * pelo global scope multiempresa; `exists:obras,id` do validator não.
     */
    private function obraDaEmpresaOuAborta(string $obraId): Obra
    {
        $obra = Obra::find($obraId);

        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }

        return $obra;
    }

    /** Sequencial por obra — é o "Nº" impresso no documento. */
    private function proximoNumero(string $obraId): int
    {
        $maior = RdoRegistro::where('obra_id', $obraId)->max('numero');

        return (int) $maior + 1;
    }

    private function validarPayload(Request $request, bool $criando): array
    {
        $regras = [
            'id' => 'nullable|string|max:36',
            'data' => 'required|date',
            'clima_manha' => 'nullable|string|in:'.implode(',', RdoRegistro::CLIMAS),
            'clima_tarde' => 'nullable|string|in:'.implode(',', RdoRegistro::CLIMAS),
            'clima_noite' => 'nullable|string|in:'.implode(',', RdoRegistro::CLIMAS),
            'impacto_cronograma' => 'nullable|string',
            'observacoes' => 'nullable|string',

            'tarefas' => 'nullable|array|max:50',
            'tarefas.*.id' => 'nullable|string|max:36',
            'tarefas.*.descricao' => 'required|string',

            'mao_de_obra' => 'nullable|array|max:100',
            'mao_de_obra.*.categoria' => 'required|string|in:indireta,direta',
            'mao_de_obra.*.funcao' => 'required|string|max:120',
            'mao_de_obra.*.quantidade' => 'required|integer|min:0',

            'equipamentos' => 'nullable|array|max:100',
            'equipamentos.*.equipamento_id' => 'nullable|string|max:36',
            'equipamentos.*.descricao' => 'required|string|max:150',
            'equipamentos.*.quantidade' => 'required|integer|min:0',

            'ocorrencias' => 'nullable|array|max:50',
            'ocorrencias.*.tipo' => 'nullable|string|max:40',
            'ocorrencias.*.descricao' => 'required|string',
            'ocorrencias.*.responsavel' => 'nullable|string|max:150',
            'ocorrencias.*.motivo' => 'nullable|string',
            'ocorrencias.*.danos_materiais' => 'nullable|string',

            'pendencias' => 'nullable|array|max:50',
            'pendencias.*.descricao' => 'required|string',
            'pendencias.*.responsavel' => 'nullable|string|max:150',
            'pendencias.*.prazo' => 'nullable|date',
            'pendencias.*.status' => 'nullable|string|in:aberta,concluida',

            'etapas' => 'nullable|array|max:50',
            'etapas.*.nome' => 'required|string|max:150',
            'etapas.*.concluida' => 'nullable|boolean',

            'responsaveis' => 'nullable|array|max:50',
            'responsaveis.*.nome' => 'required|string|max:150',
            'responsaveis.*.empresa' => 'nullable|string|max:150',
            'responsaveis.*.funcao' => 'nullable|string|max:120',
            'responsaveis.*.contrato_referencia' => 'nullable|string|max:150',

            'comentarios' => 'nullable|array|max:20',
            'comentarios.*.texto' => 'required|string',
            'comentarios.*.visivel_contratante' => 'nullable|boolean',

            // Fotos: arquivo + metadados posicionais (índice 0 = fotos[0]).
            'fotos' => 'nullable|array|max:20',
            'fotos.*' => 'file|image|max:8192',
            'fotos_meta' => 'nullable|array',
            'fotos_meta.*.tarefa_id' => 'nullable|string|max:36',
            'fotos_meta.*.legenda' => 'nullable|string|max:200',
            'fotos_meta.*.x' => 'nullable|numeric|min:0|max:1',
            'fotos_meta.*.y' => 'nullable|numeric|min:0|max:1',
            'fotos_meta.*.nota' => 'nullable|string|max:200',
        ];

        if ($criando) {
            $regras['obra_id'] = 'required|string|exists:obras,id';
        }

        return $request->validate($regras);
    }

    private function sincronizarFilhos(RdoRegistro $rdo, array $data, $usuario, bool $substituindo = false): void
    {
        if ($substituindo) {
            // As tarefas são apagadas por último entre as que têm dependente:
            // `rdo_fotos.tarefa_id` é nullOnDelete, então uma foto de tarefa
            // apagada vira foto do dia em vez de sumir junto.
            RdoMaoDeObra::where('rdo_id', $rdo->id)->delete();
            RdoEquipamento::where('rdo_id', $rdo->id)->delete();
            RdoOcorrencia::where('rdo_id', $rdo->id)->delete();
            RdoPendencia::where('rdo_id', $rdo->id)->delete();
            RdoEtapa::where('rdo_id', $rdo->id)->delete();
            RdoResponsavelPresente::where('rdo_id', $rdo->id)->delete();
            RdoComentarioInterno::where('rdo_id', $rdo->id)->delete();

            $idsMantidos = collect($data['tarefas'] ?? [])->pluck('id')->filter()->all();
            RdoTarefa::where('rdo_id', $rdo->id)->whereNotIn('id', $idsMantidos)->delete();
        }

        foreach ($data['tarefas'] ?? [] as $ordem => $item) {
            RdoTarefa::updateOrCreate(
                ['id' => $item['id'] ?? (string) \Illuminate\Support\Str::uuid()],
                ['rdo_id' => $rdo->id, 'ordem' => $ordem + 1, 'descricao' => $item['descricao']]
            );
        }

        foreach ($data['mao_de_obra'] ?? [] as $ordem => $item) {
            RdoMaoDeObra::create([
                'rdo_id' => $rdo->id,
                'categoria' => $item['categoria'],
                'funcao' => $item['funcao'],
                'quantidade' => $item['quantidade'],
                'ordem' => $ordem,
            ]);
        }

        foreach ($data['equipamentos'] ?? [] as $ordem => $item) {
            // Mesmo cuidado do obra_id: o catálogo é por empresa e o id vem do
            // cliente, então confirmamos pelo model (que passa pelo scope).
            $catalogoId = null;
            if (!empty($item['equipamento_id'])) {
                $catalogoId = RdoEquipamentoCatalogo::find($item['equipamento_id'])?->id;
            }

            // Equipamento digitado à mão entra no catálogo da empresa, para
            // aparecer sugerido no próximo RDO. Sem isto o catálogo nunca era
            // alimentado por ninguém (não existe tela de cadastro dele) e a
            // sugestão vinha sempre vazia — verificado em 18/09/2026.
            // `firstOrCreate` pelo nome evita duplicar a cada lançamento; a
            // comparação usa o collation da coluna, que não diferencia caixa.
            if (!$catalogoId && $usuario?->empresa_id) {
                $catalogoId = RdoEquipamentoCatalogo::firstOrCreate(
                    ['empresa_id' => $usuario->empresa_id, 'nome' => trim($item['descricao'])],
                )->id;
            }

            RdoEquipamento::create([
                'rdo_id' => $rdo->id,
                'equipamento_id' => $catalogoId,
                'descricao' => $item['descricao'],
                'quantidade' => $item['quantidade'],
                'ordem' => $ordem,
            ]);
        }

        foreach ($data['ocorrencias'] ?? [] as $ordem => $item) {
            RdoOcorrencia::create([
                'rdo_id' => $rdo->id,
                'ordem' => $ordem + 1,
                'tipo' => $item['tipo'] ?? 'outra',
                'descricao' => $item['descricao'],
                'responsavel' => $item['responsavel'] ?? null,
                'motivo' => $item['motivo'] ?? null,
                'danos_materiais' => $item['danos_materiais'] ?? null,
            ]);
        }

        foreach ($data['pendencias'] ?? [] as $ordem => $item) {
            RdoPendencia::create([
                'rdo_id' => $rdo->id,
                'descricao' => $item['descricao'],
                'responsavel' => $item['responsavel'] ?? null,
                'prazo' => $item['prazo'] ?? null,
                'status' => $item['status'] ?? 'aberta',
                'ordem' => $ordem,
            ]);
        }

        foreach ($data['etapas'] ?? [] as $ordem => $item) {
            RdoEtapa::create([
                'rdo_id' => $rdo->id,
                'nome' => $item['nome'],
                'concluida' => (bool) ($item['concluida'] ?? false),
                'ordem' => $ordem,
            ]);
        }

        foreach ($data['responsaveis'] ?? [] as $ordem => $item) {
            RdoResponsavelPresente::create([
                'rdo_id' => $rdo->id,
                'nome' => $item['nome'],
                'empresa' => $item['empresa'] ?? null,
                'funcao' => $item['funcao'] ?? null,
                'contrato_referencia' => $item['contrato_referencia'] ?? null,
                'ordem' => $ordem,
            ]);
        }

        foreach ($data['comentarios'] ?? [] as $item) {
            RdoComentarioInterno::create([
                'rdo_id' => $rdo->id,
                'autor_user_id' => $usuario?->id,
                'texto' => $item['texto'],
                'visivel_contratante' => (bool) ($item['visivel_contratante'] ?? false),
            ]);
        }
    }

    /**
     * Grava os arquivos enviados. `fotos_meta[i]` descreve `fotos[i]`: a qual
     * tarefa a foto pertence (opcional — sem isso é foto do dia), a legenda e
     * o ponto do croqui.
     */
    private function guardarFotos(RdoRegistro $rdo, Request $request, array $data): void
    {
        $ultimaOrdem = (int) RdoFoto::where('rdo_id', $rdo->id)->max('ordem');
        $idsDeTarefa = RdoTarefa::where('rdo_id', $rdo->id)->pluck('id')->all();

        foreach ($request->file('fotos', []) as $i => $arquivo) {
            $meta = $data['fotos_meta'][$i] ?? [];
            $tarefaId = $meta['tarefa_id'] ?? null;

            // Só aceita tarefa deste mesmo RDO — impede pendurar foto na
            // tarefa de outro registro passando um id qualquer.
            if ($tarefaId && !in_array($tarefaId, $idsDeTarefa, true)) {
                $tarefaId = null;
            }

            RdoFoto::create([
                'rdo_id' => $rdo->id,
                'tarefa_id' => $tarefaId,
                'caminho' => $arquivo->store('rdo', 'public'),
                'legenda' => $meta['legenda'] ?? null,
                'ordem' => ++$ultimaOrdem,
                'marcador_x' => $meta['x'] ?? null,
                'marcador_y' => $meta['y'] ?? null,
                'marcador_nota' => $meta['nota'] ?? null,
            ]);
        }
    }

    /**
     * Aviso por e-mail ao contratante quando um RDO é finalizado (decisão de
     * 15/09/2026: sem WhatsApp). Falha de envio não derruba a finalização —
     * o documento já está assinado, o aviso é secundário.
     */
    private function avisarContratante(RdoRegistro $rdo): void
    {
        $links = RdoContratanteLink::where('obra_id', $rdo->obra_id)
            ->where('ativo', true)
            ->whereNotNull('email')
            ->get();

        foreach ($links as $link) {
            if (!$link->estaValido()) {
                continue;
            }

            try {
                \Illuminate\Support\Facades\Mail::to($link->email)->send(
                    new \App\Mail\RdoDisponivel($rdo, $link)
                );
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }
}
