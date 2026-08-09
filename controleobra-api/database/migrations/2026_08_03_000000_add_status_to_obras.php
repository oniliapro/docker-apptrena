<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Status da obra (03/08/2026) — pedido do Lucas: um campo próprio pro
 * andamento comercial/operacional da obra, separado de `is_confirmed`
 * (que é só sobre o orçamento/EAP estar travado). Antes dessa coluna, o
 * dashboard Principal usava `is_confirmed` como se fosse "obra
 * finalizada", o que é enganoso — uma obra pode ter a EAP confirmada e
 * ainda estar em andamento.
 *
 * Valores aceitos (ver Obra::STATUS_OPCOES): orcamento, proposta_enviada,
 * cancelada, a_iniciar, em_andamento, finalizada.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('obras', function (Blueprint $table) {
            $table->string('status', 30)->default('orcamento')->after('is_confirmed');
        });
    }

    public function down(): void
    {
        Schema::table('obras', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
