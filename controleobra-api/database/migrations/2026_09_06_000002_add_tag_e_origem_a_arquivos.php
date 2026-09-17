<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `arquivos.tag_id`/`origem_tipo`/`origem_id` (06/09/2026) — suporte a
 * "anexos" de Pagamento/Recebimento (controle de notas fiscais). Um
 * anexo é só um `Arquivo` normal (mesma tabela, mesmo download/preview/
 * exclusão já existentes) com esses 3 campos preenchidos:
 *
 * - `tag_id`: qual Tag foi escolhida ao anexar (`nullOnDelete()` — excluir
 *   a tag não apaga o arquivo, só desvincula, mesma decisão de `pastas`).
 * - `origem_tipo`/`origem_id`: qual Pagamento/Recebimento esse anexo
 *   pertence (`'pagamento'`/`'recebimento'` + o id do registro) — mesmo
 *   espírito do `origem_tipo`/`origem_ref_id` que `Pagamento` já usa pra
 *   apontar pra Mapa/Empreita, só que aqui é o Arquivo apontando pro
 *   lançamento, não o contrário.
 *
 * Um `Arquivo` sem essas 3 colunas preenchidas é um anexo comum da aba
 * Arquivos (like antes desta migration) — nada muda pra ele.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('arquivos', function (Blueprint $table) {
            $table->string('tag_id', 36)->nullable()->after('categoria');
            $table->string('origem_tipo', 20)->nullable()->after('tag_id');
            $table->string('origem_id', 36)->nullable()->after('origem_tipo');

            $table->foreign('tag_id')->references('id')->on('tags')->nullOnDelete();
            $table->index(['origem_tipo', 'origem_id']);
        });
    }

    public function down(): void
    {
        Schema::table('arquivos', function (Blueprint $table) {
            $table->dropIndex(['origem_tipo', 'origem_id']);
            $table->dropForeign(['tag_id']);
            $table->dropColumn(['tag_id', 'origem_tipo', 'origem_id']);
        });
    }
};
