<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "Modelos de contrato" virou "Modelos de documentos" (14/10/2026, pedido
 * do Lucas): ganhou o tipo `proposta`, gerado a partir da página da EAP.
 *
 * `config_proposta` (JSON) guarda o padrão da tabela da EAP dentro da
 * proposta — quais valores aparecem (unitário/total), até qual nível da
 * EAP, e as cores de fundo/texto. É só o PADRÃO do modelo: na hora de
 * gerar, a tela da EAP deixa ajustar cada um antes de baixar o PDF.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE contrato_modelos MODIFY tipo ENUM('empreita','obra','proposta') NOT NULL");

        Schema::table('contrato_modelos', function (Blueprint $table) {
            $table->json('config_proposta')->nullable()->after('tag_anexo_id');
        });
    }

    public function down(): void
    {
        Schema::table('contrato_modelos', function (Blueprint $table) {
            $table->dropColumn('config_proposta');
        });

        DB::table('contrato_modelos')->where('tipo', 'proposta')->delete();
        DB::statement("ALTER TABLE contrato_modelos MODIFY tipo ENUM('empreita','obra') NOT NULL");
    }
};
