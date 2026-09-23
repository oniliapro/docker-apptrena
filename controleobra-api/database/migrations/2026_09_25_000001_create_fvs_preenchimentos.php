<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * F10 (25/09/2026) — a ficha PREENCHIDA de fato, pendurada num RDO. Ver
 * `2026_09_25_000000_create_fvs_modelos_e_vinculos` (o cadastro/vínculo) e
 * `docs/CONTEXTO.md`.
 *
 * Numeração `FVS-0001-REV000` por OBRA (`numero`+`revisao`, únicos por
 * obra) — igual ao `numero` do RDO. `modelo_nome_snapshot` congela o nome
 * do modelo na hora (não muda se o cadastro for editado/apagado depois).
 *
 * `origem_preenchimento_id` aponta pra ficha REPROVADA que gerou esta cópia
 * em branco (revisão seguinte) — só preenchido nas cópias, nunca na
 * original. `pendencia_id` aponta pra pendência do RDO criada quando ESTA
 * ficha reprovou — evita gerar a pendência duas vezes se a ficha for salva
 * de novo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fvs_preenchimentos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('obra_id', 36);
            $table->string('eap_item_id', 36)->nullable();
            $table->string('fvs_modelo_id', 36)->nullable();
            $table->string('modelo_nome_snapshot', 150);
            $table->string('rdo_id', 36);
            $table->unsignedInteger('numero');
            $table->unsignedInteger('revisao')->default(0);
            $table->string('status', 15)->default('pendente'); // pendente | aprovada | reprovada
            $table->text('observacao_geral')->nullable();
            $table->string('origem_preenchimento_id', 36)->nullable();
            $table->string('pendencia_id', 36)->nullable();
            $table->timestamp('preenchido_em')->nullable();
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->nullOnDelete();
            $table->foreign('fvs_modelo_id')->references('id')->on('fvs_modelos')->nullOnDelete();
            $table->foreign('rdo_id')->references('id')->on('rdo_registros')->cascadeOnDelete();
            $table->foreign('origem_preenchimento_id')->references('id')->on('fvs_preenchimentos')->nullOnDelete();
            $table->foreign('pendencia_id')->references('id')->on('rdo_pendencias')->nullOnDelete();
            $table->unique(['obra_id', 'numero', 'revisao']);
            $table->index('rdo_id');
        });

        Schema::create('fvs_preenchimento_itens', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('fvs_preenchimento_id', 36);
            $table->unsignedInteger('ordem')->default(0);
            $table->string('descricao', 255);
            $table->string('resultado', 15)->nullable(); // conforme | nao_conforme | nao_se_aplica
            $table->text('observacao')->nullable();
            $table->timestamps();

            $table->foreign('fvs_preenchimento_id')->references('id')->on('fvs_preenchimentos')->cascadeOnDelete();
        });

        Schema::create('fvs_fotos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('fvs_preenchimento_item_id', 36);
            $table->string('caminho', 255);
            $table->unsignedInteger('ordem')->default(0);
            $table->timestamps();

            $table->foreign('fvs_preenchimento_item_id', 'fvs_fotos_item_fk')
                ->references('id')->on('fvs_preenchimento_itens')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fvs_fotos');
        Schema::dropIfExists('fvs_preenchimento_itens');
        Schema::dropIfExists('fvs_preenchimentos');
    }
};
