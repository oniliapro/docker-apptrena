<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 01/10/2026, pedido do Lucas — o painel "Rateio por etapa da obra" tinha um
 * liga/desliga só na tela interativa (`mostrarRateio`, signal local do
 * componente, nunca persistido); o PDF (`mapa-imprimir.ts`, tela separada
 * que o Browsershot carrega) sempre mostrava o painel, sem noção nenhuma do
 * que foi marcado/desmarcado. Persistir como campo do próprio Mapa resolve:
 * as duas telas passam a ler o mesmo valor. Default `true` mantém o
 * comportamento de sempre pros mapas já existentes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->boolean('mostrar_rateio_etapa')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->dropColumn('mostrar_rateio_etapa');
        });
    }
};
