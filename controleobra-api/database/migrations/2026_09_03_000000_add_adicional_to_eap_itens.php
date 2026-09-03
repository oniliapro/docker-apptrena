<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marca um item da EAP como "Adicional" — serviço fora do escopo
 * original (pedido do Lucas, 03/09/2026). Marcar/desmarcar propaga em
 * cascata pra todos os descendentes (frontend, `EapStore::alternarAdicional`,
 * via `ehDescendente`) — este campo só guarda o valor final já calculado,
 * a cascata não vive no banco. Consumido pela mensagem de solicitação de
 * pagamento da Empreita, que separa "Serviços previstos" (false) de
 * "Serviços não previstos" (true) na EAP.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('eap_itens', function (Blueprint $table) {
            $table->boolean('adicional')->default(false)->after('nivel');
        });
    }

    public function down(): void
    {
        Schema::table('eap_itens', function (Blueprint $table) {
            $table->dropColumn('adicional');
        });
    }
};
