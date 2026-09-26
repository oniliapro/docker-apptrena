<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 26/09/2026 — pedido do Lucas: "uma tarefa pode gerar mais de uma pendência…
 * coloque que a tarefa pode gerar ocorrências também". Até aqui, Pendências
 * (uma por tarefa, por posição) e Ocorrências (lista solta, sem nenhum
 * vínculo) viviam soltas de tarefa de verdade. `tarefa_id` (mesmo padrão de
 * `rdo_fotos.tarefa_id`: nulo = sem tarefa, nullOnDelete) deixa o vínculo
 * exato em vez de reconstruído por posição — usado só para RDOs salvos a
 * partir de agora; os anteriores continuam sendo reconciliados por posição
 * no front (`Rdo.mesclarTarefasComEtapasEPendencias`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rdo_pendencias', function (Blueprint $table) {
            $table->string('tarefa_id', 36)->nullable()->after('rdo_id');
            $table->foreign('tarefa_id')->references('id')->on('rdo_tarefas')->nullOnDelete();
            $table->index('tarefa_id');
        });

        Schema::table('rdo_ocorrencias', function (Blueprint $table) {
            $table->string('tarefa_id', 36)->nullable()->after('rdo_id');
            $table->foreign('tarefa_id')->references('id')->on('rdo_tarefas')->nullOnDelete();
            $table->index('tarefa_id');
        });
    }

    public function down(): void
    {
        Schema::table('rdo_pendencias', function (Blueprint $table) {
            $table->dropForeign(['tarefa_id']);
            $table->dropColumn('tarefa_id');
        });

        Schema::table('rdo_ocorrencias', function (Blueprint $table) {
            $table->dropForeign(['tarefa_id']);
            $table->dropColumn('tarefa_id');
        });
    }
};
