<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Uma linha por item da EAP (grupo ou folha) dentro de uma medição — ver
 * a migration de `medicoes`. Só existe o registro (id/ordem); o valor
 * medido de cada categoria de custo fica em `medicao_item_tipos`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('medicao_itens', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('medicao_id', 36);
            $table->string('eap_item_id', 36);
            $table->unsignedInteger('ordem')->default(0);
            $table->timestamps();

            $table->foreign('medicao_id')->references('id')->on('medicoes')->cascadeOnDelete();
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->cascadeOnDelete();
            $table->unique(['medicao_id', 'eap_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('medicao_itens');
    }
};
