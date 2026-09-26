<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Agenda (26/09/2026, pedido do Lucas) — compromissos com data e horário,
 * parecidos com o Google Agenda. Todos os usuários da empresa enxergam os
 * compromissos (a Agenda geral junta os de todas as obras); um compromisso
 * pode ser de uma obra (`obra_id`) ou geral (sem obra), e pode marcar outros
 * usuários da empresa como participantes.
 *
 * `inicio`/`fim` são horário de parede (o que está no relógio de quem marca),
 * sem fuso — por isso DATETIME comum, sem conversão de UTC como nos
 * pagamentos: "14:00" é 14:00 para todo mundo da empresa.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agenda_eventos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('obra_id', 36)->nullable();
            $table->foreignId('criado_por_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('titulo', 200);
            $table->text('descricao')->nullable();
            $table->string('local', 200)->nullable();
            $table->boolean('dia_inteiro')->default(false);
            $table->dateTime('inicio');
            $table->dateTime('fim');
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->index(['empresa_id', 'inicio']);
            $table->index('obra_id');
        });

        Schema::create('agenda_evento_participantes', function (Blueprint $table) {
            $table->id();
            $table->string('agenda_evento_id', 36);
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            $table->foreign('agenda_evento_id')->references('id')->on('agenda_eventos')->cascadeOnDelete();
            $table->unique(['agenda_evento_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agenda_evento_participantes');
        Schema::dropIfExists('agenda_eventos');
    }
};
