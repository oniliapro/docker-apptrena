<?php

namespace App\Services;

use App\Models\Obra;
use App\Models\Pasta;

/**
 * Resolve/cria as pastas-raiz automáticas de uma obra (06/09/2026,
 * extraído de `PastaController::raizes()` — lá continua sendo chamado
 * pra montar a resposta de `GET /obras/{obra}/pastas/raizes`, e aqui
 * também é usado por `TagController`/`ObraController`, que precisam só da
 * raiz "compartilhada" pra criar a pasta de uma Tag, sem duplicar o
 * `firstOrCreate`).
 */
class PastaRaizes
{
    public static function propria(Obra $obra, string|int $userId): Pasta
    {
        return Pasta::firstOrCreate(
            ['obra_id' => $obra->id, 'owner_user_id' => $userId, 'tipo_raiz' => 'propria'],
            ['nome' => 'Arquivos próprios'],
        );
    }

    public static function compartilhada(Obra $obra): Pasta
    {
        return Pasta::firstOrCreate(
            ['obra_id' => $obra->id, 'owner_user_id' => null, 'tipo_raiz' => 'compartilhada'],
            ['nome' => 'Arquivos compartilhados'],
        );
    }
}
