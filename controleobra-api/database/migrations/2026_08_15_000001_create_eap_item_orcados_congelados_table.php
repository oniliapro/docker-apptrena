<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Snapshot do "Orçado" por categoria, gravado no momento em que a EAP é
 * confirmada (pendência levantada com o Lucas ao comparar com o
 * protótipo `obracontrol.html` — antes o Orçado recalculava ao vivo mesmo
 * depois de confirmada, virando um alvo móvel se qtde/custo mudassem
 * depois). Mesma forma de `eap_item_custos`: uma linha por categoria de
 * custo. Uma linha existir aqui significa que aquele item está congelado;
 * ausência de linhas = item nunca confirmado ou reaberto (volta a
 * recalcular ao vivo). Reabrir a EAP (`is_confirmed = false`) apaga todas
 * as linhas de todos os itens da obra — ver `ObraController::syncEap()`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('eap_item_orcados_congelados', function (Blueprint $table) {
            $table->string('eap_item_id', 36);
            $table->smallInteger('tipo_custo_id');
            $table->decimal('valor', 14, 2)->default(0);

            $table->primary(['eap_item_id', 'tipo_custo_id']);
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->cascadeOnDelete();
            $table->foreign('tipo_custo_id')->references('id')->on('tipos_custo');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('eap_item_orcados_congelados');
    }
};
