<?php

use App\Http\Controllers\Api\ArquivoController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DiarioObraController;
use App\Http\Controllers\Api\EmpreitaController;
use App\Http\Controllers\Api\MapaController;
use App\Http\Controllers\Api\NotaFiscalController;
use App\Http\Controllers\Api\ObraController;
use App\Http\Controllers\Api\PagamentoController;
use App\Http\Controllers\Api\PastaController;
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

// Streaming de arquivos/miniaturas via URL assinada (não autenticada por
// Sanctum, porque tags <img>/<video>/<audio>/<iframe> não mandam header
// Authorization no `src`). A checagem de privacidade acontece só em
// ArquivoController::previewUrl, que é quem assina o link — a assinatura
// HMAC em si é a autorização daqui pra baixo. Ver comentário em
// ArquivoController.
Route::get('arquivos/{arquivo}/stream', [ArquivoController::class, 'stream'])
    ->name('arquivos.stream')->middleware('signed');
Route::get('arquivos/{arquivo}/stream-thumb', [ArquivoController::class, 'streamThumb'])
    ->name('arquivos.streamThumb')->middleware('signed');

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

    Route::get('obras/{obra}/pastas/raizes', [PastaController::class, 'raizes']);
    Route::get('pastas/{pasta}', [PastaController::class, 'show']);
    Route::post('pastas/{pasta}/subpastas', [PastaController::class, 'store']);
    Route::put('pastas/{pasta}', [PastaController::class, 'update']);
    Route::delete('pastas/{pasta}', [PastaController::class, 'destroy']);

    Route::post('pastas/{pasta}/arquivos', [ArquivoController::class, 'store']);
    Route::put('arquivos/{arquivo}', [ArquivoController::class, 'update']);
    Route::delete('arquivos/{arquivo}', [ArquivoController::class, 'destroy']);
    Route::get('arquivos/{arquivo}/download', [ArquivoController::class, 'download']);
    Route::get('arquivos/{arquivo}/preview-url', [ArquivoController::class, 'previewUrl']);
});
