<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fórmulas das células da EAP (21/09/2026, pedido dos usuários): quantidade,
 * custo unitário por categoria e BDI do item podem ter uma fórmula em vez de
 * um número. Coluna JSON no item: `{"qtde": "=...", "unit.material": "=...",
 * "bdi": "=..."}`, com as referências a outros itens guardadas pelo id do item
 * (assim a fórmula acompanha o item quando a numeração muda). O VALOR
 * calculado continua nas colunas de sempre (quantidade, valor_unitario,
 * bdi_*) — relatórios e PDFs leem esses números; a fórmula é só a origem.
 * Nula = todas as células do item são números comuns.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('eap_itens', function (Blueprint $table) {
            $table->json('formulas')->nullable()->after('bdi_value');
        });
    }

    public function down(): void
    {
        Schema::table('eap_itens', function (Blueprint $table) {
            $table->dropColumn('formulas');
        });
    }
};
