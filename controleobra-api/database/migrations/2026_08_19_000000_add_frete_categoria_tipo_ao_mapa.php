<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Categoria de custo (Material, Mão de obra…) da linha de frete no
 * pagamento gerado pelo mapa (19/08/2026, pedido do Lucas) — só se aplica
 * quando `lancar_frete_como_item` está ligado. Guarda a CHAVE da
 * categoria como texto (ex.: "material"), igual `ItemMapa.tipo` no
 * frontend — não o id de `tipos_custo` — pra não precisar de mais um
 * join só pra ler o cabeçalho do mapa. Nulo/vazio = "S/ categoria"
 * (comportamento de sempre: a linha nasce sem tipo definido).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->string('frete_categoria_tipo', 20)->nullable()->after('frete_etapa_id');
        });
    }

    public function down(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->dropColumn('frete_categoria_tipo');
        });
    }
};
