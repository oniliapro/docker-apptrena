<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Lançar imposto/desconto como item" (01/09/2026, pedido do Lucas) —
 * mesma ideia de `lancar_frete_como_item` (16-19/08/2026), só que pro
 * imposto+desconto da nota (que sempre andaram juntos numa linha só, ver
 * `MapaStore::construirLinhasDoFornecedor`), agora com um toggle
 * independente do de frete:
 *
 * - Ligado (`true`, o padrão — mapas antigos continuam se comportando
 *   igual): imposto/desconto viram uma linha própria no pagamento, com
 *   etapa (`imposto_desconto_etapa_id`) e categoria
 *   (`imposto_desconto_categoria_tipo`) opcionais.
 * - Desligado: ficam embutidos proporcionalmente no valor dos itens de
 *   cada fornecedor, sem virar linha.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->boolean('lancar_imposto_desconto_como_item')->default(true)->after('frete_categoria_tipo');
            $table->string('imposto_desconto_etapa_id', 36)->nullable()->after('lancar_imposto_desconto_como_item');
            $table->string('imposto_desconto_categoria_tipo', 20)->nullable()->after('imposto_desconto_etapa_id');

            $table->foreign('imposto_desconto_etapa_id')->references('id')->on('eap_itens')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->dropForeign(['imposto_desconto_etapa_id']);
            $table->dropColumn(['lancar_imposto_desconto_como_item', 'imposto_desconto_etapa_id', 'imposto_desconto_categoria_tipo']);
        });
    }
};
