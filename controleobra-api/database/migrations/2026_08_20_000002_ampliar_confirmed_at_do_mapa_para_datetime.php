<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `mapas.confirmed_at` nasceu como `DATE` (migration original de
 * 2024_01_01 e a de 31/07/2026 que recriou a coluna) — o MySQL descarta a
 * hora ao gravar nessa coluna, não importa o que o cast do Eloquent diga.
 * Isso já era uma pendência (o comentário de MapaStore::alternarConfirmacao
 * dizia "guarda data E hora" desde 04/08/2026, mas nunca guardou de
 * verdade) e ficou mais visível agora que `confirmed_at` passou a travar
 * na primeira finalização (20/08/2026, pedido do Lucas) — sem essa
 * correção, os testes de "Última edição" ficavam com a hora certa mas
 * "Finalização do mapa" continuava sempre em 00:00:00.
 *
 * `ALTER ... MODIFY` em vez do `->change()` do Schema Builder porque este
 * projeto não tem `doctrine/dbal` instalado (dependência que o `->change()`
 * exige).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE mapas MODIFY confirmed_at DATETIME NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE mapas MODIFY confirmed_at DATE NULL');
    }
};
