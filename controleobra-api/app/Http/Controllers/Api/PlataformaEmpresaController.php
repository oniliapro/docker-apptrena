<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Empresa;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Painel de planos (15/10/2026) — o dono do ComTrena cria as CONTAS PRINCIPAIS
 * (empresa + usuário administrador) e controla plano/assinatura de cada uma.
 * É o único caminho para nascer uma conta principal: o cadastro público saiu do
 * login. Só `AdminPlataforma` autenticado nas duas etapas chega aqui
 * (`ApenasPlataforma`).
 *
 * Os usuários secundários continuam sendo criados pelo administrador da
 * própria empresa, em Configurações → Controle de permissões.
 */
class PlataformaEmpresaController extends Controller
{
    public const PLANOS = ['trial', 'basico', 'profissional', 'empresarial'];

    /**
     * `suspensa`/`cancelada` BLOQUEIAM o login da empresa inteira. `trial` e `ativa` liberam.
     * A data de validade é informativa (aparece como "vencida" no painel): bloquear por data
     * trancaria clientes por esquecimento de renovação manual, então a decisão fica explícita
     * no status, não implícita no calendário.
     */
    public const STATUS = ['trial', 'ativa', 'suspensa', 'cancelada'];

    /** GET /admin-plataforma/empresas */
    public function index()
    {
        $empresas = Empresa::query()
            ->withCount('usuarios')
            ->orderBy('nome')
            ->get();

        $principais = User::query()
            ->where('papel', 'admin')
            ->whereIn('empresa_id', $empresas->pluck('id'))
            ->orderBy('created_at')
            ->get(['id', 'empresa_id', 'name', 'email', 'ativo'])
            ->groupBy('empresa_id');

        return $empresas->map(fn (Empresa $e) => $this->paraFrontend($e, $principais->get($e->id)?->first()))->values();
    }

    /** POST /admin-plataforma/empresas — cria a empresa e o usuário principal de uma vez. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'empresa' => 'required|string|max:150',
            'name' => 'required|string|max:150',
            'email' => 'required|email|max:180|unique:users,email',
            'password' => 'required|string|min:8|max:100',
            'plano' => ['nullable', Rule::in(self::PLANOS)],
            'assinatura_status' => ['nullable', Rule::in(self::STATUS)],
            'assinatura_valida_ate' => 'nullable|date',
            'observacoes_plataforma' => 'nullable|string|max:2000',
        ]);

        $resultado = DB::transaction(function () use ($data) {
            $empresa = Empresa::create([
                'nome' => $data['empresa'],
                'plano' => $data['plano'] ?? 'trial',
                'assinatura_status' => $data['assinatura_status'] ?? 'trial',
                'assinatura_valida_ate' => $data['assinatura_valida_ate'] ?? now()->addDays(14),
                'observacoes_plataforma' => $data['observacoes_plataforma'] ?? null,
            ]);

            $usuario = User::create([
                'empresa_id' => $empresa->id,
                'papel' => 'admin',
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'ativo' => true,
                'pode_gerenciar_permissoes' => true,
            ]);

            return [$empresa, $usuario];
        });

        return response()->json($this->paraFrontend($resultado[0]->loadCount('usuarios'), $resultado[1]), 201);
    }

    /** PUT /admin-plataforma/empresas/{empresa} — plano, status, validade e anotação. */
    public function update(Request $request, string $empresaId)
    {
        $empresa = Empresa::findOrFail($empresaId);

        $data = $request->validate([
            'plano' => ['nullable', Rule::in(self::PLANOS)],
            'assinatura_status' => ['nullable', Rule::in(self::STATUS)],
            'assinatura_valida_ate' => 'nullable|date',
            'observacoes_plataforma' => 'nullable|string|max:2000',
        ]);

        // `plano` e `assinatura_status` não aceitam null (colunas com default); a validade e
        // a anotação aceitam — null limpa o campo.
        foreach (['plano', 'assinatura_status'] as $campo) {
            if (array_key_exists($campo, $data) && $data[$campo] === null) {
                unset($data[$campo]);
            }
        }

        $empresa->fill($data);
        $empresa->save();

        $principal = User::where('empresa_id', $empresa->id)->where('papel', 'admin')->orderBy('created_at')->first();

        return $this->paraFrontend($empresa->loadCount('usuarios'), $principal);
    }

    private function paraFrontend(Empresa $empresa, ?User $principal): array
    {
        $validade = $empresa->assinatura_valida_ate;

        return [
            'id' => $empresa->id,
            'nome' => $empresa->nome,
            'plano' => $empresa->plano,
            'assinaturaStatus' => $empresa->assinatura_status,
            'assinaturaValidaAte' => $validade?->toDateString(),
            'vencida' => $validade !== null && $validade->isPast() && in_array($empresa->assinatura_status, ['trial', 'ativa'], true),
            'usuarios' => (int) ($empresa->usuarios_count ?? 0),
            'observacoes' => $empresa->observacoes_plataforma ?? '',
            'criadaEm' => $empresa->created_at?->toDateString(),
            'principal' => $principal ? [
                'nome' => $principal->name,
                'email' => $principal->email,
                'ativo' => (bool) $principal->ativo,
            ] : null,
        ];
    }
}
