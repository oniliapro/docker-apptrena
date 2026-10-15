<?php

namespace App\Support;

use Carbon\Carbon;

/**
 * Fuso horário da empresa do usuário logado (15/10/2026).
 *
 * O banco continua guardando instantes em UTC (`config('app.timezone')`) —
 * trocar isso globalmente misturaria horários antigos e novos na mesma
 * coluna. O fuso escolhido pela empresa entra só onde o "hoje"/"agora" é lido
 * por uma pessoa: data impressa em contrato, "vence hoje", lembretes de agenda.
 */
class Fuso
{
    public const PADRAO = 'America/Sao_Paulo';

    /** Identificador IANA válido do fuso da empresa logada; cai no padrão (São Paulo). */
    public static function atual(): string
    {
        $fuso = auth()->user()?->empresa?->fuso_horario;

        return self::valido($fuso) ? (string) $fuso : self::PADRAO;
    }

    public static function valido(mixed $fuso): bool
    {
        return is_string($fuso) && $fuso !== '' && in_array($fuso, \DateTimeZone::listIdentifiers(), true);
    }

    /** O instante atual, expresso no fuso da empresa (para imprimir data/hora). */
    public static function agora(): Carbon
    {
        return Carbon::now(self::atual());
    }

    /**
     * Meia-noite do DIA de hoje no fuso da empresa, como Carbon "de parede" no
     * fuso padrão da aplicação — substitui `now()->startOfDay()` em comparações
     * com datas que vêm do banco/formulário (`Y-m-d`), que também são lidas
     * como dia de calendário, sem fuso.
     */
    public static function hoje(): Carbon
    {
        return Carbon::parse(self::agora()->toDateString())->startOfDay();
    }
}
