<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Link de acesso do contratante da obra (cliente final) ao Diário de
 * Obra — somente leitura, sem login (magic link/token por obra,
 * 08/09/2026). `expira_em` nulo = link "eterno" (sem expiração); pode
 * ser revogado a qualquer momento setando `revogado_em`. O token em si
 * é a autorização (não há outra checagem de identidade) — por isso é
 * gerado longo e aleatório (64 chars), nunca sequencial.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('obra_contratante_links', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('obra_id', 36);
            $table->string('token', 64)->unique();
            $table->string('nome_contato', 150)->nullable();
            $table->string('telefone_whatsapp', 30)->nullable();
            $table->timestamp('expira_em')->nullable();
            $table->timestamp('revogado_em')->nullable();
            $table->foreignId('criado_por_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->index(['obra_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('obra_contratante_links');
    }
};
