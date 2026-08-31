<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Acesso de um usuário secundário a UMA obra específica (31/08/2026,
 * pedido do Lucas) — separado da permissão por módulo: agir no módulo M
 * na obra O exige as duas coisas ao mesmo tempo (ver `PermissaoService`).
 * Editado na própria tela da obra (`obra-detalhe.ts`), não na aba de
 * Configurações. Ausência de linha = sem acesso — fail-closed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('obra_acessos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('obra_id', 36);
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('pode_ver')->default(false);
            $table->boolean('pode_lancar')->default(false);
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->unique(['obra_id', 'user_id']);
            $table->index('empresa_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('obra_acessos');
    }
};
