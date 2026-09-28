<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 27/09/2026, pedido do Lucas — aviso na Agenda quando a medição física do
 * empreiteiro chega em 80% (hora de providenciar o contrato, se ainda não
 * tiver um). `medicao80_alertada` evita avisar de novo a cada medição nova
 * depois da primeira vez que passou de 80% — é um aviso único, não recorrente.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->boolean('medicao80_alertada')->default(false)->after('contrato_agenda_evento_id');
        });
    }

    public function down(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->dropColumn('medicao80_alertada');
        });
    }
};
