<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Diário de Obra (RDO) — módulo reconstruído do zero em 17/09/2026.
 *
 * Substitui funcionalmente o módulo `diario_*` anterior, que não dava conta
 * do Relatório Diário de Obra clássico usado no mercado (planilha-modelo
 * enviada pela Onilia, aba "DIÁRIO"). Os três buracos estruturais do módulo
 * antigo, que não davam para tapar sem refazer a base:
 *
 *  1. "Tarefas realizadas" não existia como entidade — era só um par
 *     titulo/descricao de texto livre para o dia inteiro. Por isso era
 *     impossível ter foto POR TAREFA (pedido de 08/09: miniaturas
 *     circulares com legenda embaixo de cada tarefa), já que `diario_fotos`
 *     amarrava a foto ao registro do dia, não à tarefa.
 *  2. Mão de obra era um único inteiro (`quantidade_operarios`). O RDO
 *     exige função/cargo + quantidade, em duas categorias (indireta e
 *     direta), com várias linhas.
 *  3. Não havia documento: sem numeração sequencial de RDO, sem cabeçalho
 *     técnico (contrato, CREA, ART) e sem bloco de assinaturas.
 *
 * NADA aqui altera tabela de outro módulo. Em especial `obras` NÃO é tocada:
 * os campos de cabeçalho que o RDO precisa e que a obra não tem vivem em
 * `rdo_obra_dados`, uma tabela complementar do próprio módulo (1:1 com obra).
 * As tabelas `diario_*` antigas continuam intactas — nenhum dado é destruído
 * e a volta atrás é possível.
 */
