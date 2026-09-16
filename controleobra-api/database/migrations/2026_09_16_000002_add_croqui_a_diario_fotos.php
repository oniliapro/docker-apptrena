<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Diário de Obra — croqui: marcação de local na própria foto (16/09/2026,
 * item 9 dos pedidos de ajuste). `marcador_x`/`marcador_y` são
 * coordenadas RELATIVAS (0 a 1, fração da largura/altura da imagem, não
 * pixels) — assim o marcador continua no lugar certo independente do
 * tamanho em que a foto é exibida (miniatura, popup cheio etc.). Uma
 * foto sem marcador (a maioria) simplesmente não tem esses campos
 * preenchidos — a marcação é opcional, não obrigatória em toda foto.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('diario_fotos', function (Blueprint $table) {
            $table->decimal('marcador_x', 6, 5)->nullable()->after('ordem');
            $table->decimal('marcador_y', 6, 5)->nullable()->after('marcador_x');
            $table->string('marcador_nota', 255)->nullable()->after('marcador_y');
        });
    }

    public function down(): void
    {
        Schema::table('diario_fotos', function (Blueprint $table) {
            $table->dropColumn(['marcador_x', 'marcador_y', 'marcador_nota']);
        });
    }
};
