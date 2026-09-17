<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Última edição" (20/08/2026, pedido do Lucas) — até aqui, `confirmed_at`
 * ("Finalização do mapa") era regravado a cada "Finalizar mapa", perdendo
 * a data da primeira finalização sempre que o mapa era reaberto e
 * finalizado de novo. Agora `confirmed_at` passa a ser travado na
 * PRIMEIRA finalização (ver MapaController::syncCompleto) e este campo
 * novo assume o papel de "última vez que foi finalizado", atualizado a
 * cada finalização (inclusive a primeira).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->timestamp('ultima_finalizacao_em')->nullable()->after('confirmed_at');
        });
    }

    public function down(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->dropColumn('ultima_finalizacao_em');
        });
    }
};
