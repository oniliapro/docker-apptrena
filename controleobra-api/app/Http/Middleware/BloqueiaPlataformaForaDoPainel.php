<?php

namespace App\Http\Middleware;

use App\Models\AdminPlataforma;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * O token do administrador da plataforma só vale em `admin-plataforma/*`.
 *
 * Sem isto, esse token passaria no `auth:sanctum` das rotas normais — e, como
 * o administrador da plataforma não pertence a nenhuma empresa, o escopo de
 * empresa (`PertenceAEmpresa`) deixaria de filtrar e ele enxergaria dados de
 * TODAS as empresas por rotas que nunca foram pensadas para isso.
 *
 * Roda no grupo `api` inteiro, antes de qualquer controller.
 */
class BloqueiaPlataformaForaDoPainel
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->bearerToken() && !$request->is('api/admin-plataforma', 'api/admin-plataforma/*')) {
            $usuario = auth('sanctum')->user();

            if ($usuario instanceof AdminPlataforma) {
                abort(403, 'Este acesso só vale no painel da plataforma.');
            }
        }

        return $next($request);
    }
}
