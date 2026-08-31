<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Representantes legais da empresa (26/08/2026, pedido do Lucas) — pro
 * futuro módulo de contratos/propostas preencher automaticamente quem
 * assina. `ativo` em vez de exclusão de verdade, mesma convenção já usada
 * em Clientes/Responsáveis/Empreiteiros.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('empresa_representantes', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('nome');
            $table->string('cargo')->nullable();
            $table->string('cpf', 14)->nullable();
            $table->string('email')->nullable();
            $table->string('telefone', 30)->nullable();
            $table->boolean('ativo')->default(true);
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->index('empresa_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('empresa_representantes');
    }
};
