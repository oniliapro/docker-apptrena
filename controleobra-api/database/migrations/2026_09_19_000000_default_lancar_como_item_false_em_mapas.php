<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Padrão de "lançar frete como item" e "lançar imposto/desconto como
 * item" passa de LIGADO para DESLIGADO (19/09/2026, pedido dos usuários).
 *
 * Só muda o DEFAULT da coluna — o valor já gravado em cada mapa existente
 * não é tocado (mapa em andamento continua calculando do jeito que já
 * estava). O padrão pros mapas novos também é aplicado em
 * `MapaController::syncCompleto` e em `MapaStore` (estado inicial), esta
 * migration só garante que um INSERT direto no banco siga a mesma regra.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->boolean('lancar_frete_como_item')->default(false)->change();
            $table->boolean('lancar_imposto_desconto_como_item')->default(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->boolean('lancar_frete_como_item')->default(true)->change();
            $table->boolean('lancar_imposto_desconto_como_item')->default(true)->change();
        });
    }
};
