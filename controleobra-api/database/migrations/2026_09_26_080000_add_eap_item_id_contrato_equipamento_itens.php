<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 26/09/2026 — pedido do Lucas: cada item de um contrato de equipamento pode
 * ser ligado a uma etapa da EAP (rastreio de custo, mesma ideia de
 * `pagamento_itens.eap_item_id`) — o vínculo passa para o item do Pagamento
 * gerado na criação/renovação (`ContratoEquipamentoController::gerarPagamento`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contrato_equipamento_itens', function (Blueprint $table) {
            $table->string('eap_item_id', 36)->nullable()->after('descricao');
        });
    }

    public function down(): void
    {
        Schema::table('contrato_equipamento_itens', function (Blueprint $table) {
            $table->dropColumn('eap_item_id');
        });
    }
};
