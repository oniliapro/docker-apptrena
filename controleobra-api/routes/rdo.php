<?php

use App\Http\Controllers\Api\FvsController;
use App\Http\Controllers\Api\FvsModeloController;
use App\Http\Controllers\Api\FvsVinculoController;
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
    // Declarado antes de `rdo/{rdo}` para não ser capturado pelo curinga.
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

    // O parâmetro se chama {rdo} (e não {id}) e o controller tipa
    // RdoRegistro: assim o route-model-binding resolve o registro ANTES
    // do middleware `permissaoObra`, que descobre a obra pelo `obra_id`
    // do model. Com `{id}` cru ele não tinha como saber de que obra se
    // trata (o id é do RDO, não da obra) e barrava o salvamento com 500.
    // A URL não muda — só o nome do parâmetro —, então o frontend segue igual.
    Route::get('rdo/{rdo}', [RdoController::class, 'show'])
        ->middleware('permissaoModulo:diario_obra,usar');
    Route::get('rdo/{rdo}/pdf', [RdoPdfController::class, 'gerar'])
        ->middleware('permissaoModulo:diario_obra,usar');

    // Escrita. `update` é POST e não PUT de propósito: o formulário envia
    // fotos junto (multipart), e o PHP não popula $_FILES em requisições PUT.
    Route::post('rdo', [RdoController::class, 'store'])
        ->middleware(['permissaoModulo:diario_obra,criar', 'permissaoObra:lancar']);
    Route::post('rdo/{rdo}', [RdoController::class, 'update'])
        ->middleware(['permissaoModulo:diario_obra,editar', 'permissaoObra:lancar']);
    Route::post('rdo/{rdo}/finalizar', [RdoController::class, 'finalizar'])
        ->middleware(['permissaoModulo:diario_obra,editar', 'permissaoObra:lancar']);
    Route::delete('rdo/{rdo}', [RdoController::class, 'destroy'])
        ->middleware(['permissaoModulo:diario_obra,excluir', 'permissaoObra:lancar']);
    Route::delete('rdo/{rdo}/fotos/{fotoId}', [RdoController::class, 'removerFoto'])
        ->middleware(['permissaoModulo:diario_obra,editar', 'permissaoObra:lancar']);

    // Ficha de Verificação de Serviço (F10, 25/09/2026) — a ficha em si nasce
    // e é copiada sozinha por `RdoController` (ver `gerarFichasFvsPendentes`/
    // `copiarFichasReprovadasParaNovoRdo`); aqui só o cadastro de modelos
    // (Configurações), o vínculo com a EAP e o preenchimento.
    Route::get('fvs-modelos', [FvsModeloController::class, 'index'])
        ->middleware('permissaoModulo:diario_obra,usar');
    Route::post('fvs-modelos', [FvsModeloController::class, 'store'])
        ->middleware('permissaoModulo:diario_obra,criar');
    Route::put('fvs-modelos/{fvsModelo}', [FvsModeloController::class, 'update'])
        ->middleware('permissaoModulo:diario_obra,editar');
    Route::delete('fvs-modelos/{fvsModelo}', [FvsModeloController::class, 'destroy'])
        ->middleware('permissaoModulo:diario_obra,excluir');

    Route::get('obras/{obra}/fvs-vinculos', [FvsVinculoController::class, 'index'])
        ->middleware(['permissaoModulo:diario_obra,usar', 'permissaoObra:ver']);
    Route::post('obras/{obra}/fvs-vinculos', [FvsVinculoController::class, 'store'])
        ->middleware(['permissaoModulo:diario_obra,editar', 'permissaoObra:lancar']);
    Route::delete('obras/{obra}/fvs-vinculos/{fvsVinculo}', [FvsVinculoController::class, 'destroy'])
        ->middleware(['permissaoModulo:diario_obra,editar', 'permissaoObra:lancar']);

    // "Banco de verificações da obra" (plano, D4) — todas as fichas de todos os RDOs.
    Route::get('obras/{obra}/fvs', [FvsController::class, 'porObra'])
        ->middleware(['permissaoModulo:diario_obra,usar', 'permissaoObra:ver']);

    Route::put('fvs/{fvsPreenchimento}', [FvsController::class, 'salvar'])
        ->middleware(['permissaoModulo:diario_obra,editar', 'permissaoObra:lancar']);
    Route::post('fvs/itens/{item}/fotos', [FvsController::class, 'enviarFoto'])
        ->middleware('permissaoModulo:diario_obra,editar');
    Route::delete('fvs/fotos/{foto}', [FvsController::class, 'removerFoto'])
        ->middleware('permissaoModulo:diario_obra,editar');
});
