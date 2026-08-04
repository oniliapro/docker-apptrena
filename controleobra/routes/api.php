<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DiarioObraController;
use App\Http\Controllers\Api\EmpreitaController;
use App\Http\Controllers\Api\MapaController;
use App\Http\Controllers\Api\NotaFiscalController;
use App\Http\Controllers\Api\ObraController;
use App\Http\Controllers\Api\PagamentoController;
use App\Http\Controllers\Api\StorageController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API — Controle de Obra (App do Lucas)
|--------------------------------------------------------------------------
| Prefixo final: /api/... (Laravel já aplica o prefixo "api" a este arquivo
| via bootstrap/app.php).
|
| Login: POST /api/login (público) devolve um token Sanctum. O frontend
| guarda esse token e manda "Authorization: Bearer <token>" em toda
| chamada às rotas protegidas abaixo.
*/

// throttle: no máximo 5 tentativas de login por minuto por IP, pra dificultar
// ataque de força bruta na senha.
Route::post('login', [AuthController::class, 'login'])->middleware('throttle:5,1');

// Cadastro público de uma nova empresa/cliente. Throttle mais generoso, mas
// ainda limitado, pra dificultar cadastro em massa automatizado.
Route::post('registrar', [AuthController::class, 'registrar'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('logout', [AuthController::class, 'logout']);
    Route::get('me', [AuthController::class, 'me']);

    Route::apiResource('obras', ObraController::class);
    Route::get('obras/{obra}/eap', [ObraController::class, 'showEap']);
    Route::put('obras/{obra}/eap', [ObraController::class, 'syncEap']);

    Route::get('diario', [DiarioObraController::class, 'index']);
    Route::post('diario', [DiarioObraController::class, 'store']);
    Route::delete('diario/{registro}', [DiarioObraController::class, 'destroy']);

    Route::apiResource('mapas', MapaController::class);

    Route::apiResource('empreitas', EmpreitaController::class);
    Route::post('empreitas/{empreita}/registros', [EmpreitaController::class, 'registrarMedicao']);

    Route::apiResource('pagamentos', PagamentoController::class);
    Route::post('pagamentos/ler-nota', [NotaFiscalController::class, 'ler']);
    Route::post('fornecedores/ler-nota', [NotaFiscalController::class, 'lerFornecedor']);

    Route::get('storage', [StorageController::class, 'get']);
    Route::post('storage', [StorageController::class, 'set']);
    Route::delete('storage', [StorageController::class, 'remove']);
});
