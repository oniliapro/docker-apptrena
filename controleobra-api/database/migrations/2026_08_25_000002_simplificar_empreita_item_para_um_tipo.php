<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 25/08/2026, pedido do Lucas: "cada item da lista só vai ter um tipo" —
 * até aqui, um serviço de empreita podia ter contrato/medição/pagamento em
 * VÁRIAS categorias de custo ao mesmo tempo (guardado em 3 tabelas com
 * chave composta empreita_item_id+tipo_custo_id). Agora cada linha
 * pertence a UMA categoria só, então essas 3 tabelas viram colunas
 * simples direto em `empreita_itens` — mais simples de ler, escrever e
 * exibir (sem loop por categoria em lugar nenhum do cálculo/tela).
 *
 * Confirmado antes de escrever esta migration (`SELECT COUNT(*) ...` no
 * banco de produção): nenhuma linha tinha valor de contrato/reserva
 * diferente de zero, só 1 linha de medição preenchida (nenhum item com
 * MAIS de uma categoria preenchida) — não existe dado real pra migrar ou
 * perder, então não precisa de nenhuma lógica de "dividir item em vários"
 * pra preservar histórico.
 *
 * `valor_emp`/`valor_reserva`/`medicao_acum_legacy`/`medicao_atual_legacy`
 * já existiam como colunas escalares em `empreita_itens` (mantidas
 * "pra compatibilidade" quando o contrato virou por categoria, tarefa
 * #45, 28/07/2026) — viram as colunas de verdade de novo, só recebendo
 * nomes sem "legacy" (não usa `renameColumn` porque `doctrine/dbal` não
 * está instalado neste projeto — `ALTER TABLE ... CHANGE` faz o mesmo sem
 * a dependência extra).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE empreita_itens CHANGE valor_emp contrato_emp DECIMAL(14,2) NOT NULL DEFAULT 0');
        DB::statement('ALTER TABLE empreita_itens CHANGE valor_reserva contrato_reserva DECIMAL(14,2) NOT NULL DEFAULT 0');
        DB::statement('ALTER TABLE empreita_itens CHANGE medicao_acum_legacy medicao_acum DECIMAL(9,4) NOT NULL DEFAULT 0');
        DB::statement('ALTER TABLE empreita_itens CHANGE medicao_atual_legacy medicao_atual DECIMAL(9,4) NULL');

        Schema::table('empreita_itens', function (Blueprint $table) {
            $table->smallInteger('tipo_custo_id')->nullable()->after('eap_item_id');
            $table->decimal('pagamento_emp', 14, 2)->nullable()->after('medicao_atual');
            $table->decimal('pagamento_reserva', 14, 2)->nullable()->after('pagamento_emp');

            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });

        Schema::dropIfExists('empreita_item_contrato_tipo');
        Schema::dropIfExists('empreita_item_medicoes_tipo');
        Schema::dropIfExists('empreita_item_pagamento_tipo');
        Schema::dropIfExists('empreita_tipos_incluidos');
    }

    public function down(): void
    {
        Schema::create('empreita_tipos_incluidos', function (Blueprint $table) {
            $table->string('empreita_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->boolean('ativo')->default(true);
            $table->primary(['empreita_id', 'tipo_custo_id']);
            $table->foreign('empreita_id')->references('id')->on('empreitas')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });

        Schema::create('empreita_item_contrato_tipo', function (Blueprint $table) {
            $table->string('empreita_item_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->decimal('contrato_emp', 14, 2)->default(0);
            $table->decimal('contrato_reserva', 14, 2)->default(0);
            $table->primary(['empreita_item_id', 'tipo_custo_id']);
            $table->foreign('empreita_item_id')->references('id')->on('empreita_itens')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });

        Schema::create('empreita_item_medicoes_tipo', function (Blueprint $table) {
            $table->string('empreita_item_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->decimal('medicao_acum', 9, 4)->default(0);
            $table->decimal('medicao_atual', 9, 4)->nullable();
            $table->primary(['empreita_item_id', 'tipo_custo_id']);
            $table->foreign('empreita_item_id')->references('id')->on('empreita_itens')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });

        Schema::create('empreita_item_pagamento_tipo', function (Blueprint $table) {
            $table->string('empreita_item_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->decimal('pagamento_emp', 14, 2)->nullable();
            $table->decimal('pagamento_reserva', 14, 2)->nullable();
            $table->primary(['empreita_item_id', 'tipo_custo_id']);
            $table->foreign('empreita_item_id')->references('id')->on('empreita_itens')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });

        Schema::table('empreita_itens', function (Blueprint $table) {
            $table->dropForeign(['tipo_custo_id']);
            $table->dropColumn(['tipo_custo_id', 'pagamento_emp', 'pagamento_reserva']);
        });

        DB::statement('ALTER TABLE empreita_itens CHANGE contrato_emp valor_emp DECIMAL(14,2) NOT NULL DEFAULT 0');
        DB::statement('ALTER TABLE empreita_itens CHANGE contrato_reserva valor_reserva DECIMAL(14,2) NOT NULL DEFAULT 0');
        DB::statement('ALTER TABLE empreita_itens CHANGE medicao_acum medicao_acum_legacy DECIMAL(9,4) NOT NULL DEFAULT 0');
        DB::statement('ALTER TABLE empreita_itens CHANGE medicao_atual medicao_atual_legacy DECIMAL(9,4) NULL');
    }
};
