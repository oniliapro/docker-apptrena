<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Finalizar Mapa" (31/07/2026) — mesmo padrão de `obras.is_confirmed` /
 * `confirmed_at`. Não reaproveita `mapas.data_finalizacao` porque essa
 * coluna já está ocupada: é o campo de texto livre "Data" do cabeçalho do
 * mapa (ver CabecalhoMapa.data em mapa.store.ts), sem relação nenhuma com
 * "o mapa foi fechado". Confirmar o mapa trava a edição e libera os
 * botões de Gerar PDF / Gerar Pagamento.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->boolean('is_confirmed')->default(false)->after('modo_manual');
            $table->date('confirmed_at')->nullable()->after('is_confirmed');
        });
    }

    public function down(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->dropColumn(['is_confirmed', 'confirmed_at']);
        });
    }
};
