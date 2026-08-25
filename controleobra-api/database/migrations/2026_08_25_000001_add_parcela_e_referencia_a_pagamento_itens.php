<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 25/08/2026, redesign da tela de Empreita (pedido do Lucas): até aqui, um
 * pagamento gerado por uma Empreita só lançava a parcela Empreiteiro — a
 * Reserva nunca virava item de pagamento. No layout novo, o rascunho de
 * "Pagamento" tem os dois lados, e o pagamento gerado passa a carregar os
 * dois — precisa de como marcar QUAL lado cada item representa
 * (`parcela_empreita`), e de um snapshot imutável do valor que a engine
 * calculou no momento da geração (`valor_referencia`), usado pra calcular a
 * "Divergência" (medido × liberado) sem precisar reconstruir o cálculo
 * histórico depois (o contrato pode mudar, a medição fecha período, etc.).
 * `empreita_item_id` liga o item do pagamento de volta à linha da empreita
 * que o originou — hoje só dá pra saber via `descricao`/`eapId`, que não é
 * uma chave estável o bastante para agregar "Já pago" por linha.
 *
 * Todas nullable: pagamentos que não vêm de uma Empreita (Mapa, manual)
 * continuam sem preencher nada disso.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pagamento_itens', function (Blueprint $table) {
            $table->string('parcela_empreita', 20)->nullable()->after('modo_valor');
            $table->string('empreita_item_id', 36)->nullable()->after('parcela_empreita');
            $table->decimal('valor_referencia', 14, 2)->nullable()->after('empreita_item_id');

            $table->foreign('empreita_item_id')->references('id')->on('empreita_itens')->nullOnDelete();
            $table->index('empreita_item_id');
        });
    }

    public function down(): void
    {
        Schema::table('pagamento_itens', function (Blueprint $table) {
            $table->dropForeign(['empreita_item_id']);
            $table->dropColumn(['parcela_empreita', 'empreita_item_id', 'valor_referencia']);
        });
    }
};
