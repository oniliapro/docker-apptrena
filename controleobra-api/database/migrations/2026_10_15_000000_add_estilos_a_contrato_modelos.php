<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Estilos de texto PRÓPRIOS de cada modelo de documento (15/10/2026, pedido
 * do Lucas: "editar um estilo edita ele somente no contrato que foi
 * editado"). Até aqui os estilos eram da empresa (`contrato_estilos`) e
 * valiam pra todos os modelos — mudar o "Título 1" num contrato mudava em
 * todos. Agora cada modelo guarda a sua lista (JSON); `null` = modelo antigo
 * que ainda usa os estilos da empresa (a primeira vez que o modelo é salvo
 * no editor, ele passa a ter a cópia dele).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contrato_modelos', function (Blueprint $table) {
            $table->json('estilos')->nullable()->after('config_proposta');
        });
    }

    public function down(): void
    {
        Schema::table('contrato_modelos', function (Blueprint $table) {
            $table->dropColumn('estilos');
        });
    }
};
