<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * F9 (24/09/2026) — mão de obra do RDO passa a poder referenciar um
 * profissional de verdade do cadastro (ver `Empreiteiro`/"Profissionais",
 * F6), em vez de só função + quantidade digitadas soltas. `profissional_id`
 * fica nullable de propósito: continua dando pra lançar uma linha "manual"
 * (ex.: "Ajudante avulso x3") pra quem não tem cadastro — só as linhas COM
 * profissional vinculado geram diária automática ao finalizar (ver
 * `RdoController::gerarDiariasAutomaticas`).
 *
 * De passagem, o critério de coluna muda de indireta/direta (tipo de
 * trabalho) pra interno/externo (vínculo com a empresa) — decisão do Lucas,
 * 23/09/2026. Os dados já lançados são migrados (indireta→interno,
 * direta→externo): não é uma correspondência perfeita, mas evita RDO
 * antigo com coluna vazia ou rótulo desconhecido se for reimpresso.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rdo_mao_de_obra', function (Blueprint $table) {
            $table->string('profissional_id', 36)->nullable()->after('rdo_id');
            $table->string('profissional_nome', 150)->nullable()->after('profissional_id');
        });

        DB::table('rdo_mao_de_obra')->where('categoria', 'indireta')->update(['categoria' => 'interno']);
        DB::table('rdo_mao_de_obra')->where('categoria', 'direta')->update(['categoria' => 'externo']);
    }

    public function down(): void
    {
        DB::table('rdo_mao_de_obra')->where('categoria', 'interno')->update(['categoria' => 'indireta']);
        DB::table('rdo_mao_de_obra')->where('categoria', 'externo')->update(['categoria' => 'direta']);

        Schema::table('rdo_mao_de_obra', function (Blueprint $table) {
            $table->dropColumn(['profissional_id', 'profissional_nome']);
        });
    }
};
