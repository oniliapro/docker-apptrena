<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Valor planejado discriminado por categoria de custo (24/08/2026,
 * pedido do Lucas — corrige a decisão anterior de "um valor só por
 * item"): agora cada categoria (Material, Mão de obra…) tem seu próprio
 * valor planejado dentro do mesmo item × período, igual ao Orçado/
 * Realizado já funcionam em todo o resto do sistema.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cronograma_planejamentos', function (Blueprint $table) {
            $table->smallInteger('tipo_custo_id')->nullable()->after('eap_item_id');
        });

        // A nova unique (que também começa por eap_item_id) precisa existir
        // ANTES de derrubar a antiga — o MySQL recusa apagar um índice que
        // ainda é o único cobrindo a FK de eap_item_id, mesmo dentro do
        // mesmo ALTER (erro 1553, achado rodando a migration de verdade).
        Schema::table('cronograma_planejamentos', function (Blueprint $table) {
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
            // Nome explícito e curto — o nome automático do Laravel passa
            // dos 64 caracteres que o MySQL aceita (erro 1059, achado
            // rodando a migration de verdade).
            $table->unique(['eap_item_id', 'periodo_inicio', 'tipo_custo_id'], 'cronograma_planej_item_periodo_tipo_unique');
        });

        Schema::table('cronograma_planejamentos', function (Blueprint $table) {
            $table->dropUnique(['eap_item_id', 'periodo_inicio']);
        });
    }

    public function down(): void
    {
        Schema::table('cronograma_planejamentos', function (Blueprint $table) {
            $table->unique(['eap_item_id', 'periodo_inicio']);
        });

        Schema::table('cronograma_planejamentos', function (Blueprint $table) {
            $table->dropForeign(['tipo_custo_id']);
            $table->dropUnique('cronograma_planej_item_periodo_tipo_unique');
            $table->dropColumn('tipo_custo_id');
        });
    }
};
