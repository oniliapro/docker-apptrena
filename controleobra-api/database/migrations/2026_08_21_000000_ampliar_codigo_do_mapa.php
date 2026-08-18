<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `mapas.codigo` nasceu varchar(20) pensando no formato antigo "MAPA-NNN"
 * (sequencial no sistema inteiro). Virou "MAPA-{código da obra}-{nº do
 * mapa}" (21/08/2026, pedido do Lucas — pra ficar óbvio de qual obra é só
 * olhando o código, e pra usar o próprio nº do mapa, já único dentro da
 * obra, em vez de manter um contador global separado). `obras.map_number`
 * é varchar(50), então o código composto pode passar de 20 caracteres
 * fácil — alarga bastante aqui pra não estourar nem em casos extremos de
 * obras antigas com código digitado à mão, comprido.
 *
 * `ALTER ... MODIFY` em vez do `->change()` do Schema Builder (mesmo
 * motivo da migration de `confirmed_at`: sem `doctrine/dbal` instalado).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE mapas MODIFY codigo VARCHAR(150) NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE mapas MODIFY codigo VARCHAR(20) NULL');
    }
};
