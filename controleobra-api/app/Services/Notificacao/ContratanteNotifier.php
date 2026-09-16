<?php

namespace App\Services\Notificacao;

use App\Models\DiarioRegistro;
use App\Models\Obra;

/**
 * Contrato de aviso ao contratante da obra (cliente final) de que há um
 * diário novo disponível. Canal decidido em 16/09/2026 (item 12 dos
 * pedidos de ajuste, Onilia/Lucas): e-mail, não WhatsApp — ver
 * `EmailContratanteNotifier`, o binding padrão em `AppServiceProvider`.
 *
 * A notificação é só um AVISO ("tem diário novo disponível") — não
 * exige confirmação/resposta do contratante da obra (ele só visualiza,
 * não assina nada).
 */
interface ContratanteNotifier
{
    /**
     * @param  string  $linkPublico  URL completa (com token) que o contratante usa pra ver o diário.
     */
    public function notificarNovoDiario(Obra $obra, DiarioRegistro $registro, string $linkPublico): void;
}
