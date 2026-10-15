<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Este backend é só API — não existe rota nomeada "login" (não há
        // tela de login servida pelo Laravel, quem faz isso é o Angular).
        // Sem isso, o middleware `Authenticate` padrão tenta
        // `route('login')` pra redirecionar qualquer requisição sem
        // Accept: application/json que caia numa rota `auth:sanctum` sem
        // sessão válida — e como a rota não existe, estoura
        // RouteNotFoundException em vez de devolver um 401 limpo
        // (descoberto 21/08/2026 testando a API com curl puro, sem
        // header de Accept; o Angular manda Accept: application/json
        // sempre, então nunca bateu nisso, mas qualquer outro cliente
        // sem sessão válida bateria).
        $middleware->redirectGuestsTo(fn () => null);

        // Controle de permissões (31/08/2026) — ver PermissaoModulo/PermissaoObra.
        $middleware->alias([
            'permissaoModulo' => \App\Http\Middleware\PermissaoModulo::class,
            'permissaoObra' => \App\Http\Middleware\PermissaoObra::class,
            'plataforma' => \App\Http\Middleware\ApenasPlataforma::class,
        ]);

        // O token do administrador da plataforma (painel de planos) não pode
        // passar nas rotas normais do sistema — ver a classe.
        $middleware->appendToGroup('api', \App\Http\Middleware\BloqueiaPlataformaForaDoPainel::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Mesmo motivo do `redirectGuestsTo` acima, camada diferente: o
        // Handler padrão do Laravel só devolve JSON em erro quando
        // `$request->expectsJson()` é verdadeiro; senão tenta redirecionar
        // pra `route('login')` (RedirectIfAuthenticated/unauthenticated()
        // em Handler::unauthenticated), que não existe aqui. Esta app é
        // 100% API — nenhuma rota HTML é servida pelo Laravel — então
        // toda resposta de erro deve ser JSON, sem exceção.
        $exceptions->shouldRenderJsonWhen(fn () => true);
    })->create();
