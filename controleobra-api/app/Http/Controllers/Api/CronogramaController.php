<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CronogramaDependencia;
use App\Models\CronogramaTarefa;
use App\Models\Obra;
use App\Services\PermissaoService;
use Illuminate\Http\Request;

/**
 * Cronograma de obra (CPM — Critical Path Method), 02/10/2026, pedido do
 * Lucas. Este controller só guarda/devolve dados crus (tarefas e
 * dependências) — todo o cálculo (datas, folga, caminho crítico) é feito no
 * frontend (`cronograma-obra-engine.ts`), mesma arquitetura de Mapa/EAP.
 *
 * As rotas de tarefa (`obras/{obra}/cronograma-tarefas`,
 * `cronograma-tarefas/{cronogramaTarefa}`) usam o middleware `permissaoObra`
 * normalmente — `CronogramaTarefa` tem `obra_id` direto, então a resolução
 * automática do middleware funciona de graça. Uma `CronogramaDependencia`
 * NÃO tem `obra_id` (só referencia duas tarefas), então o middleware não
 * resolveria sozinho — os métodos de dependência conferem a permissão de
 * obra NA MÃO, via `PermissaoService`, usando a obra da tarefa predecessora.
 */
class CronogramaController extends Controller
{
    public function __construct(private readonly PermissaoService $permissoes) {}
    /** Carga única pro Gantt — tarefas + dependências juntas, ordenadas. */
    public function index(Obra $obra)
    {
        $tarefas = $obra->cronogramaTarefas()->orderBy('ordem')->get();
        $dependencias = CronogramaDependencia::whereIn('predecessora_id', $tarefas->pluck('id'))
            ->orWhereIn('sucessora_id', $tarefas->pluck('id'))
            ->get();

        return ['tarefas' => $tarefas, 'dependencias' => $dependencias];
    }

    public function storeTarefa(Request $request, Obra $obra)
    {
        $data = $request->validate([
            'eap_item_id' => 'nullable|string|max:36',
            'ordem' => 'nullable|integer',
            'nome' => 'required|string|max:200',
            'tipo' => 'required|string|in:tarefa,marco',
            'duracao_dias' => 'required|integer|min:0',
            'data_inicio_manual' => 'nullable|date',
        ]);

        $tarefa = CronogramaTarefa::create([
            'obra_id' => $obra->id,
            'eap_item_id' => $this->eapItemValido($obra->id, $data['eap_item_id'] ?? null),
            'ordem' => $data['ordem'] ?? $this->proximaOrdem($obra->id),
            'nome' => $data['nome'],
            'tipo' => $data['tipo'],
            // Marco não tem duração — reforçado aqui mesmo que o front já trave o campo.
            'duracao_dias' => $data['tipo'] === 'marco' ? 0 : $data['duracao_dias'],
            'data_inicio_manual' => $data['data_inicio_manual'] ?? null,
        ]);

        return response()->json($tarefa, 201);
    }

    public function updateTarefa(Request $request, CronogramaTarefa $cronogramaTarefa)
    {
        $data = $request->validate([
            'eap_item_id' => 'nullable|string|max:36',
            'ordem' => 'nullable|integer',
            'nome' => 'required|string|max:200',
            'tipo' => 'required|string|in:tarefa,marco',
            'duracao_dias' => 'required|integer|min:0',
            'data_inicio_manual' => 'nullable|date',
        ]);

        $cronogramaTarefa->update([
            'eap_item_id' => $this->eapItemValido($cronogramaTarefa->obra_id, $data['eap_item_id'] ?? null),
            'ordem' => $data['ordem'] ?? $cronogramaTarefa->ordem,
            'nome' => $data['nome'],
            'tipo' => $data['tipo'],
            'duracao_dias' => $data['tipo'] === 'marco' ? 0 : $data['duracao_dias'],
            'data_inicio_manual' => $data['data_inicio_manual'] ?? null,
        ]);

        return $cronogramaTarefa;
    }

    public function destroyTarefa(CronogramaTarefa $cronogramaTarefa)
    {
        $cronogramaTarefa->delete();

        return response()->noContent();
    }

    public function storeDependencia(Request $request)
    {
        $data = $request->validate([
            'predecessora_id' => 'required|string|max:36',
            'sucessora_id' => 'required|string|max:36',
            'tipo' => 'required|string|in:TI,II,TT,IT',
            'latencia_dias' => 'nullable|integer',
        ]);

        if ($data['predecessora_id'] === $data['sucessora_id']) {
            return response()->json(['message' => 'Uma tarefa não pode depender dela mesma.'], 422);
        }

        $predecessora = CronogramaTarefa::find($data['predecessora_id']);
        $sucessora = CronogramaTarefa::find($data['sucessora_id']);
        if (!$predecessora || !$sucessora || $predecessora->obra_id !== $sucessora->obra_id) {
            return response()->json(['message' => 'As duas tarefas precisam existir e ser da mesma obra.'], 422);
        }
        if (!$this->permissoes->podeObra($request->user(), $predecessora->obra_id, 'lancar')) {
            return response()->json(['message' => 'Sem acesso a esta obra.'], 403);
        }

        $dependencia = CronogramaDependencia::create([
            'predecessora_id' => $data['predecessora_id'],
            'sucessora_id' => $data['sucessora_id'],
            'tipo' => $data['tipo'],
            'latencia_dias' => $data['latencia_dias'] ?? 0,
        ]);

        return response()->json($dependencia, 201);
    }

    public function updateDependencia(Request $request, CronogramaDependencia $cronogramaDependencia)
    {
        if (!$this->permissoes->podeObra($request->user(), $cronogramaDependencia->predecessora->obra_id, 'lancar')) {
            return response()->json(['message' => 'Sem acesso a esta obra.'], 403);
        }

        $data = $request->validate([
            'tipo' => 'required|string|in:TI,II,TT,IT',
            'latencia_dias' => 'nullable|integer',
        ]);

        $cronogramaDependencia->update([
            'tipo' => $data['tipo'],
            'latencia_dias' => $data['latencia_dias'] ?? 0,
        ]);

        return $cronogramaDependencia;
    }

    public function destroyDependencia(Request $request, CronogramaDependencia $cronogramaDependencia)
    {
        if (!$this->permissoes->podeObra($request->user(), $cronogramaDependencia->predecessora->obra_id, 'lancar')) {
            return response()->json(['message' => 'Sem acesso a esta obra.'], 403);
        }

        $cronogramaDependencia->delete();

        return response()->noContent();
    }

    private function proximaOrdem(string $obraId): int
    {
        return (int) CronogramaTarefa::where('obra_id', $obraId)->max('ordem') + 1;
    }

    /** Mesmo cuidado de sempre: o id vem do cliente, confirma que é um item da EAP DESTA obra antes de gravar o vínculo. */
    private function eapItemValido(string $obraId, ?string $eapItemId): ?string
    {
        if (!$eapItemId) {
            return null;
        }

        return \App\Models\EapItem::where('obra_id', $obraId)->where('id', $eapItemId)->value('id');
    }
}
