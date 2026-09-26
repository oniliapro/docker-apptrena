<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Controle de contrato de equipamentos alugados (26/09/2026, pedido do
 * Lucas). Um contrato tem uma data de entrega (início do 1º período) e uma
 * data de vencimento calculada a partir do período (dias corridos ou úteis).
 * Cada renovação pode ser parcial — alguns itens voltam pro fornecedor
 * (`devolvido_em` preenchido), outros continuam — e sempre conta o período
 * novo a partir do vencimento ANTERIOR, nunca da data de entrega original.
 * Criação e cada renovação geram um Pagamento próprio (`origem_tipo =
 * 'contrato_equipamento'`), e o vencimento sempre tem um lembrete na Agenda
 * no dia útil anterior.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contratos_equipamentos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('obra_id', 36);
            $table->integer('numero');
            $table->string('nome_contrato', 150);
            $table->string('fornecedor', 150);
            $table->date('data_entrega');
            $table->integer('periodo_quantidade');
            $table->string('periodo_unidade', 20); // dias_corridos | dias_uteis
            $table->date('data_vencimento');
            // Preenchido quando a última renovação devolveu todos os itens —
            // diferencia "encerrado de propósito" de "vencido com item ainda fora".
            $table->dateTime('encerrado_em')->nullable();
            $table->string('pagamento_inicial_id', 36)->nullable();
            $table->string('agenda_evento_id', 36)->nullable();
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->foreign('pagamento_inicial_id')->references('id')->on('pagamentos')->nullOnDelete();
            $table->foreign('agenda_evento_id')->references('id')->on('agenda_eventos')->nullOnDelete();
            $table->index(['obra_id', 'numero']);
        });

        Schema::create('contrato_equipamento_itens', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('contrato_id', 36);
            $table->string('descricao', 150);
            $table->integer('quantidade');
            $table->decimal('valor_unitario', 14, 2);
            // Nulo = ainda com o cliente (conta em "equipamentos atuais"); preenchido =
            // devolvido nesta data (sempre a data de uma renovação — não sai antes disso).
            $table->date('devolvido_em')->nullable();
            $table->integer('ordem')->default(0);
            $table->timestamps();

            $table->foreign('contrato_id')->references('id')->on('contratos_equipamentos')->cascadeOnDelete();
            $table->index('contrato_id');
        });

        Schema::create('contrato_equipamento_renovacoes', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('contrato_id', 36);
            $table->date('data_renovacao');
            $table->integer('periodo_quantidade');
            $table->string('periodo_unidade', 20);
            $table->date('data_vencimento_nova');
            $table->decimal('valor_total', 14, 2);
            $table->string('pagamento_id', 36)->nullable();
            $table->timestamps();

            $table->foreign('contrato_id')->references('id')->on('contratos_equipamentos')->cascadeOnDelete();
            $table->foreign('pagamento_id')->references('id')->on('pagamentos')->nullOnDelete();
            $table->index('contrato_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contrato_equipamento_renovacoes');
        Schema::dropIfExists('contrato_equipamento_itens');
        Schema::dropIfExists('contratos_equipamentos');
    }
};
