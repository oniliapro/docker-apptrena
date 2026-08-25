<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 25/08/2026, pedido do Lucas: empreita passa a ter um estado
 * confirmada/em edição, mesmo padrão já usado na EAP (`obras.is_confirmed`/
 * `confirmed_at`) — enquanto em edição, só o Contrato e a Quantidade
 * contratada podem ser lançados (e serviços podem ser adicionados);
 * confirmando, esses campos travam e a medição/pagamento é liberada.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->boolean('is_confirmed')->default(false)->after('obs');
            $table->timestamp('confirmed_at')->nullable()->after('is_confirmed');
        });
    }

    public function down(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->dropColumn(['is_confirmed', 'confirmed_at']);
        });
    }
};
