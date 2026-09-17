<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `map_number` (código da obra, formato "OBR-001") era único globalmente,
 * mas quem gera o próximo número (`proximoCodigo` em obras.ts) só olha as
 * obras DA MESMA EMPRESA (a listagem já é filtrada por empresa via
 * PertenceAEmpresa). Resultado: a primeira obra de QUALQUER empresa nova
 * tenta "OBR-001" e esbarra no "OBR-001" de uma empresa diferente — mesmo
 * bug do `numero_pagamento` (ver 2026_08_17_000001), agora achado por
 * Lucas em 27/08/2026 ao tentar cadastrar a primeira obra de uma empresa
 * nova: "SQLSTATE[23000]: Duplicate entry 'OBR-001' for key
 * 'obras.obras_map_number_unique'".
 *
 * Corrige escopando a unicidade para (empresa_id, map_number), que é o que
 * o gerador de número já assume ser verdade.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('obras', function (Blueprint $table) {
            $table->dropUnique('obras_map_number_unique');
            $table->unique(['empresa_id', 'map_number']);
        });
    }

    public function down(): void
    {
        Schema::table('obras', function (Blueprint $table) {
            $table->dropUnique(['empresa_id', 'map_number']);
            $table->unique('map_number');
        });
    }
};
