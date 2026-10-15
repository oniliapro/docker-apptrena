<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\RedefinirSenha;
use App\Models\User;
use App\Support\Fuso;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as RegraSenha;
use Illuminate\Validation\ValidationException;

/**
 * Login por token (Sanctum "personal access tokens"), não pelo modo
 * cookie/SPA do Sanctum — o frontend (html/*.html) roda em outra origem
 * dos requests, então guarda o token em localStorage e manda
 * "Authorization: Bearer <token>" em cada chamada. Ver
 * js/shared/backend-storage.js e html/login.html.
 */
class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $data['email'])->first();

        if (!$user || !Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Email ou senha incorretos.'],
            ]);
        }

        // 31/08/2026, Controle de permissões — usuário secundário inativado
        // não consegue mais logar (mesma forma de erro do "senha incorreta"
        // de propósito, pra não vazar pra quem tenta logar se a conta ainda
        // existe ou foi desativada).
        if (!$user->ativo) {
            throw ValidationException::withMessages([
                'email' => ['Email ou senha incorretos.'],
            ]);
        }

        // 15/10/2026, controle de planos — o dono da plataforma suspende/cancela a empresa
        // inteira pelo painel. Mensagem própria (e não a genérica de senha errada): quem chega
        // aqui já provou que a senha está certa, então não vaza nada, e precisa saber a quem
        // recorrer.
        $statusAssinatura = $user->empresa?->assinatura_status;
        if (in_array($statusAssinatura, ['suspensa', 'cancelada'], true)) {
            throw ValidationException::withMessages([
                'email' => ['O acesso desta conta está suspenso. Entre em contato com o suporte do ComTrena.'],
            ]);
        }

        $token = $user->createToken('controle-obra-frontend')->plainTextToken;

        return response()->json([
            'ok' => true,
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'empresa_id' => $user->empresa_id,
                'papel' => $user->papel,
                'podeGerenciarPermissoes' => (bool) $user->pode_gerenciar_permissoes,
                'fusoHorario' => Fuso::valido($user->empresa?->fuso_horario) ? $user->empresa->fuso_horario : Fuso::PADRAO,
            ],
        ]);
    }

    /**
     * POST /esqueci-senha (público) — manda por e-mail um link de uso único.
     *
     * A resposta é SEMPRE a mesma, exista a conta ou não: dizer "e-mail não
     * cadastrado" deixaria qualquer pessoa descobrir quem usa o sistema. O link
     * vale 60 minutos (config/auth.php) e só pode ser usado uma vez; pedir outro
     * invalida o anterior. O intervalo mínimo entre pedidos é de 60s (broker).
     */
    public function esqueciSenha(Request $request)
    {
        $data = $request->validate(['email' => 'required|email|max:180']);

        $usuario = User::where('email', $data['email'])->first();

        if ($usuario && $usuario->ativo) {
            Password::sendResetLink(['email' => $usuario->email], function (User $alvo, string $token) {
                Mail::to($alvo->email)->send(new RedefinirSenha($alvo, $token));
            });
        }

        return response()->json([
            'ok' => true,
            'message' => 'Se o e-mail estiver cadastrado, enviamos um link para criar uma nova senha. Ele vale por 60 minutos.',
        ]);
    }

    /** POST /redefinir-senha (público) — troca a senha com o token recebido por e-mail. */
    public function redefinirSenha(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email|max:180',
            'token' => 'required|string',
            'password' => ['required', 'string', 'confirmed', RegraSenha::min(8)->max(100)],
        ]);

        $status = Password::reset(
            [
                'email' => $data['email'],
                'token' => $data['token'],
                'password' => $data['password'],
                'password_confirmation' => (string) $request->input('password_confirmation'),
            ],
            function (User $usuario, string $senha) {
                // Cast `hashed` do model faz o hash. Revoga as sessões abertas: quem trocou
                // a senha porque achou que ela vazou não pode continuar com o token antigo.
                $usuario->forceFill(['password' => $senha])->save();
                $usuario->tokens()->delete();
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => ['Este link é inválido ou já expirou. Peça um novo em "Esqueci minha senha".'],
            ]);
        }

        return response()->json(['ok' => true, 'message' => 'Senha alterada. Entre com a nova senha.']);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['ok' => true]);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load('empresa');
        return response()->json(['ok' => true, 'user' => $user]);
    }

    /**
     * GET /me/permissoes (31/08/2026, "Controle de permissões") — o
     * conjunto efetivo de permissões do usuário logado, pro
     * `PermissoesService` do frontend consultar uma vez após o login
     * (filtro do menu lateral, guards de rota). Admin não tem linha
     * nenhuma nas tabelas de permissão — `ehAdmin: true` já diz pro
     * frontend que ele passa em tudo, sem precisar simular grants
     * completos aqui.
     */
    public function minhasPermissoes(Request $request)
    {
        $user = $request->user();

        if ($user->ehAdmin()) {
            return response()->json([
                'ehAdmin' => true,
                'podeGerenciarPermissoes' => true,
                'modulos' => [],
                'obras' => [],
            ]);
        }

        $modulos = [];
        foreach (\App\Services\PermissaoService::MODULOS as $chave) {
            $modulos[$chave] = [
                'podeUsar' => false,
                'podeCriar' => false,
                'podeEditar' => false,
                'podeExcluir' => false,
                'podeReabrir' => false,
            ];
        }

        foreach ($user->permissoesModulo as $p) {
            if (!isset($modulos[$p->modulo])) continue;
            $modulos[$p->modulo] = [
                'podeUsar' => (bool) $p->pode_usar,
                'podeCriar' => (bool) $p->pode_criar,
                'podeEditar' => (bool) $p->pode_editar,
                'podeExcluir' => (bool) $p->pode_excluir,
                'podeReabrir' => (bool) $p->pode_reabrir,
            ];
        }

        // Mesma exceção do PermissaoService::podeModulo — a EAP é sempre
        // visível a quem tem acesso à obra, independente de linha gravada.
        if (isset($modulos['eap'])) {
            $modulos['eap']['podeUsar'] = true;
        }

        $obras = [];
        foreach ($user->obraAcessos as $a) {
            $obras[$a->obra_id] = [
                'podeVer' => (bool) $a->pode_ver,
                'podeLancar' => (bool) $a->pode_lancar,
            ];
        }

        return response()->json([
            'ehAdmin' => false,
            'podeGerenciarPermissoes' => (bool) $user->pode_gerenciar_permissoes,
            'modulos' => $modulos,
            'obras' => $obras,
        ]);
    }
}
