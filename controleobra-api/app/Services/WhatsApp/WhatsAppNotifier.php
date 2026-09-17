<?php

namespace App\Services\WhatsApp;

use App\Models\DiarioRegistro;
use App\Models\Obra;

/**
 * Contrato de notificação por WhatsApp do Diário de Obra (08/09/2026).
 * Provedor concreto ainda não definido (Business API oficial vs.
 * Twilio/Z-API — pergunta em aberto na especificação); por isso essa
 * camada fica abstraída atrás de uma interface, e o binding padrão
 * (`AppServiceProvider`) usa `LogWhatsAppNotifier` até haver decisão.
 *
 * A notificação é só um AVISO ("tem diário novo disponível") — não
 * exige confirmação/resposta do contratante da obra (ver decisão
 * registrada na especificação: ele só visualiza, não assina).
 */
interface WhatsAppNotifier
{
    /**
     * @param  string  $linkPublico  URL completa (com token) que o contratante usa pra ver o diário.
     */
    public function notificarNovoDiario(Obra $obra, DiarioRegistro $registro, string $linkPublico): void;
}
