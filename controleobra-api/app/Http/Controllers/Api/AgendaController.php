<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AgendaEvento;
use App\Models\Obra;
use App\Models\User;
use App\Services\PermissaoService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Agenda (26/09/2026, pedido do Lucas): compromissos com horário, parecidos com
 * o Google Agenda. A Agenda geral mostra os compromissos de TODAS as obras (e os
 * sem obra) para todos os usuários da empresa; a aba "Agenda" da obra é o mesmo
 * dado filtrado por `obra_id`. Quem marca o compromisso pode chamar outros
 * usuários da empresa como participantes.
 *
 * Regras: qualquer usuário com o módulo `agenda` enxerga tudo da empresa (menos
 * compromissos de obras às quais não tem acesso); só o criador e o admin editam
 * ou excluem um compromisso.
 */
class AgendaController extends Controller
{
    private const FORMATO = 'Y-m-d\TH:i';

    /** GET /agenda?inicio=YYYY-MM-DD&fim=YYYY-MM-DD[&obra_id=] — compromissos que tocam o intervalo (fim inclusive). */
    public function index(Request $request, PermissaoService $permissoes)
    {
        $data = $request->validate([
            'inicio' => 'required|date_format:Y-m-d',
            'fim' => 'required|date_format:Y-m-d|after_or_equal:inicio',
            'obra_id' => 'nullable|string',
        ]);

        $usuario = $request->user();
        $comecoDoIntervalo = Carbon::createFromFormat('Y-m-d', $data['inicio'])->startOfDay();
        $fimExclusivo = Carbon::createFromFormat('Y-m-d', $data['fim'])->addDay()->startOfDay();

        $query = AgendaEvento::with(['participantes:id,name', 'obra:id,obra_nome', 'criadoPor:id,name'])
            ->where('inicio', '<', $fimExclusivo)
            ->where('fim', '>=', $comecoDoIntervalo)
            ->orderBy('inicio');

        if (!empty($data['obra_id'])) {
            $obra = $this->obraDaEmpresaOuAborta($data['obra_id']);
            if (!$permissoes->podeObra($usuario, $obra->id, 'ver')) {
                abort(403, 'Sem acesso a esta obra.');
            }
            $query->where('obra_id', $obra->id);
        } elseif (!$usuario->ehAdmin()) {
            // Agenda geral: some o que é de obra vetada ao usuário; os compromissos sem obra sempre aparecem.
            $negadas = $usuario->obraAcessos()->where('pode_ver', false)->pluck('obra_id');
            if ($negadas->isNotEmpty()) {
                $query->where(fn ($q) => $q->whereNull('obra_id')->orWhereNotIn('obra_id', $negadas));
            }
        }

        return $query->get()->map(fn (AgendaEvento $e) => $this->paraFrontend($e, $usuario));
    }

