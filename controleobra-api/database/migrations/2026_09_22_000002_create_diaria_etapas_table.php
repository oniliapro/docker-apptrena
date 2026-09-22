<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Etapa(s) da EAP de uma diária, com o percentual de divisão (F7,
 * 22/09/2026) — ex.: 60% elétrica / 40% hidráulica. A soma dos percentuais
 * de uma diária tem que fechar em 100 (validado no front e no backend antes
 * de fechar); uma diária em rascunho pode ficar temporariamente fora disso
 * enquanto é editada.
 *
 * `eap_item_id` usa `nullOnDelete` (mesma convenção de `pagamento_itens`):
 * se o item da EAP for excluído, a diária continua existindo — só perde a
 * referência — em vez de apagar o histórico do lançamento.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('diaria_etapas', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('diaria_id', 36);
            $table->string('eap_item_id', 36)->nullable();
            $table->decimal('percentual', 6, 3)->default(0);

            $table->foreign('diaria_id')->references('id')->on('diarias')->cascadeOnDelete();
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->nullOnDelete();
            $table->index('diaria_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('diaria_etapas');
    }
};
