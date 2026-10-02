<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Gerar contrato de equipamento" a partir do Mapa (01/10/2026, Parte 2 das
 * pendências de outubro, pedido do Lucas) — só rastreabilidade (de qual Mapa
 * o contrato veio), não entra em nenhuma regra de negócio. Mesmo padrão de
 * `pagamentos.mapa_id` (`2024_01_01_000000_create_controle_obra_schema.php`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contratos_equipamentos', function (Blueprint $table) {
            $table->string('mapa_id', 36)->nullable()->after('obra_id');
            $table->foreign('mapa_id')->references('id')->on('mapas')->nullOnDelete();
            $table->index('mapa_id');
        });
    }

    public function down(): void
    {
        Schema::table('contratos_equipamentos', function (Blueprint $table) {
            $table->dropForeign(['mapa_id']);
            $table->dropIndex(['mapa_id']);
            $table->dropColumn('mapa_id');
        });
    }
};
