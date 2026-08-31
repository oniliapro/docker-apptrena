<?php

namespace App\Http\Middleware;

use App\Models\Obra;
use App\Models\Pasta;
use App\Services\PermissaoService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `->middleware('permissaoObra:ver')` / `->middleware('permissaoObra:lancar')`
 * (31/08/2026, pedido do Lucas, "Controle de permissões") — camada de
 * ACESSO POR OBRA (convive com `PermissaoModulo` na mesma rota; as duas
 * precisam passar).
 *
 * A obra nem sempre está no caminho da rota (`obras/{obra}/...`) — um
 * módulo como Mapas tem rotas tipo `mapas/{mapa}` sem `{obra}` nenhum
 * na URL, só no model já carregado (`Mapa::obra_id`); e criar um
 * registro novo (`POST /mapas`) não tem model carregado ainda, só o
 * `obra_id` no corpo da requisição. `resolverObraId()` tenta as três
 * fontes nessa ordem.
 */
class PermissaoObra
{
    public function __construct(private readonly PermissaoService $permissoes) {}

    public function handle(Request $request, Closure $next, string $tipo = 'ver'): Response
    {
        $user = $request->user();

        if (!$user || !$user->ativo) {
            return response()->json(['message' => 'Usuário inativo.'], 403);
        }

        $obraId = $this->resolverObraId($request);

        if (!$obraId) {
            return response()->json(['message' => 'Obra não informada na requisição.'], 500);
        }

        if (!$this->permissoes->podeObra($user, $obraId, $tipo)) {
            return response()->json(['message' => 'Sem acesso a esta obra.'], 403);
        }

        return $next($request);
    }

    /**
     * Parâmetros de rota que NÃO chegam como model já resolvido pelo
     * route-model-binding — porque o método do controller recebe o id
     * cru (ex.: `ArquivoController::store(Request $request, string $id, ...)`
     * em vez de tipar `Pasta $pasta`, já que o upload também precisa
     * confirmar que a pasta pertence à empresa antes de usá-la). Pra
     * esses, busca o model manualmente pelo nome do parâmetro da rota.
     */
    private const MODELOS_POR_PARAMETRO_CRU = [
        'pasta' => Pasta::class,
    ];

    private function resolverObraId(Request $request): ?string
    {
        $parametroObra = $request->route('obra');
        if ($parametroObra instanceof Obra) return $parametroObra->id;
        if (is_string($parametroObra)) return $parametroObra;

        foreach ($request->route()?->parameters() ?? [] as $nome => $valor) {
            if (is_object($valor) && isset($valor->obra_id) && $valor->obra_id) {
                return $valor->obra_id;
            }
            if (is_string($valor) && $valor !== '' && isset(self::MODELOS_POR_PARAMETRO_CRU[$nome])) {
                $modelo = self::MODELOS_POR_PARAMETRO_CRU[$nome]::find($valor);
                if ($modelo && $modelo->obra_id) return $modelo->obra_id;
            }
        }

        $doCorpo = $request->input('obra_id');
        return is_string($doCorpo) && $doCorpo !== '' ? $doCorpo : null;
    }
}
