<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 03/09/2026, pedido do Lucas: separa "confirmar a empreita" (trava
 * cabeçalho/serviços/contrato/quantidade — `is_confirmed`) de "liberar a
 * tela de Medição/Pagamento" (agora um passo à parte, disparado pelo
 * botão "Realizar pagamento" dentro de "Pagamentos registrados"). Antes
 * as duas coisas aconteciam juntas ao confirmar.
 *
 * Reabrir a empreita (`is_confirmed` volta a false) também reseta este
 * campo pra false — decisão confirmada com o Lucas: a tela volta ao
 * estado inicial completo (Quantidades, sem Medição/Pagamento) até
 * confirmar e clicar "Realizar pagamento" de novo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->boolean('pagamento_iniciado')->default(false)->after('confirmed_at');
            $table->timestamp('pagamento_iniciado_at')->nullable()->after('pagamento_iniciado');
        });
    }

    public function down(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->dropColumn(['pagamento_iniciado', 'pagamento_iniciado_at']);
        });
    }
};
