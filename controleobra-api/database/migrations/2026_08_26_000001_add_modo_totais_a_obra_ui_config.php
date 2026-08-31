<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `EstadoUi.modoTotais` (frontend, `eap.models.ts`) já existia e o botão
 * "Ver Saldo" já escrevia nele e chamava `salvar()`, mas o backend nunca
 * tinha onde guardar esse valor — `ObraController::showEap()` não devolvia
 * `modoTotais`, então ele sempre voltava pro padrão ("detalhado") a cada
 * recarregamento da página. 26/08/2026, achado ao verificar a correção do
 * bug "botão ver saldo não está funcionando" (pedido do Lucas).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('obra_ui_config', function (Blueprint $table) {
            $table->string('modo_totais', 20)->default('detalhado')->after('orc_real_mode');
        });
    }

    public function down(): void
    {
        Schema::table('obra_ui_config', function (Blueprint $table) {
            $table->dropColumn('modo_totais');
        });
    }
};
