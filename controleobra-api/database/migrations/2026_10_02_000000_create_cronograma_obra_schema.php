<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cronograma de obra (CPM — Critical Path Method), 02/10/2026, pedido do
 * Lucas: tarefas com relações de precedência (TI/II/TT/IT), latência,
 * marcos, cálculo automático de início/fim e caminho crítico. Lista de
 * tarefas PRÓPRIA (não os itens da EAP — a EAP é só orçamento, sem noção de
 * tempo/duração), com vínculo opcional a um item da EAP pra rastreabilidade
 * de custo (mesmo padrão já usado por `cronograma_planejamentos.eap_item_id`
 * e `rdo_etapas.eap_item_id`: FK nullable, nunca obrigatória).
 *
 * Todo o cálculo (datas, folga, caminho crítico) é feito no FRONTEND, a
 * partir destes dados crus — mesma arquitetura de Mapa/EAP/Cronograma de
 * Desembolso (o backend guarda, não calcula). Duração em dias corridos, sem
 * calendário de dias úteis/feriados nesta 1ª versão (simplificação
 * deliberada — ver plano).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cronograma_tarefas', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('obra_id', 36);
            // Vínculo opcional com a EAP — só rastreabilidade de custo, nunca obrigatório.
            $table->string('eap_item_id', 36)->nullable();
            $table->integer('ordem')->default(0);
            $table->string('nome', 200);
            $table->string('tipo', 10)->default('tarefa'); // 'tarefa' | 'marco'
            $table->integer('duracao_dias')->default(1);   // marco sempre 0 (reforçado no Model/Controller)
            // Só usada quando a tarefa NÃO tem nenhuma predecessora — com
            // predecessora, a data é sempre calculada (CPM manda).
            $table->date('data_inicio_manual')->nullable();
            $table->timestamps();

            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->nullOnDelete();
            $table->index(['obra_id', 'ordem']);
        });

        Schema::create('cronograma_dependencias', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('predecessora_id', 36);
            $table->string('sucessora_id', 36);
            $table->string('tipo', 2)->default('TI'); // TI | II | TT | IT
            $table->integer('latencia_dias')->default(0); // pode ser negativa (antecipação)
            $table->timestamps();

            $table->foreign('predecessora_id')->references('id')->on('cronograma_tarefas')->cascadeOnDelete();
            $table->foreign('sucessora_id')->references('id')->on('cronograma_tarefas')->cascadeOnDelete();
            $table->unique(['predecessora_id', 'sucessora_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cronograma_dependencias');
        Schema::dropIfExists('cronograma_tarefas');
    }
};
