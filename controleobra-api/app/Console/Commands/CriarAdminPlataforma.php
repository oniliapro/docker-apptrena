<?php

namespace App\Console\Commands;

use App\Models\AdminPlataforma;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

/**
 * Cria (ou redefine a senha de) um administrador da plataforma.
 *
 * É por linha de comando, no servidor, de propósito: não existe nenhuma tela
 * ou rota pública que crie um administrador — quem não tem acesso ao servidor
 * não consegue virar um.
 *
 *   docker exec -it controleobra-phpfpm php artisan plataforma:criar-admin \
 *       voce@email.com "Seu Nome"
 *
 * Com `--redefinir-2fa` também apaga o segundo fator (celular perdido): no
 * próximo login o painel mostra uma chave nova para cadastrar.
 */
class CriarAdminPlataforma extends Command
{
    protected $signature = 'plataforma:criar-admin {email} {nome?} {--redefinir-2fa : Apaga o segundo fator atual}';

    protected $description = 'Cria ou atualiza o administrador do painel de planos (login + verificação em duas etapas)';

    public function handle(): int
    {
        $email = (string) $this->argument('email');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('E-mail inválido.');
            return self::FAILURE;
        }

        $admin = AdminPlataforma::where('email', $email)->first();

        if ($admin && $this->option('redefinir-2fa') && !$this->confirm('Apagar o segundo fator de '.$email.'?', false)) {
            return self::FAILURE;
        }

        if (!$admin) {
            $nome = (string) ($this->argument('nome') ?: $this->ask('Nome'));
            $senha = $this->pedirSenha();
            if ($senha === null) {
                return self::FAILURE;
            }

            AdminPlataforma::create(['name' => $nome, 'email' => $email, 'password' => $senha, 'ativo' => true]);
            $this->info("Administrador {$email} criado. No primeiro login o painel mostra a chave do aplicativo autenticador.");

            return self::SUCCESS;
        }

        $mudou = false;

        if ($this->option('redefinir-2fa')) {
            $admin->forceFill(['totp_secret' => null, 'totp_confirmado_em' => null, 'totp_ultimo_intervalo' => null])->save();
            $admin->tokens()->delete();
            $this->info('Segundo fator apagado e sessões encerradas — o próximo login cadastra um novo.');
            $mudou = true;
        }

        if ($this->confirm('Definir uma senha nova para '.$email.'?', false)) {
            $senha = $this->pedirSenha();
            if ($senha === null) {
                return self::FAILURE;
            }
            $admin->password = $senha;
            $admin->save();
            $admin->tokens()->delete();
            $this->info('Senha atualizada e sessões encerradas.');
            $mudou = true;
        }

        if (!$mudou) {
            $this->line('Nada a fazer: o administrador já existe.');
        }

        return self::SUCCESS;
    }

    private function pedirSenha(): ?string
    {
        $senha = (string) $this->secret('Senha (mínimo 12 caracteres)');
        $confirmacao = (string) $this->secret('Repita a senha');

        if (strlen($senha) < 12) {
            $this->error('A senha precisa ter pelo menos 12 caracteres.');
            return null;
        }
        if (!hash_equals($senha, $confirmacao)) {
            $this->error('As senhas não conferem.');
            return null;
        }

        return $senha;
    }
}
