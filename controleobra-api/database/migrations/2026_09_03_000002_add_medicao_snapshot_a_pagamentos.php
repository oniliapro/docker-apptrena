<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Guardar as medições" (03/09/2026, pedido do Lucas) — um pagamento
 * gerado por "Fechar período" (Empreita) passa a levar um retrato da
 * medição da empreita NO MOMENTO em que foi gerado: `contratoTotalEmpreita`
 * (o contrato pode crescer/diminuir depois) e, por serviço,
 * `medicaoAcum`/`medicaoAtual`/`contratoEmp`/`contratoReserva` daquele
 * instante. Só populado pra pagamentos de origem Empreita — o único
 * consumidor até aqui é a popup de "retrato" e a coluna "Medição %" em
 * `EmpreitaRelatorioPagamentos`. Coluna JSON solta (nullable) em vez de
 * uma tabela própria: é um snapshot IMUTÁVEL lido inteiro de uma vez,
 * nunca consultado campo a campo pelo banco.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pagamentos', function (Blueprint $table) {
            $table->json('medicao_snapshot')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('pagamentos', function (Blueprint $table) {
            $table->dropColumn('medicao_snapshot');
        });
    }
};
