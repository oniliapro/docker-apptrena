<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 15/10/2026 — três coisas que chegaram juntas:
 *
 *  1. `admins_plataforma`: o(s) dono(s) do ComTrena (quem vende o sistema),
 *     numa tabela À PARTE de `users`. É de propósito: um usuário de empresa
 *     nunca pode virar administrador da plataforma por engano de papel ou de
 *     permissão, e o login do painel de planos não se mistura com o login do
 *     sistema. A segunda etapa de verificação (TOTP) fica aqui.
 *  2. `empresas.fuso_horario`: fuso escolhido pela empresa (padrão São Paulo).
 *  3. `empresas.observacoes_plataforma`: anotação interna do dono sobre o
 *     cliente (negociação, forma de pagamento) — a empresa nunca vê.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admins_plataforma', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('email', 180)->unique();
            $table->string('password');
            // Segredo TOTP (base32), gravado criptografado pelo cast do model.
            $table->text('totp_secret')->nullable();
            // Só depois do primeiro código válido o segundo fator passa a valer.
            $table->timestamp('totp_confirmado_em')->nullable();
            // Último intervalo de 30s aceito — impede reutilizar o mesmo código.
            $table->unsignedBigInteger('totp_ultimo_intervalo')->nullable();
            $table->timestamp('ultimo_login_em')->nullable();
            $table->boolean('ativo')->default(true);
            $table->timestamps();
        });

        Schema::table('empresas', function (Blueprint $table) {
            $table->string('fuso_horario', 64)->default('America/Sao_Paulo')->after('assinatura_valida_ate');
            $table->text('observacoes_plataforma')->nullable()->after('fuso_horario');
        });
    }

    public function down(): void
    {
        Schema::table('empresas', function (Blueprint $table) {
            $table->dropColumn(['fuso_horario', 'observacoes_plataforma']);
        });

        Schema::dropIfExists('admins_plataforma');
    }
};
