<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Diárias (F7, 22/09/2026) — lançamento de diária de um profissional numa
 * obra. `profissional_*` e `valor_diaria_base` são SNAPSHOT do cadastro
 * (`materiais_equipamentos`... não, do cadastro de Profissionais, ponte de
 * storage) no momento do lançamento: mudar o cadastro depois não altera
 * diárias já lançadas (decisão do plano). Por isso `profissional_id` NÃO
 * tem foreign key — o cadastro de Profissionais ainda mora na ponte
 * chave-valor, sem tabela própria.
 *
 * `status`: 'rascunho' (editável, pode ainda não ter etapas fechando 100%)
 * ou 'fechada' (gerou um Pagamento, granhado em `pagamento_id`, e não pode
 * gerar outro). As etapas e o percentual de cada uma ficam em
 * `diaria_etapas` (próxima migration).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('diarias', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('obra_id', 36);
            $table->string('profissional_id', 36);
            $table->string('profissional_nome', 150)->default('');
            $table->string('profissional_funcao', 100)->default('');
            $table->date('data');
            $table->boolean('meia_diaria')->default(false);
            $table->decimal('valor_diaria_base', 12, 2)->default(0);
            $table->decimal('vale_transporte', 12, 2)->default(0);
            $table->decimal('vale_alimentacao', 12, 2)->default(0);
            $table->decimal('combustivel', 12, 2)->default(0);
            $table->decimal('valor_extra', 12, 2)->default(0);
            $table->text('observacoes')->nullable();
            // rascunho | fechada
            $table->string('status', 20)->default('rascunho');
            $table->string('pagamento_id', 36)->nullable();
            // manual | rdo (rdo ainda não gera nada — chega na F9)
            $table->string('origem', 20)->default('manual');
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->foreign('pagamento_id')->references('id')->on('pagamentos')->nullOnDelete();
            $table->index('empresa_id');
            $table->index(['obra_id', 'data']);
            $table->index('profissional_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('diarias');
    }
};
