<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 26/09/2026 — complemento da migration anterior (`add_categoria_equipamentos_rdo`):
 * "fornecedor" e "contrato" de um equipamento ALUGADO viram um SNAPSHOT em texto
 * (mesmo padrão de `rdo_mao_de_obra.profissional_nome`), não uma referência viva —
 * preenchido sozinho quando a linha é vinculada a um item de contrato ativo
 * (`contrato_equipamento_item_id`), ou digitado à mão quando não há contrato
 * cadastrado ainda. Assim a tela não depende de carregar a relação toda vez, e o
 * RDO de um mês atrás continua mostrando o fornecedor de então mesmo que o
 * contrato tenha sido renovado com outro fornecedor depois.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rdo_equipamentos', function (Blueprint $table) {
            $table->string('fornecedor', 150)->nullable()->after('contrato_equipamento_item_id');
            $table->string('contrato_referencia', 150)->nullable()->after('fornecedor');
        });
    }

    public function down(): void
    {
        Schema::table('rdo_equipamentos', function (Blueprint $table) {
            $table->dropColumn(['fornecedor', 'contrato_referencia']);
        });
    }
};
