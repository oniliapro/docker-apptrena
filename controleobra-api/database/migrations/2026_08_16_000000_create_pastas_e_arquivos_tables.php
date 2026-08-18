<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Minissistema de arquivos da aba "Arquivos Anexados" (dentro de uma obra):
 * pastas aninhadas (auto-referência via parent_id) e os arquivos dentro
 * delas. Cada obra ganha, por usuário, duas pastas-raiz automáticas
 * ("própria" e "compartilhada" — ver PastaController::raizes) que definem
 * a privacidade de tudo que fica aninhado embaixo delas.
 *
 * `owner_user_id` NULL = pasta compartilhada (visível a qualquer usuário
 * da empresa com acesso à obra); preenchido = privada daquele usuário. Ao
 * criar uma subpasta, o valor é sempre copiado do pai (nunca aceito do
 * cliente), então a privacidade cai em cascata sem precisar percorrer a
 * árvore de ancestrais a cada leitura.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pastas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('empresa_id');
            $table->uuid('obra_id');
            $table->uuid('parent_id')->nullable();
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->onDelete('cascade');
            $table->enum('tipo_raiz', ['propria', 'compartilhada'])->nullable();
            $table->string('nome', 180);
            $table->timestamps();

            $table->index(['empresa_id', 'obra_id']);
            $table->index(['obra_id', 'parent_id']);
            $table->unique(['obra_id', 'owner_user_id', 'tipo_raiz']);

            $table->foreign('obra_id')->references('id')->on('obras')->onDelete('cascade');
            $table->foreign('parent_id')->references('id')->on('pastas')->onDelete('cascade');
        });

        Schema::create('arquivos', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('pasta_id');
            $table->string('nome_original', 255);
            $table->string('caminho', 255);
            $table->string('extensao', 20);
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('tamanho_bytes');
            $table->enum('categoria', [
                'imagem', 'video', 'audio', 'pdf', 'cad_bim', 'documento', 'compactado', 'outro',
            ]);
            $table->string('caminho_thumbnail', 255)->nullable();
            $table->enum('thumbnail_status', ['nao_aplicavel', 'pendente', 'pronto', 'falhou'])
                ->default('nao_aplicavel');
            $table->foreignId('enviado_por_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('pasta_id');
            $table->foreign('pasta_id')->references('id')->on('pastas')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arquivos');
        Schema::dropIfExists('pastas');
    }
};
