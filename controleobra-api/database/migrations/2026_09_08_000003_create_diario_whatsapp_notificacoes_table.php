<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Log de auditoria das notificações de WhatsApp disparadas ao finalizar
 * um diário (08/09/2026) — não guarda resposta/confirmação do
 * contratante (a decisão foi que ele só é avisado, não precisa
 * confirmar ciência). Só registra que o aviso foi (tentado) enviado.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('diario_whatsapp_notificacoes', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('registro_id', 36);
            $table->string('obra_contratante_link_id', 36)->nullable();
            $table->string('telefone', 30)->nullable();
            $table->string('status', 20)->default('pendente'); // pendente | enviado | falhou
            $table->text('erro')->nullable();
            $table->timestamps();

            $table->foreign('registro_id')->references('id')->on('diario_registros')->cascadeOnDelete();
            $table->foreign('obra_contratante_link_id')->references('id')->on('obra_contratante_links')->nullOnDelete();
            $table->index('registro_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('diario_whatsapp_notificacoes');
    }
};
