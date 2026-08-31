<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Base do RBAC (31/08/2026, pedido do Lucas) — `papel` já existia
 * (`'admin'` | agora também `'secundario'`, validado na aplicação, sem
 * enum no banco). `pode_gerenciar_permissoes`: só é lido para usuários
 * `'secundario'` — um secundário com essa flag pode editar permissões de
 * OUTROS secundários, exceto de outro que também tenha a flag (regra
 * aplicada em `UsuarioController::autorizarEdicao`, não aqui). `ativo`:
 * usuário inativo é bloqueado no login (`AuthController::login`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('pode_gerenciar_permissoes')->default(false)->after('papel');
            $table->boolean('ativo')->default(true)->after('pode_gerenciar_permissoes');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['pode_gerenciar_permissoes', 'ativo']);
        });
    }
};
