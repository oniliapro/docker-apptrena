<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Modelos de contrato (28/09/2026, itens 8/9 do lote de melhorias) —
 * cadastro reaproveitável (Configurações, mesmo espírito de
 * Materiais/Profissionais/Modelos de FVS): texto com variáveis
 * `{{chave}}` (ver `ContratoModeloController::VARIAVEIS`), que o usuário
 * escolhe entre vários ao gerar o contrato de uma empreita ou de uma obra
 * específica — decidido com o Lucas: múltiplos modelos cadastráveis (não
 * um só fixo), cada um editável, preenchimento automático das variáveis,
 * saída em PDF.
 *
 * `tipo` separa os dois contextos porque as variáveis disponíveis são
 * diferentes (empreita tem profissional/valor do contrato; obra tem
 * cliente/responsável) — um modelo de um tipo não aparece pra gerar o do
 * outro.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contrato_modelos', function (Blueprint $table) {
            $table->string('id', 36)->primary();
            $table->string('empresa_id', 36);
            $table->enum('tipo', ['empreita', 'obra']);
            $table->string('nome', 150);
            $table->longText('conteudo');
            $table->boolean('ativo')->default(true);

            // Layout de página por modelo (29/09/2026, pedido do Lucas depois
            // de ver o editor rico pronto: "mexer nas margens, tamanho da
            // folha, cabeçalho da folha, rodapé da folha"). Margens em mm,
            // mesmo default que já estava fixo no ContratoPdfController.
            $table->unsignedSmallInteger('margem_superior_mm')->default(15);
            $table->unsignedSmallInteger('margem_direita_mm')->default(15);
            $table->unsignedSmallInteger('margem_inferior_mm')->default(18);
            $table->unsignedSmallInteger('margem_esquerda_mm')->default(15);
            $table->enum('tamanho_papel', ['a4', 'carta', 'oficio'])->default('a4');
            $table->enum('orientacao', ['retrato', 'paisagem'])->default('retrato');
            // HTML do cabeçalho/rodapé repetido em toda página do PDF (via
            // Browsershot ->headerHtml()/->footerHtml() — mecanismo separado
            // do conteúdo principal, ver ContratoPdfController::gerar()).
            $table->longText('cabecalho_html')->nullable();
            $table->longText('rodape_html')->nullable();
            // Distância da borda da folha até o texto do cabeçalho/rodapé
            // (30/09/2026, pedido do Lucas: "margens tanto do cabeçalho
            // quanto do rodapé") — igual ao "Do topo"/"Do rodapé" do Word;
            // fica DENTRO da margem superior/inferior da página (não pode
            // ser maior que ela, senão o cabeçalho invade o corpo do texto).
            $table->unsignedSmallInteger('margem_cabecalho_mm')->default(8);
            $table->unsignedSmallInteger('margem_rodape_mm')->default(8);

            // Papel timbrado (30/09/2026, pedido do Lucas: "a imagem pode
            // pegar a folha toda se eu quiser, dimensionada de acordo com
            // minha preferência") — a IMAGEM em si (`Empresa::
            // papel_timbrado_path`) continua única por empresa; só o MODO
            // de aplicação é por modelo. 'topo' é o comportamento de
            // sempre (faixa no alto da 1ª página, via `CabecalhoImpressao`);
            // 'fundo' estica a imagem por trás do conteúdo em TODA página.
            $table->enum('timbrado_modo', ['topo', 'fundo'])->default('topo');
            $table->enum('timbrado_ajuste', ['cobrir', 'conter', 'esticar'])->default('cobrir');

            $table->timestamps();

            $table->foreign('empresa_id')->references('id')->on('empresas')->cascadeOnDelete();
            $table->index(['empresa_id', 'tipo']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contrato_modelos');
    }
};