return new class extends Migration
{
    public function up(): void
    {
        /**
         * Cabeçalho técnico do RDO, por obra. Complementa `obras` sem alterá-la:
         * contrato, responsável técnico, CREA e ART são exigências do documento
         * que o cadastro de obra do AppTrena não tem (e que não cabe a este
         * módulo acrescentar lá, para não mexer nos outros módulos).
         */
        Schema::create('rdo_obra_dados', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('obra_id', 36)->unique();
            $table->string('numero_contrato', 80)->nullable();
            $table->string('responsavel_tecnico', 150)->nullable();
            $table->string('crea', 60)->nullable();
            $table->string('art', 60)->nullable();
            $table->date('data_inicio')->nullable();
            $table->string('prazo', 80)->nullable();
            $table->string('contratante_nome', 180)->nullable();
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->index('empresa_id');
        });

        /**
         * O relatório de um dia. `numero` é o "Nº" do RDO impresso: sequencial
         * por obra, atribuído na criação (ver RdoController::proximoNumero).
         * Clima é registrado por turno, como no documento — não é mais uma
         * string única.
         */
        Schema::create('rdo_registros', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('obra_id', 36);
            $table->integer('numero')->nullable();
            $table->date('data');

            // claro | nublado | chuva | temporal | impraticavel
            $table->string('clima_manha', 20)->nullable();
            $table->string('clima_tarde', 20)->nullable();
            $table->string('clima_noite', 20)->nullable();
            $table->text('impacto_cronograma')->nullable();

            $table->text('observacoes')->nullable();

            // rascunho (editável, pendente de assinatura) | finalizado (assinado)
            $table->string('status', 20)->default('rascunho');
            $table->foreignId('autor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('assinado_em')->nullable();
            $table->foreignId('assinado_por_user_id')->nullable()->constrained('users')->nullOnDelete();
            // Congelados no ato da assinatura: o nome/CREA de quem assinou valem
            // para sempre naquele documento, mesmo que o cadastro mude depois.
            $table->string('assinante_nome', 150)->nullable();
            $table->string('assinante_crea', 60)->nullable();

            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->index(['empresa_id', 'obra_id', 'data']);
            $table->unique(['obra_id', 'numero']);
        });

        /**
         * Tarefas realizadas no dia — a lista numerada do RDO. É a entidade
         * que faltava: é dela que as fotos passam a pendurar.
         */
        Schema::create('rdo_tarefas', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('rdo_id', 36);
            $table->integer('ordem')->default(0);
            $table->text('descricao');
            $table->timestamps();

            $table->foreign('rdo_id')->references('id')->on('rdo_registros')->cascadeOnDelete();
            $table->index('rdo_id');
        });

        /**
         * Fotos. `tarefa_id` nulo = foto geral do dia; preenchido = foto
         * daquela tarefa (é o que permite as miniaturas circulares embaixo de
         * cada tarefa, com legenda). `marcador_*` é o croqui: ponto marcado
         * sobre a própria foto, em coordenadas relativas 0–1 para não depender
         * do tamanho de exibição.
         */
        Schema::create('rdo_fotos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('rdo_id', 36);
            $table->string('tarefa_id', 36)->nullable();
            $table->string('caminho', 255);
            $table->string('legenda', 200)->nullable();
            $table->integer('ordem')->default(0);
            $table->decimal('marcador_x', 6, 5)->nullable();
            $table->decimal('marcador_y', 6, 5)->nullable();
            $table->string('marcador_nota', 200)->nullable();
            $table->timestamps();

            $table->foreign('rdo_id')->references('id')->on('rdo_registros')->cascadeOnDelete();
            $table->foreign('tarefa_id')->references('id')->on('rdo_tarefas')->nullOnDelete();
            $table->index('rdo_id');
            $table->index('tarefa_id');
        });

        /**
         * Mão de obra por função e quantidade, separada nas duas colunas do
         * RDO: indireta (gerente de contrato, engenheiro, técnico de segurança,
         * administrativo...) e direta (pedreiro, armador, carpinteiro...).
         */
        Schema::create('rdo_mao_de_obra', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('rdo_id', 36);
            $table->string('categoria', 10); // indireta | direta
            $table->string('funcao', 120);
            $table->integer('quantidade')->default(0);
            $table->integer('ordem')->default(0);
            $table->timestamps();

            $table->foreign('rdo_id')->references('id')->on('rdo_registros')->cascadeOnDelete();
            $table->index(['rdo_id', 'categoria']);
        });

        /** Catálogo de equipamentos por empresa, para não redigitar a cada dia. */
        Schema::create('rdo_equipamentos_catalogo', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('nome', 150);
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->index('empresa_id');
        });

        Schema::create('rdo_equipamentos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('rdo_id', 36);
            $table->string('equipamento_id', 36)->nullable();
            $table->string('descricao', 150);
            $table->integer('quantidade')->default(0);
            $table->integer('ordem')->default(0);
            $table->timestamps();

            $table->foreign('rdo_id')->references('id')->on('rdo_registros')->cascadeOnDelete();
            $table->foreign('equipamento_id')->references('id')->on('rdo_equipamentos_catalogo')->nullOnDelete();
            $table->index('rdo_id');
        });

        Schema::create('rdo_ocorrencias', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('rdo_id', 36);
            $table->integer('ordem')->default(0);
            // nao_conformidade | mudanca_projeto | interferencia | interrupcao | outra
            $table->string('tipo', 40)->default('outra');
            $table->text('descricao');
            $table->string('responsavel', 150)->nullable();
            $table->text('motivo')->nullable();
            $table->text('danos_materiais')->nullable();
            $table->timestamps();

            $table->foreign('rdo_id')->references('id')->on('rdo_registros')->cascadeOnDelete();
            $table->index('rdo_id');
        });

        Schema::create('rdo_pendencias', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('rdo_id', 36);
            $table->text('descricao');
            $table->string('responsavel', 150)->nullable();
            $table->date('prazo')->nullable();
            $table->string('status', 20)->default('aberta'); // aberta | concluida
            $table->integer('ordem')->default(0);
            $table->timestamps();

            $table->foreign('rdo_id')->references('id')->on('rdo_registros')->cascadeOnDelete();
            $table->index('rdo_id');
        });

        /**
         * Etapas/fases da obra, escolhidas manualmente a cada lançamento. O
         * sistema pré-preenche com as etapas NÃO concluídas do RDO anterior
         * da mesma obra; o responsável edita à vontade.
         */
        Schema::create('rdo_etapas', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('rdo_id', 36);
            $table->string('nome', 150);
            $table->boolean('concluida')->default(false);
            $table->integer('ordem')->default(0);
            $table->timestamps();

            $table->foreign('rdo_id')->references('id')->on('rdo_registros')->cascadeOnDelete();
            $table->index('rdo_id');
        });

        Schema::create('rdo_responsaveis_presentes', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('rdo_id', 36);
            $table->string('nome', 150);
            $table->string('empresa', 150)->nullable();
            $table->string('funcao', 120)->nullable();
            $table->string('contrato_referencia', 150)->nullable();
            $table->integer('ordem')->default(0);
            $table->timestamps();

            $table->foreign('rdo_id')->references('id')->on('rdo_registros')->cascadeOnDelete();
            $table->index('rdo_id');
        });

        /** Observação da contratada, com opção de ocultar do contratante. */
        Schema::create('rdo_comentarios_internos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('rdo_id', 36);
            $table->foreignId('autor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('texto');
            $table->boolean('visivel_contratante')->default(false);
            $table->timestamps();

            $table->foreign('rdo_id')->references('id')->on('rdo_registros')->cascadeOnDelete();
            $table->index('rdo_id');
        });

        /**
         * Link de acompanhamento do contratante da obra: sem senha, somente
         * leitura, só enxerga RDO finalizado. O contratante NUNCA assina e
         * nunca escreve (decisão de 08/09/2026, reconfirmada em 17/09/2026).
         */
        Schema::create('rdo_contratante_links', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->string('obra_id', 36);
            $table->string('token', 64)->unique();
            $table->string('email', 180)->nullable();
            $table->timestamp('expira_em')->nullable();
            $table->boolean('ativo')->default(true);
            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->foreign('obra_id')->references('id')->on('obras')->cascadeOnDelete();
            $table->index(['empresa_id', 'obra_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rdo_contratante_links');
        Schema::dropIfExists('rdo_comentarios_internos');
        Schema::dropIfExists('rdo_responsaveis_presentes');
        Schema::dropIfExists('rdo_etapas');
        Schema::dropIfExists('rdo_pendencias');
        Schema::dropIfExists('rdo_ocorrencias');
        Schema::dropIfExists('rdo_equipamentos');
        Schema::dropIfExists('rdo_equipamentos_catalogo');
        Schema::dropIfExists('rdo_mao_de_obra');
        Schema::dropIfExists('rdo_fotos');
        Schema::dropIfExists('rdo_tarefas');
        Schema::dropIfExists('rdo_registros');
        Schema::dropIfExists('rdo_obra_dados');
    }
};
