<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rastreia, em cada item de Pagamento, de qual Diária (e não apenas de qual
 * Mapa/Empreita) ele veio (F7, 22/09/2026) — mesma ideia de `eap_item_id`/
 * `empreita_item_id` já existentes na tabela. `nullOnDelete`: apagar a
 * diária não apaga o pagamento já gerado, só solta a referência.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pagamento_itens', function (Blueprint $table) {
            $table->string('diaria_id', 36)->nullable()->after('empreita_item_id');
            $table->foreign('diaria_id')->references('id')->on('diarias')->nullOnDelete();
            $table->index('diaria_id');
        });
    }

    public function down(): void
    {
        Schema::table('pagamento_itens', function (Blueprint $table) {
            $table->dropForeign(['diaria_id']);
            $table->dropColumn('diaria_id');
        });
    }
};
