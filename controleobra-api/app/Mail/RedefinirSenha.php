<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

/**
 * Link de redefinição de senha (15/10/2026). Envio síncrono de propósito, como
 * `RdoDisponivel`: o docker-compose não roda `queue:work`, então enfileirar faria
 * o e-mail nunca sair.
 *
 * O token vai na própria URL (`/redefinir-senha?token=...&email=...`), nunca
 * armazenado em claro: o banco guarda só o hash (`password_reset_tokens`).
 */
class RedefinirSenha extends Mailable
{
    use Queueable, SerializesModels;

    public string $link;
    public int $validadeMinutos;

    public function __construct(public User $usuario, string $token)
    {
        $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $this->link = $base.'/redefinir-senha?token='.urlencode($token).'&email='.urlencode($usuario->email);
        $this->validadeMinutos = (int) config('auth.passwords.users.expire', 60);
    }

    public function build(): self
    {
        return $this->subject('Redefinição de senha — ComTrena')->view('emails.redefinir-senha');
    }
}
