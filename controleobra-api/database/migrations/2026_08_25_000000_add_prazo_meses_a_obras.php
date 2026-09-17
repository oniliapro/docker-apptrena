<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Prazo da obra em meses (24/08/2026, pedido do Lucas) — usado pelo
 * Cronograma de Desembolso pra saber até quando gerar períodos (a partir
 * de `data_base`). `null` enquanto o Lucas não preencher — o cronograma
 * pede esse valor na própria tela quando falta.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('obras', function (Blueprint $table) {
            $table->unsignedInteger('prazo_meses')->nullable()->after('data_base');
        });
    }

    public function down(): void
    {
        Schema::table('obras', function (Blueprint $table) {
            $table->dropColumn('prazo_meses');
        });
    }
};
