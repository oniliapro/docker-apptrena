<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `pagamentos.data_pagamento` era `DATE` — não guarda hora. 26/08/2026,
 * pedido do Lucas: "ao confirmar um pagamento, o sistema puxa a data e
 * hora do clique e já lança como data de pagamento" — precisa de
 * `DATETIME` pra guardar isso. Via `DB::statement` (não `$table->change()`)
 * pelo mesmo motivo da migration `..._simplificar_empreita_item_para_um_tipo`:
 * evita depender de `doctrine/dbal`, que não está instalado neste projeto.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE pagamentos MODIFY COLUMN data_pagamento DATETIME NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE pagamentos MODIFY COLUMN data_pagamento DATE NULL');
    }
};
