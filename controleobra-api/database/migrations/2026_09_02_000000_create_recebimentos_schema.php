<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Módulo "Recebimentos" (01/09/2026, pedido do Lucas: "funciona exatamente
 * como os pagamentos") — mesmo desenho relacional de `pagamentos`/
 * `pagamento_itens`, espelhado ponto a ponto, com uma diferença de
 * domínio: Recebimento é dinheiro ENTRANDO (do cliente da obra), não
 * saindo (pro fornecedor/empreiteiro) — por isso troca `mapa_id`/
 * `empreita_id` por `medicao_id` (a origem automática de um recebimento é
 * a Medição da obra, via `MedicaoStore::gerarRecebimento`), e
 * `origem_tipo` vira `medicao|manual|outro` em vez de
 * `mapa|empreita|manual|outro`.
 *
 * `recebimento_itens` fica mais simples que `pagamento_itens`: não existe
 * a distinção Empreiteiro/Reserva aqui (isso é específico do contrato de
 * empreitada), então não replica `parcela_empreita`/`empreita_item_id`/
 * `valor_referencia`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recebimentos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->uuid('empresa_id')->nullable();
            $table->string('numero_recebimento', 30);
            $table->string('obra_id', 36)->nullable();
            $table->string('obra_number', 50)->default('');
            $table->date('data_solicitacao')->nullable();
            $table->dateTime('data_recebimento')->nullable();
            $table->string('cliente', 120)->default('');
            $table->text('descricao')->nullable();
            $table->decimal('valor_total', 14, 2)->default(0);
            $table->string('origem_tipo', 20)->default('manual'); // medicao | manual | outro
            $table->string('origem_ref_id', 36)->nullable();
            $table->string('medicao_id', 36)->nullable();
            $table->string('status', 20)->default('confirmado'); // pendente | confirmado
            $table->timestamps();

            $table->index('empresa_id');
            $table->foreign('obra_id')->references('id')->on('obras')->nullOnDelete();
            $table->foreign('medicao_id')->references('id')->on('medicoes')->nullOnDelete();
            $table->unique(['obra_id', 'numero_recebimento']);
            $table->index(['obra_id', 'data_solicitacao']);
            $table->index(['origem_tipo', 'origem_ref_id']);
        });

        Schema::create('recebimento_itens', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('recebimento_id', 36);
            $table->integer('ordem')->default(0);
            $table->text('descricao')->nullable();
            $table->smallInteger('tipo_custo_id')->nullable();
            $table->string('eap_item_id', 36)->nullable();
            $table->decimal('valor', 14, 2)->default(0);
            $table->string('modo_valor', 20)->default('valor'); // valor | percentual

            $table->foreign('recebimento_id')->references('id')->on('recebimentos')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo')->nullOnDelete();
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->nullOnDelete();
            $table->index(['recebimento_id', 'ordem']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recebimento_itens');
        Schema::dropIfExists('recebimentos');
    }
};
