<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `mapa_item_precos.valor_unitario` era `decimal(14,2)` — qualquer
 * precisão além de 2 casas decimais digitada no preço unitário do Mapa
 * era TRUNCADA na hora de gravar, mesmo que o frontend calculasse/exibisse
 * corretamente em memória (02/09/2026, pedido do Lucas: preço unitário
 * como 1,5001 × 100 unidades precisa fechar em R$ 150,01 — não dava,
 * porque o banco já tinha perdido a casa 4 antes disso). Amplia pra
 * `decimal(14,6)`, suficiente pra preço fracionado por unidade em compras
 * grandes sem perder a conta.
 *
 * Via `DB::statement` (não `$table->decimal(...)->change()`), mesmo
 * motivo de outras migrations deste projeto que alteram coluna existente:
 * evita depender de `doctrine/dbal`, que não está instalado aqui.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE mapa_item_precos MODIFY COLUMN valor_unitario DECIMAL(14,6) NOT NULL DEFAULT 0');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE mapa_item_precos MODIFY COLUMN valor_unitario DECIMAL(14,2) NOT NULL DEFAULT 0');
    }
};
