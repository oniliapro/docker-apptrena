<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Isola por empresa a estrutura relacional completa (obras, mapas,
 * empreitas, pagamentos) — necessário pra migrar o frontend do "balde
 * genérico" (app_storage) pra essas tabelas de verdade, suportando várias
 * obras por empresa (uma empresa pode ter várias obras/clientes).
 *
 * empresa_id fica direto em cada uma dessas 4 tabelas (não só em "obras")
 * porque mapas/empreitas/pagamentos têm obra_id opcional (podem existir
 * sem uma obra vinculada ainda) — melhor cada um carregar sua própria
 * empresa_id do que depender de um join que pode ser nulo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('obras', function (Blueprint $table) {
            $table->uuid('empresa_id')->nullable()->after('id');
            $table->index('empresa_id');
        });

        Schema::table('mapas', function (Blueprint $table) {
            $table->uuid('empresa_id')->nullable()->after('id');
            $table->index('empresa_id');
        });

        Schema::table('empreitas', function (Blueprint $table) {
            $table->uuid('empresa_id')->nullable()->after('id');
            $table->index('empresa_id');
        });

        Schema::table('pagamentos', function (Blueprint $table) {
            $table->uuid('empresa_id')->nullable()->after('id');
            $table->index('empresa_id');
        });
    }

    public function down(): void
    {
        foreach (['obras', 'mapas', 'empreitas', 'pagamentos'] as $tabela) {
            Schema::table($tabela, function (Blueprint $table) {
                $table->dropIndex(['empresa_id']);
                $table->dropColumn('empresa_id');
            });
        }
    }
};
