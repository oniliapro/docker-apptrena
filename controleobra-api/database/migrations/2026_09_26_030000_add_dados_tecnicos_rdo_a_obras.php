<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 26/09/2026 — pedido do Lucas: o cabeçalho técnico do RDO (contrato,
 * responsável técnico, CREA, ART) deixa de ser preenchido à mão dentro do
 * RDO (tabela `rdo_obra_dados`, que fica sem uso a partir de agora — não
 * apagada, só parada) e passa a vir do cadastro da própria obra. Início,
 * prazo e contratante já existiam em `obras` (`data_base`, `periodo`,
 * `cliente`) — só faltavam estes quatro.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('obras', function (Blueprint $table) {
            $table->string('numero_contrato', 80)->nullable()->after('cliente');
            $table->string('responsavel_tecnico', 150)->nullable()->after('responsavel');
            $table->string('crea', 60)->nullable()->after('responsavel_tecnico');
            $table->string('art', 60)->nullable()->after('crea');
        });
    }

    public function down(): void
    {
        Schema::table('obras', function (Blueprint $table) {
            $table->dropColumn(['numero_contrato', 'responsavel_tecnico', 'crea', 'art']);
        });
    }
};
