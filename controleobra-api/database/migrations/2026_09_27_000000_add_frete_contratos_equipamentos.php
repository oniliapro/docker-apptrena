<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 27/09/2026 — pedido do Lucas: contrato de equipamento ganha um valor de
 * frete (na entrega inicial), com a mesma decisão que o Mapa já tem —
 * "lançar como item" (linha própria no pagamento, com sua etapa da EAP) ou
 * embutir, distribuindo proporcionalmente no valor dos itens. Só se aplica
 * na CRIAÇÃO do contrato (a entrega inicial) — renovação não carrega frete.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contratos_equipamentos', function (Blueprint $table) {
            $table->decimal('frete', 14, 2)->default(0)->after('fornecedor');
            $table->boolean('lancar_frete_como_item')->default(false)->after('frete');
            $table->string('frete_etapa_id', 36)->nullable()->after('lancar_frete_como_item');
        });
    }

    public function down(): void
    {
        Schema::table('contratos_equipamentos', function (Blueprint $table) {
            $table->dropColumn(['frete', 'lancar_frete_como_item', 'frete_etapa_id']);
        });
    }
};
