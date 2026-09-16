<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Diário de Obra — troca do canal de aviso ao contratante da obra
 * (cliente final) de WhatsApp para e-mail (16/09/2026, item 12 dos
 * pedidos de ajuste: decisão já tomada com a Onilia, "sem WhatsApp, usar
 * e-mail"). `telefone_whatsapp` permanece na tabela (não usado por
 * nenhum notificador a partir de agora, mas sem motivo pra apagar dado
 * já cadastrado) — só o e-mail passa a ser exigido pra notificação.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('obra_contratante_links', function (Blueprint $table) {
            $table->string('email', 190)->nullable()->after('telefone_whatsapp');
        });
    }

    public function down(): void
    {
        Schema::table('obra_contratante_links', function (Blueprint $table) {
            $table->dropColumn('email');
        });
    }
};
