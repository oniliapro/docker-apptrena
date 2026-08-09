<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * O frontend (js/empreita/11-empreita-state.js) discrimina o Contrato da
 * Empreita por categoria de custo (contratoEmpPorTipo / contratoReservaPorTipo
 * — ver task #45, "Inverter lógica de discriminação do Contrato na
 * Empreita"), mas a tabela empreita_itens só guardava um valor único
 * (valor_emp / valor_reserva). Esta tabela guarda o detalhamento por
 * categoria, no mesmo padrão de empreita_item_medicoes_tipo. As colunas
 * legadas valor_emp/valor_reserva em empreita_itens continuam existindo,
 * como soma das categorias (compatibilidade com quem ainda lê só o total).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('empreita_item_contrato_tipo', function (Blueprint $table) {
            $table->string('empreita_item_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->decimal('contrato_emp', 14, 2)->default(0);
            $table->decimal('contrato_reserva', 14, 2)->default(0);

            $table->primary(['empreita_item_id', 'tipo_custo_id']);
            $table->foreign('empreita_item_id')->references('id')->on('empreita_itens')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('empreita_item_contrato_tipo');
    }
};
