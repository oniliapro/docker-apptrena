<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Código interno do mapa (ex.: "MAPA-014") — identificador único do
 * lançamento no sistema inteiro, pedido do Lucas (20/08/2026). Diferente
 * do "Nº do mapa" (`numero_mapa`), que passou a contar só dentro da obra
 * (1, 2, 3… por obra) — este é gerado pelo backend em
 * MapaController::proximoCodigo() na criação, nunca reescrito depois, e a
 * constraint UNIQUE aqui garante de verdade a unicidade (ao contrário dos
 * códigos client-side dos cadastros em chave-valor, que são só
 * best-effort).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->string('codigo', 20)->nullable()->unique()->after('id');
        });
    }

    public function down(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->dropColumn('codigo');
        });
    }
};
