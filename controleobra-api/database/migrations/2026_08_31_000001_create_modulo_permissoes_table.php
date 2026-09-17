<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Permissão de um usuário secundário num módulo do sistema (31/08/2026,
 * pedido do Lucas) — `pode_usar` é a visibilidade (sem ela, a ferramenta
 * some do menu inteira); as outras 4 só valem COM `pode_usar` junto (ver
 * `PermissaoService::podeModulo`). Ausência de linha para um (usuário,
 * módulo) = tudo falso — fail-closed, só grava o que foi explicitamente
 * ligado, não precisa popular uma linha "tudo desligado" pra cada módulo
 * na criação do usuário.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('modulo_permissoes', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('modulo', 40);
            $table->boolean('pode_usar')->default(false);
            $table->boolean('pode_criar')->default(false);
            $table->boolean('pode_editar')->default(false);
            $table->boolean('pode_excluir')->default(false);
            $table->boolean('pode_reabrir')->default(false);
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->unique(['user_id', 'modulo']);
            $table->index('empresa_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('modulo_permissoes');
    }
};
