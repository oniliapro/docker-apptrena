<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `rdo_etapas.nome` nasceu VARCHAR(150) quando "etapa" era só um nome curto,
 * separado da tarefa. Em 26/09/2026 (pedido do Lucas) o campo "Nome da
 * etapa" virou "Descrição do serviço" e passou a viver DENTRO de cada
 * tarefa — o mesmo texto que descreve o que foi executado agora também
 * grava aqui, e prosa livre estoura 150 caracteres fácil. Alarga pra TEXT,
 * igual a `rdo_tarefas.descricao`/`rdo_pendencias.descricao`.
 *
 * `ALTER ... MODIFY` em vez do `->change()` do Schema Builder (este projeto
 * não tem `doctrine/dbal` instalado — mesmo motivo das outras migrations de
 * ampliar coluna, ver `2026_08_21_000000_ampliar_codigo_do_mapa`).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE rdo_etapas MODIFY nome TEXT NOT NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE rdo_etapas MODIFY nome VARCHAR(150) NOT NULL');
    }
};
