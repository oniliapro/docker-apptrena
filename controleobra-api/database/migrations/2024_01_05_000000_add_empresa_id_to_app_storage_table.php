<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Recria app_storage com empresa_id na chave primária (composta com
 * key_name). Antes disso, qualquer usuário logado lia/gravava a mesma
 * chave global (ex.: "controleObra.eap.v2") — ou seja, empresas diferentes
 * colidiriam nos mesmos dados. Isso é crítico de corrigir antes de vender
 * o sistema pra mais de um cliente.
 *
 * Recria do zero (em vez de ALTER) porque, neste estágio do projeto, não
 * existe dado de cliente real na tabela ainda — só uso de teste.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('app_storage');

        Schema::create('app_storage', function (Blueprint $table) {
            $table->uuid('empresa_id');
            $table->string('key_name', 150);
            $table->longText('value');
            $table->timestamps();

            $table->primary(['empresa_id', 'key_name']);
            $table->index('empresa_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_storage');

        Schema::create('app_storage', function (Blueprint $table) {
            $table->string('key_name', 150)->primary();
            $table->longText('value');
            $table->timestamps();
        });
    }
};
