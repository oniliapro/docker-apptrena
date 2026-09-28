<?php

namespace App\Mail;

use App\Models\RdoContratanteLink;
use App\Models\RdoRegistro;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

/**
 * Aviso ao contratante da obra de que há um RDO novo disponível. Só avisa —
 * o link é somente leitura e não pede nenhuma ação dele.
 *
 * Envio síncrono de propósito (não implementa ShouldQueue): o
 * docker-compose deste projeto não roda `queue:work`, então enfileirar faria
 * o e-mail nunca sair, só acumular na tabela `jobs`. Mesma decisão do
 * NovoDiarioDisponivel.
 */
class RdoDisponivel extends Mailable
{
    use Queueable, SerializesModels;

    public string $linkPublico;

    public function __construct(
        public RdoRegistro $rdo,
        public RdoContratanteLink $link,
    ) {
        $urlBase = rtrim(config('app.frontend_url', config('app.url')), '/');
        $this->linkPublico = "{$urlBase}/publico/rdo/{$link->token}";
    }

    public function build(): self
    {
        $obra = $this->rdo->obra?->obra_nome ?? 'ComTrena';

        return $this
            ->subject("Relatório Diário de Obra nº {$this->rdo->numero} — {$obra}")
            ->view('emails.rdo-disponivel');
    }
}
