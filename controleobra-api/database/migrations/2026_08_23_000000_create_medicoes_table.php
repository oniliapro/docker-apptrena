<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Medição física da obra (23/08/2026, pedido do Lucas) — histórico de
 * medições, cada uma cobrindo todos os itens da EAP, por categoria de
 * custo. `sequencia` é a ordem estrita da fila (1, 2, 3…): só a medição
 * de maior `sequencia` de uma obra pode ser excluída (força excluir de
 * trás pra frente), e só pode existir uma medição em `status = 'rascunho'`
 * por vez (ver `MedicaoController`) — a próxima só nasce depois que essa
 * for aprovada ou excluída.
 *
 * `status` é string livre documentada, mesmo padrão de `obras.status`
 * (`Obra::STATUS_OPCOES`): 'rascunho' | 'aprovada'. Aprovar é o que faz
 * os valores dessa medição virarem o "acumulado anterior" pra próxima —
 * uma medição em rascunho nunca serve de base pra outra.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('medicoes', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('obra_id', 36);
            $table->unsignedInteger('sequencia');
            $table->date('data_medicao')->nullable();
            $table->string('status', 20)->default('rascunho'); // rascunho | aprovada
            $table->timestamp('aprovado_em')->nullable();
            $table->timestamps();

            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->unique(['obra_id', 'sequencia']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('medicoes');
    }
};
