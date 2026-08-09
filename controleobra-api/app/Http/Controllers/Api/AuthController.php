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

        $token = $user->createToken('controle-obra-frontend')->plainTextToken;

        return response()->json([
            'ok' => true,
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'empresa_id' => $user->empresa_id,
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
}
