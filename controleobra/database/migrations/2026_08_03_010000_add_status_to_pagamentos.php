<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migração de Pagamentos pra API relacional (03/08/2026) — a tabela
 * `pagamentos` já existia pronta desde o schema inicial (com origem_tipo/
 * origem_ref_id/mapa_id/empreita_id), mas nunca tinha o campo `status`
 * ('pendente'|'confirmado'). O front sempre leu/gravou isso na ponte
 * chave-valor (`controleObra.pagamentos.v1.obra-{obraId}`) — essa coluna
 * fecha a lacuna que faltava pra desligar essa ponte de vez.
 *
 * `pendente`: gerado automaticamente (hoje só a partir de "Gerar
 * Pagamento" no Mapa) e ainda não conferido — não conta no "Realizado"
 * da EAP. `confirmado`: conferido pelo usuário, ou lançado manualmente
 * (que já nasce confirmado).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pagamentos', function (Blueprint $table) {
            $table->string('status', 20)->default('confirmado')->after('empreita_id');
        });
    }

    public function down(): void
    {
        Schema::table('pagamentos', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
