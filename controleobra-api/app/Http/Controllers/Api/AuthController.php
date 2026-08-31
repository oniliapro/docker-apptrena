<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Empresa;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
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
    /**
     * Cadastro público de uma nova empresa (cliente) + seu primeiro usuário
     * (administrador da própria empresa). Começa em plano "trial" — a
     * liberação/bloqueio por assinatura paga entra depois, quando o
     * pagamento for integrado.
     */
    public function registrar(Request $request)
    {
        $data = $request->validate([
            'empresa' => 'required|string|max:150',
            'name' => 'required|string|max:150',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8',
        ]);

        $empresa = Empresa::create([
            'nome' => $data['empresa'],
            'plano' => 'trial',
            'assinatura_status' => 'trial',
            'assinatura_valida_ate' => now()->addDays(14),
        ]);

        $user = User::create([
            'empresa_id' => $empresa->id,
            'papel' => 'admin',
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
        ]);

        $token = $user->createToken('controle-obra-frontend')->plainTextToken;

        return response()->json([
            'ok' => true,
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'empresa' => $empresa->nome,
            ],
        ], 201);
    }

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
            ],
        ]);
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
