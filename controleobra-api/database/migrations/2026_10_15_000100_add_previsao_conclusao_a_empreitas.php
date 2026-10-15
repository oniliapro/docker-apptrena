<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Previsão de conclusão" da empreita (15/10/2026, pedido do Lucas) —
 * alimenta a variável `{{previsao_conclusao}}` do modelo de contrato de
 * empreita. Opcional.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->date('previsao_conclusao')->nullable()->after('medicao_date');
        });
    }

    public function down(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->dropColumn('previsao_conclusao');
        });
    }
};
