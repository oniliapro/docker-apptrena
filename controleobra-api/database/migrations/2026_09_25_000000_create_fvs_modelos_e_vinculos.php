<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * F10 (25/09/2026) — Ficha de Verificação de Serviço (FVS). Ver o plano
 * ("D4 Ficha de verificação de serviço") e `docs/CONTEXTO.md`.
 *
 * `fvs_modelos` é o CADASTRO reaproveitável (Configurações, mesmo espírito
 * de Materiais/Profissionais): um modelo tem um nome e uma lista de itens
 * (cada um vira uma linha Conforme/Não conforme/Não se aplica na hora de
 * preencher). Os itens ficam em JSON — são só {descricao}, sem
 * relacionamento próprio, não compensa uma tabela à parte (mesmo raciocínio
 * de `marcas` em `materiais_equipamentos`).
 *
 * `fvs_vinculos` liga um modelo a um item de verdade da EAP de uma obra —
 * "qualquer linha da EAP pode ter uma ou mais fichas" (um item pode ter
 * vários modelos vinculados, e o mesmo modelo pode valer pra vários itens).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fvs_modelos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('nome', 150);
            $table->json('itens');
            $table->boolean('ativo')->default(true);
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->index('empresa_id');
        });

        Schema::create('fvs_vinculos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('eap_item_id', 36);
            $table->string('fvs_modelo_id', 36);
            $table->timestamps();

            $table->foreign('eap_item_id')->references('id')->on('eap_itens')->cascadeOnDelete();
            $table->foreign('fvs_modelo_id')->references('id')->on('fvs_modelos')->cascadeOnDelete();
            $table->unique(['eap_item_id', 'fvs_modelo_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fvs_vinculos');
        Schema::dropIfExists('fvs_modelos');
    }
};
