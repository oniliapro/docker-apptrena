<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nível da EAP escolhido pelo usuário (1 a 4), em vez de inferido só do
 * checkbox "Grupo" + posição na lista — pendência levantada com o Lucas
 * ao comparar com o protótipo `obracontrol.html` (ver frontend/INTEGRACAO.md).
 * `0` significa "ainda não calculado": o frontend infere o nível a partir
 * do comportamento antigo (grupo = nível 1, item dentro de grupo = nível 2)
 * na primeira renumeração e grava o valor daí em diante.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('eap_itens', function (Blueprint $table) {
            $table->unsignedTinyInteger('nivel')->default(0)->after('is_group');
        });
    }

    public function down(): void
    {
        Schema::table('eap_itens', function (Blueprint $table) {
            $table->dropColumn('nivel');
        });
    }
};
