<?php

use App\Http\Controllers\Api\PublicoRdoController;
use App\Http\Controllers\Api\RdoContratanteLinkController;
use App\Http\Controllers\Api\RdoController;
use App\Http\Controllers\Api\RdoObraDadosController;
use App\Http\Controllers\Api\RdoPdfController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Relatório Diário de Obra (RDO) — módulo reconstruído em 17/09/2026
|--------------------------------------------------------------------------
|
| Ficam num arquivo separado de propósito: `routes/api.php` é compartilhado
| por todos os módulos, e concentrar as rotas do RDO aqui reduz o toque
| naquele arquivo a UMA linha (o require no fim dele), em vez de espalhar
| vinte. Menos chance de conflito e de sobrescrever rota de outro módulo.
|
| Os grupos declaram seus próprios middlewares, então este arquivo pode ser
| incluído do nível de cima sem depender de estar dentro de nenhum grupo.
|
| Permissão: reutiliza o módulo `diario_obra` que já existe em
| PermissaoService::MODULOS — assim quem já tinha acesso ao Diário continua
| tendo, e o PermissaoService não precisa ser alterado.
*/

/**
 * Acesso do contratante da obra: sem login, autorizado só pelo token.
 * Somente leitura — nenhuma destas rotas grava nada, e nenhuma delas assina.
 * Throttle contra varredura de token.
 */
Route::prefix('publico/rdo/{token}')->middleware('throttle:60,1')->group(function () {
    Route::get('/', [PublicoRdoController::class, 'index']);
    Route::get('registro/{rdoId}', [PublicoRdoController::class, 'show']);
});

Route::middleware('auth:sanctum')->group(function () {
    // Listagem e leitura
    Route::get('rdo', [RdoController::class, 'index'])
        ->middleware('permissaoModulo:diario_obra,usar');
    Route::get('rdo/preparar', [RdoController::class, 'preparar'])
        ->middleware('permissaoModulo:diario_obra,usar');

    // Cabeçalho técnico da obra (contrato, responsável técnico, CREA, ART).
    // Declarado antes de `rdo/{id}` para não ser capturado pelo curinga.
    Route::get('rdo/obra-dados', [RdoObraDadosController::class, 'show'])
        ->middleware('permissaoModulo:diario_obra,usar');
    Route::post('rdo/obra-dados', [RdoObraDadosController::class, 'salvar'])
        ->middleware('permissaoModulo:diario_obra,editar');

    // Link de acompanhamento do contratante
    Route::get('rdo/links', [RdoContratanteLinkController::class, 'index'])
        ->middleware('permissaoModulo:diario_obra,usar');
    Route::post('rdo/links', [RdoContratanteLinkController::class, 'store'])
        ->middleware('permissaoModulo:diario_obra,criar');
    Route::post('rdo/links/{id}/revogar', [RdoContratanteLinkController::class, 'revogar'])
        ->middleware('permissaoModulo:diario_obra,editar');

    Route::get('rdo/{id}', [RdoController::class, 'show'])
        ->middleware('permissaoModulo:diario_obra,usar');
    Route::get('rdo/{id}/pdf', [RdoPdfController::class, 'gerar'])
        ->middleware('permissaoModulo:diario_obra,usar');

    // Escrita. `update` é POST e não PUT de propósito: o formulário envia
    // fotos junto (multipart), e o PHP não popula $_FILES em requisições PUT.
    Route::post('rdo', [RdoController::class, 'store'])
        ->middleware(['permissaoModulo:diario_obra,criar', 'permissaoObra:lancar']);
    Route::post('rdo/{id}', [RdoController::class, 'update'])
        ->middleware(['permissaoModulo:diario_obra,editar', 'permissaoObra:lancar']);
    Route::post('rdo/{id}/finalizar', [RdoController::class, 'finalizar'])
        ->middleware(['permissaoModulo:diario_obra,editar', 'permissaoObra:lancar']);
    Route::delete('rdo/{id}', [RdoController::class, 'destroy'])
        ->middleware(['permissaoModulo:diario_obra,excluir', 'permissaoObra:lancar']);
    Route::delete('rdo/{id}/fotos/{fotoId}', [RdoController::class, 'removerFoto'])
        ->middleware(['permissaoModulo:diario_obra,editar', 'permissaoObra:lancar']);
});
