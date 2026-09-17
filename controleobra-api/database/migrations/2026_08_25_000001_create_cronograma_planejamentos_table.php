<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Valor planejado de desembolso — um número só por item da EAP × período
 * (24/08/2026, pedido do Lucas: "empilhar os valores realizados com os
 * planejados" no Cronograma de Desembolso). `periodo_inicio` é a data de
 * início do período tal como ele existia quando foi planejado (não um
 * índice de coluna) — assim, se o Lucas trocar a unidade do período
 * (dia/semana/quinzena/mês/ano) depois, o valor planejado continua
 * ancorado numa data de calendário real, em vez de virar lixo por causa
 * de um índice que já significava outra coisa.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cronograma_planejamentos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('obra_id', 36);
            $table->string('eap_item_id', 36);
            $table->date('periodo_inicio');
            $table->decimal('valor', 14, 2)->default(0);
            $table->timestamps();

            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->cascadeOnDelete();
            $table->unique(['eap_item_id', 'periodo_inicio']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cronograma_planejamentos');
    }
};
