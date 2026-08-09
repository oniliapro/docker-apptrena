<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tabela chave/valor genérica — equivalente ao storage.json que o
 * backend/storage.php atual usa, só que em MySQL. Serve de destino para
 * js/shared/backend-storage.js continuar funcionando com getItem/setItem
 * sem precisar reescrever cada módulo do frontend (EAP, Mapa, Empreita,
 * Pagamentos) de uma vez. Ver app/Http/Controllers/Api/StorageController.php.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_storage', function (Blueprint $table) {
            $table->string('key_name', 150)->primary();
            $table->longText('value');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_storage');
    }
};
