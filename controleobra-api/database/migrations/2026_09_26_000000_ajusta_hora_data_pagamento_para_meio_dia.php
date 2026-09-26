<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * 25/09/2026 (bug reportado pelo Lucas): a "Data de pagamento" escolhida no
 * calendário aparecia na coluna Pagamento como o dia ANTERIOR às 21h. Causa:
 * `pagamentos.data_pagamento` é DATETIME e o app grava em UTC; uma data
 * escolhida (`2026-09-25`) virava `2026-09-25 00:00:00` UTC, que no fuso de
 * Brasília (UTC−3) é `24/09 21:00`. O `Pagamento` agora grava a data
 * escolhida às 12:00 de Brasília (15:00 UTC) — ver
 * `Pagamento::setDataPagamentoAttribute`.
 *
 * Esta migration corrige os pagamentos JÁ gravados do jeito antigo: só as
 * linhas com hora exatamente 00:00:00 (que só existem quando a data veio de
 * um calendário — a confirmação por botão grava o instante real) ganham
 * 15 horas, ficando às 12:00 de Brasília no MESMO dia que o usuário escolheu.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "UPDATE pagamentos SET data_pagamento = DATE_ADD(data_pagamento, INTERVAL 15 HOUR)
             WHERE data_pagamento IS NOT NULL AND TIME(data_pagamento) = '00:00:00'"
        );
    }

    public function down(): void
    {
        DB::statement(
            "UPDATE pagamentos SET data_pagamento = DATE_SUB(data_pagamento, INTERVAL 15 HOUR)
             WHERE data_pagamento IS NOT NULL AND TIME(data_pagamento) = '15:00:00'"
        );
    }
};
