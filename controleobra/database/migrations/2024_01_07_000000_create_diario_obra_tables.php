<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Diário de Obra: registro do dia a dia do canteiro (texto + fotos),
 * inspirado em funcionalidade comum de concorrentes (ex.: "diário de obra"
 * com fotos e ocorrências). Cada registro pertence a uma obra e a uma
 * empresa (isolamento multiempresa via trait PertenceAEmpresa nos models).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('diario_registros', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('empresa_id');
            $table->uuid('obra_id');
            $table->date('data');
            $table->string('titulo', 180)->nullable();
            $table->text('descricao')->nullable();
            $table->string('autor', 120)->nullable();
            $table->string('clima', 40)->nullable();
            $table->timestamps();

            $table->index(['empresa_id', 'obra_id']);
        });

        Schema::create('diario_fotos', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('registro_id');
            $table->string('caminho', 255);
            $table->integer('ordem')->default(0);
            $table->timestamps();

            $table->index('registro_id');
            $table->foreign('registro_id')->references('id')->on('diario_registros')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('diario_fotos');
        Schema::dropIfExists('diario_registros');
    }
};
