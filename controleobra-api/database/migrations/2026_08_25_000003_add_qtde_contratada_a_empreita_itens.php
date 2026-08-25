<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 25/08/2026, pedido do Lucas: campo novo na Medição de contrato —
 * "Quantidade contratada", a quantidade (na mesma unidade do item da EAP)
 * que ESTE serviço da empreita cobre. Serve de referência pro toggle
 * R$⇄%⇄Qtde (a % passa a ser sobre a quantidade contratada deste serviço,
 * não sobre a quantidade total do item da EAP — mais preciso quando o
 * contrato cobre só uma parte do item).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('empreita_itens', function (Blueprint $table) {
            $table->decimal('qtde_contratada', 14, 4)->nullable()->after('tipo_custo_id');
        });
    }

    public function down(): void
    {
        Schema::table('empreita_itens', function (Blueprint $table) {
            $table->dropColumn('qtde_contratada');
        });
    }
};
