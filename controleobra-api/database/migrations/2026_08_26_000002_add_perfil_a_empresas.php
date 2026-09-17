<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 1 do popup de Configurações (26/08/2026, pedido do Lucas) — aba
 * "Dados da empresa": cadastro completo da empresa (razão social, CNPJ já
 * existia, inscrição estadual, endereço, contato) + identidade visual
 * (cores, fonte, logo, papel timbrado). Legado: `empresas.nome` já é usado
 * como nome fantasia desde o cadastro público (`AuthController::registrar`)
 * — não renomeado aqui pra não quebrar essa tela.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('empresas', function (Blueprint $table) {
            $table->string('razao_social')->nullable()->after('nome');
            $table->string('inscricao_estadual', 30)->nullable()->after('cnpj');
            $table->string('endereco')->nullable()->after('inscricao_estadual');
            $table->string('telefone', 30)->nullable()->after('endereco');
            $table->string('email_contato')->nullable()->after('telefone');
            $table->string('cor_primaria', 7)->nullable()->after('email_contato');
            $table->string('cor_secundaria', 7)->nullable()->after('cor_primaria');
            $table->string('fonte', 30)->default('padrao')->after('cor_secundaria');
            $table->string('logo_path')->nullable()->after('fonte');
            $table->string('papel_timbrado_path')->nullable()->after('logo_path');
        });
    }

    public function down(): void
    {
        Schema::table('empresas', function (Blueprint $table) {
            $table->dropColumn([
                'razao_social', 'inscricao_estadual', 'endereco', 'telefone', 'email_contato',
                'cor_primaria', 'cor_secundaria', 'fonte', 'logo_path', 'papel_timbrado_path',
            ]);
        });
    }
};
