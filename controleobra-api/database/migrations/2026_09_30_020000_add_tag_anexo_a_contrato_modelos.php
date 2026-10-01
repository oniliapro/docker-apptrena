<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tag de anexo automático por modelo de contrato (30/09/2026, pedido do
 * Lucas: "gerar os contratos em massa, selecionando vários e clicando
 * para gerar... eles serão anexados com uma tag predefinida no modelo do
 * contrato"). Preenchida é opcional na hora de editar o modelo, mas
 * obrigatória pra usar a geração em lote a partir da lista de Empreitas
 * (`ContratoPdfController::gerarEAnexarEmLote`) — sem ela não tem como
 * saber em qual pasta/tag encaixar o PDF gerado automaticamente.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contrato_modelos', function (Blueprint $table) {
            $table->string('tag_anexo_id', 36)->nullable()->after('timbrado_ajuste');
            $table->foreign('tag_anexo_id')->references('id')->on('tags')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('contrato_modelos', function (Blueprint $table) {
            $table->dropForeign(['tag_anexo_id']);
            $table->dropColumn('tag_anexo_id');
        });
    }
};
