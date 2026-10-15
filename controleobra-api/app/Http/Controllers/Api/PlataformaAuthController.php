<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminPlataforma;
use App\Support\Totp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Login do painel de planos (`/app/plataforma`) — só o dono do ComTrena.
 *
 * Duas etapas, nesta ordem, e o token de acesso só existe depois da segunda:
 *   1. e-mail + senha  → devolve um `pre_token` de 5 minutos (nada além disso);
 *   2. código de 6 dígitos do aplicativo autenticador (TOTP).
 *
 * Na PRIMEIRA vez ainda não existe segundo fator: a etapa 1 devolve o segredo
 * para cadastrar no aplicativo, e o primeiro código válido o confirma.
 *
 * Mensagens de erro são genéricas de propósito (conta inexistente, senha
 * errada e conta desativada respondem a mesma coisa).
 */
class PlataformaAuthController extends Controller
{
    private const VALIDADE_PRE_TOKEN_MIN = 5;
    private const MAX_TENTATIVAS_CODIGO = 5;
    /** Sessão do painel curta de propósito — é o acesso mais sensível do sistema. */
    private const VALIDADE_SESSAO_HORAS = 8;

    /** POST /admin-plataforma/login */
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $admin = AdminPlataforma::where('email', $data['email'])->first();

        // Sem conta, gasta o mesmo tempo de um hash de verdade — o tempo de resposta não
        // pode revelar se o e-mail existe.
        if ($admin) {
            $senhaConfere = Hash::check($data['password'], $admin->password);
        } else {
            Hash::make($data['password']);
            $senhaConfere = false;
        }

        if (!$admin || !$senhaConfere || !$admin->ativo) {
            throw ValidationException::withMessages(['email' => ['E-mail ou senha incorretos.']]);
        }

        $configurando = !$admin->segundoFatorConfigurado();
        $resposta = ['ok' => true, 'etapa' => $configurando ? 'configurar' : 'codigo'];

        if ($configurando) {
            // Segredo novo a cada login ainda não confirmado — se o QR/chave anterior
            // vazou ou foi perdido, não vale mais.
            $segredo = Totp::gerarSegredo();
            $admin->forceFill(['totp_secret' => $segredo, 'totp_confirmado_em' => null])->save();

            $resposta['segredo'] = $segredo;
            $resposta['uri'] = Totp::uriDeProvisionamento($segredo, $admin->email);
        }

        $preToken = Str::random(48);
        Cache::put($this->chaveCache($preToken), ['admin_id' => $admin->id, 'tentativas' => 0], now()->addMinutes(self::VALIDADE_PRE_TOKEN_MIN));
        $resposta['pre_token'] = $preToken;

        return response()->json($resposta);
    }

    /** POST /admin-plataforma/2fa */
    public function verificarCodigo(Request $request)
    {
        $data = $request->validate([
            'pre_token' => 'required|string',
            'codigo' => 'required|string|max:12',
        ]);

        $chave = $this->chaveCache($data['pre_token']);
        $pendente = Cache::get($chave);

        if (!is_array($pendente)) {
            throw ValidationException::withMessages(['codigo' => ['Sessão expirada. Entre de novo com e-mail e senha.']]);
        }

        if (($pendente['tentativas'] ?? 0) >= self::MAX_TENTATIVAS_CODIGO) {
            Cache::forget($chave);
            throw ValidationException::withMessages(['codigo' => ['Muitas tentativas. Entre de novo com e-mail e senha.']]);
        }

        $admin = AdminPlataforma::find($pendente['admin_id']);

        $intervalo = $admin && $admin->ativo && $admin->totp_secret
            ? Totp::verificar($admin->totp_secret, $data['codigo'], $admin->totp_ultimo_intervalo)
            : null;

        if ($intervalo === null) {
            $pendente['tentativas'] = ($pendente['tentativas'] ?? 0) + 1;
            Cache::put($chave, $pendente, now()->addMinutes(self::VALIDADE_PRE_TOKEN_MIN));
            throw ValidationException::withMessages(['codigo' => ['Código incorreto ou expirado.']]);
        }

        Cache::forget($chave);

        $admin->forceFill([
            'totp_confirmado_em' => $admin->totp_confirmado_em ?? now(),
            'totp_ultimo_intervalo' => $intervalo,
            'ultimo_login_em' => now(),
        ])->save();

        $token = $admin->createToken('plataforma', ['plataforma'], now()->addHours(self::VALIDADE_SESSAO_HORAS))->plainTextToken;

        return response()->json([
            'ok' => true,
            'token' => $token,
            'admin' => ['id' => $admin->id, 'name' => $admin->name, 'email' => $admin->email],
        ]);
    }

    /** POST /admin-plataforma/logout */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['ok' => true]);
    }

    /** GET /admin-plataforma/me */
    public function me(Request $request)
    {
        $admin = $request->user();

        return response()->json(['ok' => true, 'admin' => ['id' => $admin->id, 'name' => $admin->name, 'email' => $admin->email]]);
    }

    private function chaveCache(string $preToken): string
    {
        return 'plataforma:pre:'.hash('sha256', $preToken);
    }
}
