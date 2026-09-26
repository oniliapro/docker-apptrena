<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 26/09/2026 — pedido do Lucas: "na parte dos equipamentos, crie duas
 * tabelas semelhantes a mão de obra interna e externa... para equipamentos
 * próprios e equipamentos alugados". `categoria` separa as duas colunas da
 * tela; `contrato_equipamento_item_id` (só faz sentido pra "alugado") liga
 * a linha a um item de um contrato do módulo de Contratos de equipamentos —
 * é dali que "nome, fornecedor, o contrato do equipamento" saem sozinhos.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rdo_equipamentos', function (Blueprint $table) {
            $table->string('categoria', 20)->default('proprio')->after('rdo_id'); // proprio | alugado
            $table->string('contrato_equipamento_item_id', 36)->nullable()->after('equipamento_id');
            $table->foreign('contrato_equipamento_item_id', 'rdo_equip_contrato_item_fk')
                ->references('id')->on('contrato_equipamento_itens')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('rdo_equipamentos', function (Blueprint $table) {
            $table->dropForeign('rdo_equip_contrato_item_fk');
            $table->dropColumn(['categoria', 'contrato_equipamento_item_id']);
        });
    }
};
