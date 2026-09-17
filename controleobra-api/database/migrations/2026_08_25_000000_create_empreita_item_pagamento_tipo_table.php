<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rascunho do "Pagamento" do período atual, por serviço da empreita e por
 * categoria de custo (25/08/2026, redesign da tela de Empreita, pedido do
 * Lucas). Pré-preenchido pelo valor calculado (`pagarPorTipo`/
 * `reservarPorTipo` da engine), mas editável antes de "Gerar pagamento" —
 * precisa sobreviver a um reload de página, porque `EmpreitaStore.salvar()`
 * já grava tudo a cada mudança (mesmo padrão de `empreita_item_contrato_tipo`,
 * inclusive a chave composta).
 *
 * `null` em qualquer uma das duas colunas significa "sem sobrescrita, herda
 * o valor calculado pela engine" — mesma convenção de `medicao_atual` em
 * `empreita_item_medicoes_tipo`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('empreita_item_pagamento_tipo', function (Blueprint $table) {
            $table->string('empreita_item_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->decimal('pagamento_emp', 14, 2)->nullable();
            $table->decimal('pagamento_reserva', 14, 2)->nullable();

            $table->primary(['empreita_item_id', 'tipo_custo_id']);
            $table->foreign('empreita_item_id')->references('id')->on('empreita_itens')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('empreita_item_pagamento_tipo');
    }
};
