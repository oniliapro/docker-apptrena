<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `numero_pagamento` (formato "PG-0001") era único globalmente, mas quem
 * gera o próximo número (`gerarNumeroPagamento` no frontend) só olha os
 * pagamentos DA MESMA OBRA — o endpoint `GET /pagamentos?obra_id=...` já
 * filtra por obra. Resultado: a primeira obra de cada empresa gera
 * "PG-0001" sem problema, mas a SEGUNDA obra também tenta "PG-0001" (sua
 * própria lista de pagamentos está vazia) e esbarra no "PG-0001" de uma
 * obra diferente — erro visto pelo Lucas, 17/08/2026, ao gerar pagamento
 * de um mapa numa obra cuja empresa já tinha "PG-0001" usado noutra obra.
 *
 * Corrige escopando a unicidade para (obra_id, numero_pagamento), que é o
 * que o gerador de número já assume ser verdade.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pagamentos', function (Blueprint $table) {
            $table->dropUnique('pagamentos_numero_pagamento_unique');
            $table->unique(['obra_id', 'numero_pagamento']);
        });
    }

    public function down(): void
    {
        Schema::table('pagamentos', function (Blueprint $table) {
            $table->dropUnique(['obra_id', 'numero_pagamento']);
            $table->unique('numero_pagamento');
        });
    }
};
