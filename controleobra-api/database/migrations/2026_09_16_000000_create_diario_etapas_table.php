<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Diário de Obra — checklist de etapas por registro (16/09/2026, pedido
 * do Lucas via Onilia: item 6/16 dos pedidos de ajuste). Etapa aqui NÃO
 * vem de um enum fixo nem do cronograma da obra — é seleção manual, com
 * o front-end pré-preenchendo a partir das etapas ainda não concluídas
 * do lançamento anterior da mesma obra (`DiarioObraController::
 * ultimasEtapas`), e o usuário pode editar livremente (renomear, marcar
 * concluída, adicionar novas, remover). Mesmo padrão de
 * `diario_pendencias`/`diario_ocorrencias`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('diario_etapas', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('registro_id', 36);
            $table->string('nome', 150);
            $table->boolean('concluida')->default(false);
            $table->timestamps();

            $table->foreign('registro_id')->references('id')->on('diario_registros')->cascadeOnDelete();
            $table->index('registro_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('diario_etapas');
    }
};
