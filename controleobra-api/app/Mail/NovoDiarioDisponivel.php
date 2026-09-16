<?php

namespace App\Mail;

use App\Models\DiarioRegistro;
use App\Models\Obra;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

/**
 * Aviso ao contratante da obra (cliente final) de que há um novo
 * lançamento do Diário de Obra disponível pra visualização (16/09/2026,
 * ver `EmailContratanteNotifier`). Só avisa — o link em si é
 * somente-leitura e não exige nenhuma ação do contratante.
 *
 * Enviado de forma síncrona (não implementa `ShouldQueue`) de propósito:
 * não há worker de fila configurado no `docker-compose.yml` deste
 * projeto (`QUEUE_CONNECTION=database` sem nenhum serviço rodando
 * `queue:work`) — enfileirar aqui faria o e-mail nunca sair, só
 * acumular na tabela `jobs`.
 */
class NovoDiarioDisponivel extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Obra $obra,
        public DiarioRegistro $registro,
        public string $linkPublico,
    ) {
    }

    public function build(): self
    {
        return $this
            ->subject('Novo diário de obra disponível — ' . ($this->obra->obra_nome ?? 'AppTrena'))
            ->view('emails.novo-diario');
    }
}
