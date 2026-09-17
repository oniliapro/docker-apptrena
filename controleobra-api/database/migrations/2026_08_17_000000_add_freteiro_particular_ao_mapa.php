<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nome do freteiro (transportador) do frete particular (17/08/2026,
 * pedido do Lucas) — só preenchido quando o usuário clica em "considerar
 * frete particular" no cabeçalho do mapa.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->string('freteiro_particular')->nullable()->after('frete_particular');
        });
    }

    public function down(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->dropColumn('freteiro_particular');
        });
    }
};
