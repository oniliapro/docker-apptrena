<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * F9 (24/09/2026) — etapa do RDO pode se vincular a um item de verdade da
 * EAP da obra (mesmo padrão de `DiariaEtapa::eap_item_id`), pra rastrear em
 * qual etapa do orçamento o dia de trabalho aconteceu. Nullable de
 * propósito: continua dando pra lançar uma etapa como texto livre (ex.:
 * "Limpeza do canteiro"), que não corresponde a nenhuma linha da EAP.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rdo_etapas', function (Blueprint $table) {
            $table->string('eap_item_id', 36)->nullable()->after('rdo_id');
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('rdo_etapas', function (Blueprint $table) {
            $table->dropForeign(['eap_item_id']);
            $table->dropColumn('eap_item_id');
        });
    }
};
