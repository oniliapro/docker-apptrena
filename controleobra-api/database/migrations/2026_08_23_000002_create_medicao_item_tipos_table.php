<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Valor medido (percentual acumulado até esta medição, 0-100) de um item
 * por categoria de custo — mesma forma de `eap_item_custos`/
 * `eap_item_orcados_congelados`, uma linha por categoria. Só existe linha
 * aqui quando há um valor concreto a gravar: sempre pros itens-folha;
 * pros itens de grupo, só quando o usuário sobrescreve manualmente
 * (`manual = true`) — sem sobrescrita, o valor do grupo é sempre
 * recalculado ao vivo no frontend como a média ponderada pelo orçado dos
 * descendentes-folha (ver `MedicaoStore`/`medicao-engine.ts`), e só é
 * congelado aqui no momento em que a medição é aprovada.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('medicao_item_tipos', function (Blueprint $table) {
            $table->string('medicao_item_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->decimal('valor_percentual', 7, 4)->default(0);
            $table->boolean('manual')->default(false);

            $table->primary(['medicao_item_id', 'tipo_custo_id']);
            $table->foreign('medicao_item_id')->references('id')->on('medicao_itens')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('medicao_item_tipos');
    }
};
