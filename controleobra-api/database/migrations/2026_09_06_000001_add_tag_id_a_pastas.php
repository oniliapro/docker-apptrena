<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `pastas.tag_id` (06/09/2026) — identifica a pasta gerada automaticamente
 * pra uma Tag dentro de uma obra (ver `TagController::store`). Localizar
 * por essa FK, em vez de pelo NOME da pasta, é o que garante no máximo 1
 * pasta por tag por obra (unique abaixo) mesmo se o fluxo de criação
 * rodar 2x, e permite renomear a pasta com certeza de qual é (sem
 * depender do nome atual bater com o da tag).
 *
 * `nullOnDelete()`: excluir uma tag NÃO apaga a pasta nem os arquivos
 * dela — decisão do Lucas — só desvincula (`tag_id` volta a `null`, a
 * pasta vira uma pasta comum dali pra frente).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pastas', function (Blueprint $table) {
            $table->string('tag_id', 36)->nullable()->after('tipo_raiz');
            $table->foreign('tag_id')->references('id')->on('tags')->nullOnDelete();
            $table->unique(['obra_id', 'tag_id']);
        });
    }

    public function down(): void
    {
        Schema::table('pastas', function (Blueprint $table) {
            $table->dropUnique(['obra_id', 'tag_id']);
            $table->dropForeign(['tag_id']);
            $table->dropColumn('tag_id');
        });
    }
};
