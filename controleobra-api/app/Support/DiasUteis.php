<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * Contagem de dias úteis (26/09/2026, módulo de Contratos de equipamentos) —
 * só desconta sábado e domingo, sem calendário de feriados (o sistema não tem
 * um cadastro de feriados em nenhum outro lugar; se isso virar problema na
 * prática, é aqui que entraria).
 */
class DiasUteis
{
    /** Soma `$quantidade` dias corridos ou úteis a partir de `$inicio`. */
    public static function somar(Carbon $inicio, int $quantidade, string $unidade): Carbon
    {
        if ($unidade !== 'dias_uteis') {
            return $inicio->copy()->addDays($quantidade);
        }

        $data = $inicio->copy();
        for ($restantes = $quantidade; $restantes > 0; $restantes--) {
            $data->addDay();
            while ($data->isWeekend()) {
                $data->addDay();
            }
        }

        return $data;
    }

    /** O dia útil imediatamente anterior a `$data` (pula fim de semana). */
    public static function diaUtilAnterior(Carbon $data): Carbon
    {
        $anterior = $data->copy()->subDay();
        while ($anterior->isWeekend()) {
            $anterior->subDay();
        }

        return $anterior;
    }
}
