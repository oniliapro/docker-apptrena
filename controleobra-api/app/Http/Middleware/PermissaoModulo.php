<?php

namespace App\Http\Middleware;

use App\Services\PermissaoService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `->middleware('permissaoModulo:mapas,criar')` (31/08/2026, pedido do
 * Lucas, "Controle de permissões") — camada de PERMISSÃO POR MÓDULO
 * (empresa toda, não por obra; ver `PermissaoObra` pra essa outra
 * camada, as duas convivem na mesma rota quando fizer sentido). Alias
 * registrado em `bootstrap/app.php`.
 */
class PermissaoModulo
{
    public function __construct(private readonly PermissaoService $permissoes) {}

    public function handle(Request $request, Closure $next, string $modulo, string $acao = 'usar'): Response
    {
        $user = $request->user();

        if (!$user || !$user->ativo) {
            return response()->json(['message' => 'Usuário inativo.'], 403);
        }

        if (!$this->permissoes->podeModulo($user, $modulo, $acao)) {
            return response()->json(['message' => 'Sem permissão para esta ação.'], 403);
        }

        return $next($request);
    }
}
