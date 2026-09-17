<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tags (06/09/2026, pedido do Lucas) — controle de notas fiscais por
 * anexo em Pagamentos/Recebimentos. Uma tag é cadastrada em
 * Configurações e, a partir daí, ganha uma pasta correspondente dentro
 * de "Arquivos compartilhados" de CADA obra (ver `TagController::store`)
 * — é lá que os arquivos anexados com essa tag em qualquer Pagamento/
 * Recebimento daquela obra são organizados.
 *
 * `ativo` em vez de exclusão de verdade, mesma convenção de Clientes/
 * Responsáveis/Empreiteiros/`empresa_representantes` — mas aqui excluir
 * de fato TAMBÉM é permitido (decisão do Lucas: excluir uma tag não
 * apaga nada, só desvincula pasta/arquivos já existentes, ver
 * `add_tag_id_a_pastas`/`add_tag_e_origem_a_arquivos`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tags', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('nome', 120);
            $table->boolean('ativo')->default(true);
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->unique(['empresa_id', 'nome']);
            $table->index('empresa_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tags');
    }
};
