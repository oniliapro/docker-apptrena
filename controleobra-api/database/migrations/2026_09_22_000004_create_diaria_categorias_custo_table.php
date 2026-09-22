<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Categorias de custo padrão" das Diárias, por empresa (F7, 22/09/2026,
 * nova aba em Configurações) — em qual categoria de custo (as mesmas 5 da
 * EAP/Pagamento: Material, Mão de obra, Equipamento, Outros, Administração)
 * cada um dos 5 tipos de lançamento da diária (a diária em si, vale
 * transporte, vale alimentação, combustível, valor extra) entra quando vira
 * item de Pagamento no fechamento. Vale pra toda diária da empresa — não é
 * escolhido lançamento a lançamento.
 *
 * Chave composta (empresa_id, campo), mesmo padrão de
 * `empreita_item_pagamento_tipo`/`medicao_item_tipos`. Ausência de linha =
 * usa o padrão de fábrica (`CATEGORIAS_DIARIA_PADRAO` no frontend) — a
 * empresa só ganha linhas aqui quando de fato muda alguma categoria.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('diaria_categorias_custo', function (Blueprint $table) {
            $table->string('empresa_id', 36);
            // diaria | valeTransporte | valeAlimentacao | combustivel | valorExtra
            $table->string('campo', 20);
            $table->smallInteger('tipo_custo_id');

            $table->primary(['empresa_id', 'campo']);
            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('diaria_categorias_custo');
    }
};
