<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Diário de Obra — tabelas estruturadas do checklist (08/09/2026):
 * responsáveis presentes, catálogo de equipamentos + uso diário,
 * ocorrências, pendências e comentários internos (ocultáveis do
 * contratante da obra). Todas dependuram de `diario_registros`
 * (cascade delete) exceto o catálogo de equipamentos, que é por
 * empresa (reutilizável entre obras e lançamentos).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('diario_responsaveis_presentes', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('registro_id', 36);
            $table->string('nome', 150);
            $table->string('empresa', 150)->nullable();
            $table->string('funcao', 120)->nullable();
            $table->string('contrato_referencia', 150)->nullable();
            $table->boolean('presente')->default(true);
            $table->timestamps();

            $table->foreign('registro_id')->references('id')->on('diario_registros')->cascadeOnDelete();
            $table->index('registro_id');
        });

        Schema::create('equipamentos_catalogo', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('nome', 150);
            $table->string('tipo', 80)->nullable();
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->index('empresa_id');
        });

        Schema::create('diario_equipamentos_uso', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('registro_id', 36);
            $table->string('equipamento_id', 36);
            $table->integer('quantidade')->default(1);
            $table->timestamps();

            $table->foreign('registro_id')->references('id')->on('diario_registros')->cascadeOnDelete();
            $table->foreign('equipamento_id')->references('id')->on('equipamentos_catalogo')->cascadeOnDelete();
            $table->index('registro_id');
        });

        Schema::create('diario_ocorrencias', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('registro_id', 36);
            // tipo: nao_conformidade | mudanca_projeto | interferencia | interrupcao
            $table->string('tipo', 40);
            $table->text('descricao');
            $table->string('responsavel', 150)->nullable();
            $table->text('motivo')->nullable();
            $table->text('danos_materiais')->nullable();
            $table->timestamps();

            $table->foreign('registro_id')->references('id')->on('diario_registros')->cascadeOnDelete();
            $table->index('registro_id');
        });

        Schema::create('diario_pendencias', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('registro_id', 36);
            $table->text('descricao');
            $table->string('responsavel', 150)->nullable();
            $table->date('prazo')->nullable();
            // status: aberta | concluida
            $table->string('status', 20)->default('aberta');
            $table->timestamps();

            $table->foreign('registro_id')->references('id')->on('diario_registros')->cascadeOnDelete();
            $table->index('registro_id');
        });

        Schema::create('diario_comentarios_internos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('registro_id', 36);
            $table->foreignId('autor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('texto');
            $table->boolean('visivel_contratante')->default(false);
            $table->timestamps();

            $table->foreign('registro_id')->references('id')->on('diario_registros')->cascadeOnDelete();
            $table->index('registro_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('diario_comentarios_internos');
        Schema::dropIfExists('diario_pendencias');
        Schema::dropIfExists('diario_ocorrencias');
        Schema::dropIfExists('diario_equipamentos_uso');
        Schema::dropIfExists('equipamentos_catalogo');
        Schema::dropIfExists('diario_responsaveis_presentes');
    }
};
