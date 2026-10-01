<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Redesenho do papel timbrado no contrato (30/09/2026, pedido do Lucas:
 * "tire a opção de papel timbrado em faixa no topo, coloque a opção de
 * centralizar a imagem na folha e coloque uma opção de aplicar
 * transparência na imagem e também de redimensionar o tamanho da imagem
 * (mantendo ou não a proporção)"). `timbrado_modo`/`timbrado_ajuste`
 * (criados em 29-30/09) ficam na tabela sem uso daqui pra frente — a
 * opção "faixa no topo" some da tela, e o modo "fundo" (cobrindo/
 * centralizado na folha) passa a ser o único, controlado pelos campos
 * novos abaixo em vez do enum de ajuste (cobrir/conter/esticar).
 *
 * `timbrado_largura_pct`: largura da imagem em % da largura da folha.
 * `timbrado_manter_proporcao`: `true` → altura segue a largura mantendo
 * a proporção natural da imagem (`background-size: X% auto`, o próprio
 * CSS calcula); `false` → `timbrado_altura_pct` vale por si (pode
 * esticar/achatar a imagem). Sempre centralizada na folha.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contrato_modelos', function (Blueprint $table) {
            $table->unsignedSmallInteger('timbrado_largura_pct')->default(100)->after('timbrado_ajuste');
            $table->unsignedSmallInteger('timbrado_altura_pct')->nullable()->after('timbrado_largura_pct');
            $table->boolean('timbrado_manter_proporcao')->default(true)->after('timbrado_altura_pct');
            $table->unsignedTinyInteger('timbrado_opacidade')->default(100)->after('timbrado_manter_proporcao');
        });
    }

    public function down(): void
    {
        Schema::table('contrato_modelos', function (Blueprint $table) {
            $table->dropColumn(['timbrado_largura_pct', 'timbrado_altura_pct', 'timbrado_manter_proporcao', 'timbrado_opacidade']);
        });
    }
};