    /** GET /agenda/usuarios — quem pode ser marcado (usuários ativos da empresa). */
    public function usuarios(Request $request)
    {
        return User::where('empresa_id', $request->user()->empresa_id)
            ->where('ativo', true)
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (User $u) => ['id' => $u->id, 'nome' => $u->name]);
    }

    /** POST /agenda */
    public function store(Request $request, PermissaoService $permissoes)
    {
        $data = $this->validar($request);
        $usuario = $request->user();

        $this->conferirObra($data['obra_id'] ?? null, $usuario, $permissoes);

        $evento = AgendaEvento::create([
            'obra_id' => $data['obra_id'] ?? null,
            'criado_por_id' => $usuario->id,
            'titulo' => trim($data['titulo']),
            'descricao' => $data['descricao'] ?? null,
            'local' => $data['local'] ?? null,
            'dia_inteiro' => (bool) ($data['dia_inteiro'] ?? false),
            'inicio' => $this->paraBanco($data['inicio']),
            'fim' => $this->paraBanco($data['fim']),
        ]);
        $evento->participantes()->sync($this->participantesDaEmpresa($data['participantes'] ?? [], $usuario));

        return response()->json($this->paraFrontend($this->recarregar($evento), $usuario), 201);
    }

    /** PUT /agenda/{evento} */
    public function update(Request $request, AgendaEvento $evento, PermissaoService $permissoes)
    {
        $usuario = $request->user();
        $this->garantirPodeMexer($evento, $usuario);

        $data = $this->validar($request);
        $this->conferirObra($data['obra_id'] ?? null, $usuario, $permissoes);

        $evento->update([
            'obra_id' => $data['obra_id'] ?? null,
            'titulo' => trim($data['titulo']),
            'descricao' => $data['descricao'] ?? null,
            'local' => $data['local'] ?? null,
            'dia_inteiro' => (bool) ($data['dia_inteiro'] ?? false),
            'inicio' => $this->paraBanco($data['inicio']),
            'fim' => $this->paraBanco($data['fim']),
        ]);
        $evento->participantes()->sync($this->participantesDaEmpresa($data['participantes'] ?? [], $usuario));

        return $this->paraFrontend($this->recarregar($evento), $usuario);
    }

    /** DELETE /agenda/{evento} */
    public function destroy(Request $request, AgendaEvento $evento)
    {
        $this->garantirPodeMexer($evento, $request->user());
        $evento->delete();

        return response()->noContent();
    }

    /** "2026-09-26T14:30" (formato do front) → "2026-09-26 14:30:00" (DATETIME). */
    private function paraBanco(string $valor): string
    {
        return Carbon::createFromFormat(self::FORMATO, $valor)->format('Y-m-d H:i:s');
    }

    private function validar(Request $request): array
    {
        return $request->validate([
            'titulo' => 'required|string|max:200',
            'descricao' => 'nullable|string|max:5000',
            'local' => 'nullable|string|max:200',
            'dia_inteiro' => 'nullable|boolean',
            'inicio' => 'required|date_format:'.self::FORMATO,
            'fim' => 'required|date_format:'.self::FORMATO.'|after_or_equal:inicio',
            'obra_id' => 'nullable|string',
            'participantes' => 'nullable|array|max:100',
            'participantes.*' => 'integer',
        ]);
    }

    /** Compromisso de obra exige acesso de lançamento a ela. */
    private function conferirObra(?string $obraId, User $usuario, PermissaoService $permissoes): void
    {
        if (!$obraId) return;
        $obra = $this->obraDaEmpresaOuAborta($obraId);
        if (!$permissoes->podeObra($usuario, $obra->id, 'lancar')) {
            abort(403, 'Sem acesso a esta obra.');
        }
    }

    private function garantirPodeMexer(AgendaEvento $evento, User $usuario): void
    {
        if (!$usuario->ehAdmin() && (int) $evento->criado_por_id !== (int) $usuario->id) {
            abort(403, 'Só quem criou o compromisso (ou o administrador) pode alterá-lo.');
        }
    }

    /** Só usuários da mesma empresa entram como participantes — nunca confia no que veio no corpo. */
    private function participantesDaEmpresa(array $ids, User $usuario): array
    {
        if (!$ids) return [];

        return User::where('empresa_id', $usuario->empresa_id)
            ->whereIn('id', $ids)
            ->pluck('id')
            ->all();
    }

    private function recarregar(AgendaEvento $evento): AgendaEvento
    {
        return $evento->fresh(['participantes:id,name', 'obra:id,obra_nome', 'criadoPor:id,name']);
    }

    private function obraDaEmpresaOuAborta(string $obraId): Obra
    {
        $obra = Obra::find($obraId);
        if (!$obra) {
            abort(403, 'Obra não encontrada para esta empresa.');
        }

        return $obra;
    }

    private function paraFrontend(AgendaEvento $evento, User $usuario): array
    {
        return [
            'id' => $evento->id,
            'titulo' => $evento->titulo,
            'descricao' => $evento->descricao ?? '',
            'local' => $evento->local ?? '',
            'diaInteiro' => (bool) $evento->dia_inteiro,
            'inicio' => Carbon::parse($evento->getRawOriginal('inicio'))->format(self::FORMATO),
            'fim' => Carbon::parse($evento->getRawOriginal('fim'))->format(self::FORMATO),
            'obraId' => $evento->obra_id,
            'obraNome' => $evento->obra?->obra_nome,
            'criadoPorId' => $evento->criado_por_id,
            'criadoPorNome' => $evento->criadoPor?->name,
            'participantes' => $evento->participantes->map(fn (User $u) => ['id' => $u->id, 'nome' => $u->name])->values(),
            'podeEditar' => $usuario->ehAdmin() || (int) $evento->criado_por_id === (int) $usuario->id,
        ];
    }
}
