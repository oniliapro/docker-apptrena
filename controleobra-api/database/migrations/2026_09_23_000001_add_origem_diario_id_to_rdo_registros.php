<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marca o RDO que veio da migração do Diário antigo (F8, 22/09/2026,
 * `php artisan diario:migrar-para-rdo`) — guarda o id do
 * `diario_registros` de origem, só pra o comando saber o que já migrou e
 * poder rodar de novo sem duplicar (idempotente). Não é FK de verdade
 * (`nullOnDelete` não pega aqui porque a tabela antiga não é mexida/apagada
 * por este lote — ela só some da navegação): mesmo se `diario_registros`
 * for removida um dia, este id fica só como um retrato histórico.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rdo_registros', function (Blueprint $table) {
            $table->string('origem_diario_id', 36)->nullable()->after('id');
            $table->unique('origem_diario_id');
        });
    }

    public function down(): void
    {
        Schema::table('rdo_registros', function (Blueprint $table) {
            $table->dropUnique(['origem_diario_id']);
            $table->dropColumn('origem_diario_id');
        });
    }
};
