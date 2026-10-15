<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Administrador da plataforma (o dono do ComTrena) — acesso ao painel de
 * planos/contas em `/app/plataforma`. Tabela própria, separada de `users`
 * (ver a migration `create_admins_plataforma_e_fuso_horario`).
 *
 * Não tem `empresa_id` de propósito: ele administra TODAS as empresas. Por
 * isso o token dele só vale nas rotas `admin-plataforma/*`
 * (`BloqueiaPlataformaForaDoPainel`) — nas rotas normais do sistema o
 * isolamento por empresa dependeria de um `empresa_id` que ele não tem.
 */
class AdminPlataforma extends Authenticatable
{
    use HasApiTokens;

    protected $table = 'admins_plataforma';

    protected $fillable = [
        'name', 'email', 'password', 'totp_secret', 'totp_confirmado_em',
        'totp_ultimo_intervalo', 'ultimo_login_em', 'ativo',
    ];

    protected $hidden = ['password', 'totp_secret', 'remember_token'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'totp_secret' => 'encrypted',
            'totp_confirmado_em' => 'datetime',
            'ultimo_login_em' => 'datetime',
            'ativo' => 'boolean',
        ];
    }

    public function segundoFatorConfigurado(): bool
    {
        return $this->totp_confirmado_em !== null && !empty($this->totp_secret);
    }
}
