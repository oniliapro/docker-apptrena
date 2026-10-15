<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Painel de planos (15/10/2026, pedido do Lucas): todas as contas que existem
 * hoje passam a vencer daqui a 30 dias — o prazo conta a partir de QUANDO ESTA
 * MIGRATION RODA (a publicação). Roda uma única vez.
 *
 * Só mexe na data (informativa): nenhuma conta é bloqueada por isso. Contas já
 * `suspensa`/`cancelada` ficam como estão (o status delas não existia antes do
 * painel, então na prática são todas as contas atuais).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('empresas')
            ->whereNotIn('assinatura_status', ['suspensa', 'cancelada'])
            ->update(['assinatura_valida_ate' => now()->addDays(30)]);
    }

    public function down(): void
    {
        // Sem reversão: a data anterior não é guardada em lugar nenhum.
    }
};
