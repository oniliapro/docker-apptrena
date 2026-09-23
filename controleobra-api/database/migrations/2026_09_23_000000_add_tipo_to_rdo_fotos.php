<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Vídeo junto das fotos no RDO (F8, 22/09/2026, "D1" do plano) — em vez de
 * criar uma tabela nova só pra vídeo (duplicaria vínculo com tarefa, legenda,
 * ordem...), `rdo_fotos` ganha `tipo` ('foto' ou 'video') e passa a guardar
 * os dois juntos, na mesma galeria/ordem — é assim que a tela mostra (mp4/
 * mov/webm até 100 MB, cabe no limite do servidor de 110 MB). O croqui
 * (`marcador_*`) é exclusivo de foto; num vídeo esses campos ficam nulos.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rdo_fotos', function (Blueprint $table) {
            $table->string('tipo', 10)->default('foto')->after('tarefa_id');
        });
    }

    public function down(): void
    {
        Schema::table('rdo_fotos', function (Blueprint $table) {
            $table->dropColumn('tipo');
        });
    }
};
