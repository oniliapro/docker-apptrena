<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Duas colunas que faltavam para a tela de mapa/empreita virarem "várias
 * por obra" de verdade (28/07/2026):
 *
 * - empreitas.empreiteiro: o front-end (CabecalhoEmpreita.empreiteiro) já
 *   tinha esse campo, mas o backend nunca chegou a salvar — o formulário
 *   de "Nova empreita" precisa dele.
 * - mapa_itens.etapa: rótulo livre da etapa de obra a que o item se
 *   refere (usado no painel "Rateio por etapa da obra"). É diferente do
 *   rateio relacional em mapa_item_etapas (esse é o valor por etapa da
 *   EAP); aqui é só a tag de texto que o usuário digita na linha.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->string('empreiteiro', 120)->default('')->after('obra_number');
        });

        Schema::table('mapa_itens', function (Blueprint $table) {
            $table->string('etapa', 120)->default('')->after('unidade');
        });
    }

    public function down(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->dropColumn('empreiteiro');
        });

        Schema::table('mapa_itens', function (Blueprint $table) {
            $table->dropColumn('etapa');
        });
    }
};
