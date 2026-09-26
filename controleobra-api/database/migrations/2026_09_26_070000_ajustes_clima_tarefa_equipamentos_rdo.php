<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 26/09/2026 — segundo lote de ajustes do RDO pedido pelo Lucas, no mesmo
 * dia do lote anterior: (1) "Impraticável" deixa de ser uma condição
 * climática e vira uma condição de trabalho À PARTE, por turno
 * (`condicao_manha/tarde/noite`, praticável/impraticável) — `clima_*`
 * continua só com claro/nublado/chuva/temporal. (2) Cada tarefa ganha um
 * campo de observações próprio. (3) Equipamentos alugados: `presente`
 * marca se o equipamento está na obra hoje; `fornecedor` sai da tabela —
 * o "Contrato" (referência em texto) já basta pra identificar, fornecedor
 * fica só no próprio contrato (aba Contratos de equipamentos).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rdo_registros', function (Blueprint $table) {
            $table->string('condicao_manha', 20)->default('praticavel')->after('clima_manha');
            $table->string('condicao_tarde', 20)->default('praticavel')->after('clima_tarde');
            $table->string('condicao_noite', 20)->default('praticavel')->after('clima_noite');
        });

        Schema::table('rdo_tarefas', function (Blueprint $table) {
            $table->text('observacoes')->nullable()->after('descricao');
        });

        Schema::table('rdo_equipamentos', function (Blueprint $table) {
            $table->boolean('presente')->default(true)->after('contrato_referencia');
            $table->dropColumn('fornecedor');
        });
    }

    public function down(): void
    {
        Schema::table('rdo_registros', function (Blueprint $table) {
            $table->dropColumn(['condicao_manha', 'condicao_tarde', 'condicao_noite']);
        });

        Schema::table('rdo_tarefas', function (Blueprint $table) {
            $table->dropColumn('observacoes');
        });

        Schema::table('rdo_equipamentos', function (Blueprint $table) {
            $table->dropColumn('presente');
            $table->string('fornecedor', 150)->nullable()->after('contrato_equipamento_item_id');
        });
    }
};
