<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Estilos de texto nomeados pelo próprio usuário (29/09/2026, editor rico
 * de modelos de contrato — pedido do Lucas: "algo mais parecido com o
 * Word", com estilos que ele cria e nomeia, não um conjunto fixo). Únicos
 * por EMPRESA (não por modelo de contrato) — criados uma vez, reaproveitados
 * em qualquer modelo, igual ao papel timbrado.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contrato_estilos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('nome', 60);
            // Tag semântica aplicada ao bloco (formatBlock no editor) —
            // título/subtítulo pesam na hierarquia do documento mesmo sem
            // a formatação visual do estilo.
            $table->enum('tag_html', ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'])->default('p');
            $table->string('fonte', 60)->nullable();
            $table->unsignedSmallInteger('tamanho_pt')->nullable();
            $table->string('cor', 7)->nullable();
            $table->boolean('negrito')->default(false);
            $table->boolean('italico')->default(false);
            $table->boolean('sublinhado')->default(false);
            $table->enum('alinhamento', ['esquerda', 'centro', 'direita', 'justificado'])->default('esquerda');
            // 30/09/2026, pedido do Lucas ("caixa alta, primeira maiúscula,
            // cada palavra maiúscula, ou livre").
            $table->enum('caixa_texto', ['nenhuma', 'maiuscula', 'primeira_maiuscula', 'cada_palavra'])->default('nenhuma');

            // Numeração automática (30/09/2026) — dois modos, mutuamente
            // exclusivos:
            // 1) LISTA ORDENADA AVULSA (`eh_lista`): numeração própria,
            //    independente de hierarquia de título, no formato
            //    `lista_formato` (número/romano/letra). Botão "Lista
            //    ordenada" na barra cria um bloco com o estilo padrão desse
            //    tipo; qualquer estilo pode virar isso.
            // 2) TÍTULO NUMERADO HIERÁRQUICO (`nivel_titulo`, 1 a 7): entra
            //    na cadeia de contadores CSS aninhados (1, 1.1, 1.1.1…) —
            //    a numeração RECALCULA sozinha ao inserir/excluir/mover
            //    título, porque é 100% contador CSS por ORDEM NO DOCUMENTO,
            //    não texto gravado nem estado guardado em algum lugar.
            // `lista_prefixo`/`lista_sufixo` valem pros dois modos, sempre
            // envolvendo o número (ou a cadeia toda, no caso hierárquico).
            $table->boolean('eh_lista')->default(false);
            $table->enum('lista_formato', ['numero', 'romano_minusculo', 'romano_maiusculo', 'letra_minuscula', 'letra_maiuscula'])->default('numero');
            $table->unsignedTinyInteger('nivel_titulo')->nullable();
            $table->string('lista_prefixo', 40)->nullable();
            $table->string('lista_sufixo', 10)->nullable();
            $table->boolean('padrao')->default(false);
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->index('empresa_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contrato_estilos');
    }
};
