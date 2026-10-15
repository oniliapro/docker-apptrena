<?php

namespace App\Http\Middleware;

use App\Models\AdminPlataforma;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Deixa passar só quem fez as DUAS etapas do login da plataforma: o token do
 * painel carrega a habilidade `plataforma`, que só `PlataformaAuthController`
 * emite depois do código de 6 dígitos. Token de usuário comum (de qualquer
 * empresa) nunca tem essa habilidade nem é um `AdminPlataforma`.
 */
class ApenasPlataforma
{
    public function handle(Request $request, Closure $next): Response
    {
        $usuario = $request->user();

        if (!$usuario instanceof AdminPlataforma || !$usuario->ativo || !$usuario->tokenCan('plataforma')) {
            abort(403, 'Acesso restrito.');
        }

        return $next($request);
    }
}
