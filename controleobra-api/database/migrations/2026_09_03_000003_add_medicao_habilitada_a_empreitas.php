<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Persiste qual dos dois botões — "Realizar medição"/"Realizar
 * pagamento" — está habilitado agora (03/09/2026, pedido do Lucas: "pode
 * fazer persistir", depois de eu ter deixado esse estado só na tela, que
 * se perdia ao recarregar a página). Separado de `pagamento_iniciado`
 * (que controla pra sempre se a tabela mostra Quantidades ou Medição/Já
 * pago/Pagamento/Saldo — não muda com este campo): este aqui só alterna
 * de valor a cada clique num dos dois botões, começando `true`
 * ("Realizar medição" habilitado).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->boolean('medicao_habilitada')->default(true)->after('pagamento_iniciado_at');
        });
    }

    public function down(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->dropColumn('medicao_habilitada');
        });
    }
};
