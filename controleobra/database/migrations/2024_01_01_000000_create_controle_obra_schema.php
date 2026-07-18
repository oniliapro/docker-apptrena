<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Schema completo do Controle de Obra (App do Lucas), traduzido de
 * banco-de-dados/01-criar-tabelas.sql para migrations Laravel.
 *
 * IDs continuam VARCHAR(36) (não uuid nativo do banco) de propósito:
 * o frontend já gera UUIDs em JS (crypto.randomUUID()) e grava esse valor
 * como string.
 *
 * Adaptado para MySQL 5.7 (ambiente docker-crtlobras): MySQL 5.7 NÃO
 * suporta CHECK constraint no banco (só a partir do 8.0.16), então as
 * validações de "enum" (bdi_scope, bdi_mode, modo_etapa, origem_tipo,
 * modo_valor, etc.) ficam só na camada de validação do Laravel — ver
 * app/Http/Controllers/Api/*.php, que já valida esses campos com regras
 * tipo 'in:global,category,item' antes de gravar.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tipos_custo', function (Blueprint $table) {
            $table->smallInteger('id')->primary();
            $table->string('chave', 40)->unique();
            $table->string('rotulo', 80);
            $table->smallInteger('ordem')->unique();
        });

        Schema::create('obras', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('map_number', 50)->unique()->nullable();
            $table->string('obra_nome', 180)->default('');
            $table->string('cliente', 120)->default('');
            $table->date('data_base')->nullable();
            $table->string('responsavel', 120)->default('');
            $table->string('local_obra', 180)->default('');
            $table->string('periodo', 80)->default('');
            $table->text('obs')->nullable();
            $table->string('bdi_scope', 20)->default('global'); // global | category | item
            $table->string('bdi_mode', 20)->default('pct'); // pct | value
            $table->decimal('bdi_percent', 9, 4)->default(0);
            $table->decimal('bdi_value', 14, 2)->default(0);
            $table->boolean('is_confirmed')->default(false);
            $table->date('confirmed_at')->nullable();
            $table->timestamps();

            $table->index(['is_confirmed']);
        });

        Schema::create('obra_bdi_tipo', function (Blueprint $table) {
            $table->string('obra_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->string('bdi_mode', 20)->default('pct');
            $table->decimal('bdi_percent', 9, 4)->default(0);
            $table->decimal('bdi_value', 14, 2)->default(0);

            $table->primary(['obra_id', 'tipo_custo_id']);
            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });

        Schema::create('obra_ui_config', function (Blueprint $table) {
            $table->string('obra_id', 36)->primary();
            $table->boolean('show_unit')->default(true);
            $table->boolean('show_total')->default(true);
            $table->boolean('show_bdi')->default(true);
            $table->boolean('show_types')->default(true);
            $table->string('orc_real_mode', 20)->default('value'); // value | pct

            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
        });

        Schema::create('obra_ui_tipo_visivel', function (Blueprint $table) {
            $table->string('obra_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->boolean('visivel')->default(true);

            $table->primary(['obra_id', 'tipo_custo_id']);
            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });

        Schema::create('eap_itens', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('obra_id', 36);
            $table->integer('ordem')->default(0);
            $table->boolean('is_group')->default(false);
            $table->string('codigo_eap', 40)->default('');
            $table->text('descricao')->nullable();
            $table->decimal('quantidade', 14, 4)->default(0);
            $table->string('unidade', 30)->default('');
            $table->string('bdi_mode', 20)->default('pct');
            $table->decimal('bdi_percent', 9, 4)->default(0);
            $table->decimal('bdi_value', 14, 2)->default(0);
            $table->timestamps();

            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->index(['obra_id', 'ordem']);
        });

        Schema::create('eap_item_custos', function (Blueprint $table) {
            $table->string('eap_item_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->decimal('valor_unitario', 14, 2)->default(0);

            $table->primary(['eap_item_id', 'tipo_custo_id']);
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });

        Schema::create('mapas', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('obra_id', 36)->nullable();
            $table->string('numero_mapa', 50)->default('');
            $table->text('descricao')->nullable();
            $table->string('cliente', 120)->default('');
            $table->string('responsavel_mapa', 120)->default('');
            $table->string('responsavel_obra', 120)->default('');
            $table->date('data_finalizacao')->nullable();
            $table->date('data_necessidade')->nullable();
            $table->decimal('frete_particular', 14, 2)->default(0);
            $table->boolean('modo_manual')->default(false);
            $table->decimal('total_mapa', 14, 2)->default(0);
            $table->timestamps();

            $table->foreign('obra_id')->references('id')->on('obras')->nullOnDelete();
            $table->index(['obra_id']);
        });

        Schema::create('mapa_fornecedores', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('mapa_id', 36);
            $table->integer('ordem')->default(0);
            $table->string('fornecedor', 120)->default('');
            $table->string('contato', 120)->default('');
            $table->decimal('imposto_percent', 9, 4)->default(0);
            $table->decimal('frete', 14, 2)->default(0);
            $table->decimal('desconto', 14, 2)->default(0);
            $table->decimal('desconto_parcial', 14, 2)->default(0);
            $table->boolean('ativo')->default(true);

            $table->foreign('mapa_id')->references('id')->on('mapas')->cascadeOnDelete();
            $table->index(['mapa_id', 'ordem']);
        });

        Schema::create('mapa_itens', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('mapa_id', 36);
            $table->integer('ordem')->default(0);
            $table->text('descricao')->nullable();
            $table->smallInteger('tipo_custo_id')->nullable();
            $table->decimal('quantidade', 14, 4)->default(0);
            $table->string('unidade', 30)->default('');
            $table->string('eap_item_id', 36)->nullable();
            $table->string('modo_etapa', 20)->default('percentual'); // percentual | quantidade
            $table->string('escolha_fornecedor_id', 36)->nullable();

            $table->foreign('mapa_id')->references('id')->on('mapas')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo')->nullOnDelete();
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->nullOnDelete();
            $table->index(['mapa_id', 'ordem']);
        });
        // FK de escolha_fornecedor_id criada depois pois referencia mapa_fornecedores (mesma ordem do SQL original)
        Schema::table('mapa_itens', function (Blueprint $table) {
            $table->foreign('escolha_fornecedor_id')->references('id')->on('mapa_fornecedores')->nullOnDelete();
        });

        Schema::create('mapa_item_precos', function (Blueprint $table) {
            $table->string('mapa_item_id', 36);
            $table->string('fornecedor_id', 36);
            $table->decimal('valor_unitario', 14, 2)->default(0);
            $table->boolean('comprar')->default(false);

            $table->primary(['mapa_item_id', 'fornecedor_id']);
            $table->foreign('mapa_item_id')->references('id')->on('mapa_itens')->cascadeOnDelete();
            $table->foreign('fornecedor_id')->references('id')->on('mapa_fornecedores')->cascadeOnDelete();
        });

        Schema::create('mapa_item_etapas', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('mapa_item_id', 36);
            $table->integer('ordem')->default(0);
            $table->string('eap_item_id', 36)->nullable();
            $table->decimal('valor', 14, 4)->default(0);

            $table->foreign('mapa_item_id')->references('id')->on('mapa_itens')->cascadeOnDelete();
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->nullOnDelete();
            $table->index(['mapa_item_id']);
        });

        Schema::create('empreitas', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('obra_id', 36)->nullable();
            $table->string('obra_number', 50)->default('');
            $table->string('numero_empreita', 50)->default('');
            $table->text('descricao_empreita')->nullable();
            $table->date('medicao_date')->nullable();
            $table->string('competencia', 30)->default('');
            $table->text('obs')->nullable();
            $table->decimal('total_empreita', 14, 2)->default(0);
            $table->decimal('total_pago', 14, 2)->default(0);
            $table->timestamp('atualizado_em')->nullable();
            $table->timestamps();

            $table->foreign('obra_id')->references('id')->on('obras')->nullOnDelete();
            $table->index(['obra_id']);
        });

        Schema::create('empreita_tipos_incluidos', function (Blueprint $table) {
            $table->string('empreita_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->boolean('ativo')->default(true);

            $table->primary(['empreita_id', 'tipo_custo_id']);
            $table->foreign('empreita_id')->references('id')->on('empreitas')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });

        Schema::create('empreita_itens', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empreita_id', 36);
            $table->integer('ordem')->default(0);
            $table->string('eap_item_id', 36)->nullable();
            $table->text('descricao')->nullable();
            $table->decimal('valor_emp', 14, 2)->default(0);
            $table->decimal('valor_reserva', 14, 2)->default(0);
            $table->decimal('medicao_acum_legacy', 9, 4)->default(0);
            $table->decimal('medicao_atual_legacy', 9, 4)->nullable();

            $table->foreign('empreita_id')->references('id')->on('empreitas')->cascadeOnDelete();
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->nullOnDelete();
            $table->index(['empreita_id', 'ordem']);
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

        Schema::create('empreita_registros', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empreita_id', 36);
            $table->date('data_medicao')->nullable();
            $table->string('competencia', 30)->default('');
            $table->text('obs')->nullable();
            $table->decimal('total_pagar_emp', 14, 2)->default(0);
            $table->decimal('total_reservar_pgto', 14, 2)->default(0);
            $table->decimal('total_periodo', 14, 2)->default(0);
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('empreita_id')->references('id')->on('empreitas')->cascadeOnDelete();
            $table->index(['empreita_id', 'data_medicao']);
        });

        Schema::create('empreita_registro_linhas', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empreita_registro_id', 36);
            $table->integer('ordem')->default(0);
            $table->string('empreita_item_id', 36)->nullable();
            $table->string('eap_item_id', 36)->nullable();
            $table->text('descricao')->nullable();
            $table->decimal('total_pagar_emp', 14, 2)->default(0);
            $table->decimal('total_reservar_pgto', 14, 2)->default(0);
            $table->decimal('total_periodo', 14, 2)->default(0);

            $table->foreign('empreita_registro_id')->references('id')->on('empreita_registros')->cascadeOnDelete();
            $table->foreign('empreita_item_id')->references('id')->on('empreita_itens')->nullOnDelete();
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->nullOnDelete();
            $table->index(['empreita_registro_id', 'ordem']);
        });

        Schema::create('empreita_registro_linha_tipos', function (Blueprint $table) {
            $table->string('empreita_registro_linha_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->decimal('from_percent', 9, 4)->default(0);
            $table->decimal('to_percent', 9, 4)->default(0);
            $table->decimal('avanco_percent', 9, 4)->default(0);
            $table->decimal('pagar_valor', 14, 2)->default(0);
            $table->decimal('reservar_valor', 14, 2)->default(0);

            $table->primary(['empreita_registro_linha_id', 'tipo_custo_id']);
            $table->foreign('empreita_registro_linha_id', 'fk_erlt_linha')
                ->references('id')->on('empreita_registro_linhas')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });

        Schema::create('pagamentos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('numero_pagamento', 30)->unique();
            $table->string('obra_id', 36)->nullable();
            $table->string('obra_number', 50)->default('');
            $table->date('data_solicitacao')->nullable();
            $table->date('data_pagamento')->nullable();
            $table->string('fornecedor', 120)->default('');
            $table->text('descricao')->nullable();
            $table->decimal('valor_total', 14, 2)->default(0);
            $table->string('origem_tipo', 20)->default('manual'); // mapa | empreita | manual | outro
            $table->string('origem_ref_id', 36)->nullable();
            $table->string('mapa_id', 36)->nullable();
            $table->string('empreita_id', 36)->nullable();
            $table->timestamps();

            $table->foreign('obra_id')->references('id')->on('obras')->nullOnDelete();
            $table->foreign('mapa_id')->references('id')->on('mapas')->nullOnDelete();
            $table->foreign('empreita_id')->references('id')->on('empreitas')->nullOnDelete();
            $table->index(['obra_id', 'data_solicitacao']);
            $table->index(['origem_tipo', 'origem_ref_id']);
        });

        Schema::create('pagamento_itens', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('pagamento_id', 36);
            $table->integer('ordem')->default(0);
            $table->text('descricao')->nullable();
            $table->smallInteger('tipo_custo_id')->nullable();
            $table->string('eap_item_id', 36)->nullable();
            $table->decimal('valor', 14, 2)->default(0);
            $table->string('modo_valor', 20)->default('valor'); // valor | percentual

            $table->foreign('pagamento_id')->references('id')->on('pagamentos')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo')->nullOnDelete();
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->nullOnDelete();
            $table->index(['pagamento_id', 'ordem']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pagamento_itens');
        Schema::dropIfExists('pagamentos');
        Schema::dropIfExists('empreita_registro_linha_tipos');
        Schema::dropIfExists('empreita_registro_linhas');
        Schema::dropIfExists('empreita_registros');
        Schema::dropIfExists('empreita_item_medicoes_tipo');
        Schema::dropIfExists('empreita_itens');
        Schema::dropIfExists('empreita_tipos_incluidos');
        Schema::dropIfExists('empreitas');
        Schema::dropIfExists('mapa_item_etapas');
        Schema::dropIfExists('mapa_item_precos');
        Schema::table('mapa_itens', function (Blueprint $table) {
            $table->dropForeign(['escolha_fornecedor_id']);
        });
        Schema::dropIfExists('mapa_itens');
        Schema::dropIfExists('mapa_fornecedores');
        Schema::dropIfExists('mapas');
        Schema::dropIfExists('eap_item_custos');
        Schema::dropIfExists('eap_itens');
        Schema::dropIfExists('obra_ui_tipo_visivel');
        Schema::dropIfExists('obra_ui_config');
        Schema::dropIfExists('obra_bdi_tipo');
        Schema::dropIfExists('obras');
        Schema::dropIfExists('tipos_custo');
    }
};
