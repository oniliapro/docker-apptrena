<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 01/10/2026, bug relatado pelo Lucas (EAP, "Saldo não comprometido" nunca
 * descontava o valor em aberto das empreitas) — a causa raiz nem era de
 * cálculo: `modo_totais` era `VARCHAR(20)` (migration de 26/08/2026, só
 * pensada pra "detalhado"/"saldo"), e o novo valor `'saldo_nao_comprometido'`
 * (23 caracteres) estourava a coluna. O salvamento falhava com 500
 * (`PDOException ... Data too long for column 'modo_totais'`) silenciosamente
 * no front — o modo escolhido nunca persistia de verdade, revertendo pra
 * "detalhado" a cada recarregamento da página (o que também tornava mais
 * fácil cair na janela de corrida corrigida em `eap.ts`/`carregandoSiblings`:
 * sem persistência, o usuário tinha que reescolher o modo toda vez, bem no
 * instante em que a tela acaba de abrir).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('obra_ui_config', function (Blueprint $table) {
            $table->string('modo_totais', 40)->default('detalhado')->change();
        });
    }

    public function down(): void
    {
        Schema::table('obra_ui_config', function (Blueprint $table) {
            $table->string('modo_totais', 20)->default('detalhado')->change();
        });
    }
};
