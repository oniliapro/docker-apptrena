<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Lançar frete como item" (16/08/2026, pedido do Lucas) — controla como
 * o frete de cada fornecedor entra no pagamento gerado pelo mapa:
 *
 * - Ligado (`true`, o padrão — é o comportamento que o sistema sempre
 *   teve, então mapas antigos continuam se comportando igual): o frete
 *   vira uma linha própria no pagamento, e essa linha pode ter uma etapa
 *   (`frete_etapa_id`, opcional).
 * - Desligado: o frete não vira linha nenhuma — é distribuído
 *   proporcionalmente entre os itens de cada fornecedor (embutido no
 *   valor de cada um), então `frete_etapa_id` não se aplica.
 *
 * Ver `MapaStore::construirLinhasDoFornecedor` no frontend.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->boolean('lancar_frete_como_item')->default(true)->after('frete_particular');
            $table->string('frete_etapa_id', 36)->nullable()->after('lancar_frete_como_item');

            $table->foreign('frete_etapa_id')->references('id')->on('eap_itens')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->dropForeign(['frete_etapa_id']);
            $table->dropColumn(['lancar_frete_como_item', 'frete_etapa_id']);
        });
    }
};
