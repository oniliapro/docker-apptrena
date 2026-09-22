<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cadastro "Materiais e equipamentos" (22/09/2026, F6) — um cadastro só, com
 * o campo `tipo` separando material de equipamento. Por empresa (multiempresa).
 *
 * Substitui, no que for útil, os catálogos de equipamento do Diário antigo
 * (`equipamentos_catalogo`) e do RDO (`rdo_equipamentos_catalogo`), que só
 * guardavam o nome: os nomes são copiados para cá pelo comando
 * `cadastros:migrar-equipamentos` (as tabelas antigas não são tocadas).
 *
 * `marcas` = lista de marcas em JSON (ex.: ["Tigre", "Amanco"]); `foto_path`
 * fica no disco `public`, como as fotos do RDO.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('materiais_equipamentos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            // material | equipamento
            $table->string('tipo', 20)->default('material');
            $table->string('nome', 150);
            $table->string('unidade', 20)->nullable();
            $table->decimal('valor_unitario', 15, 4)->default(0);
            $table->json('marcas')->nullable();
            $table->string('foto_path', 255)->nullable();
            $table->boolean('ativo')->default(true);
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->index(['empresa_id', 'tipo']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('materiais_equipamentos');
    }
};
