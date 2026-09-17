<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ModuloPermissao;
use App\Models\User;
use App\Services\PermissaoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * CRUD de usuários secundários + suas permissões por módulo (31/08/2026,
 * pedido do Lucas, aba "Controle de permissões"). Espelha a estrutura
 * de `EmpresaPerfilController` (mesmo padrão de tradução camelCase).
 *
 * Quem pode chamar qualquer rota daqui: o admin (dono da empresa) ou um
 * usuário secundário com `pode_gerenciar_permissoes=true`
 * (`garantirPodeGerenciar`). A regra fina de hierarquia — um
 * "gerente" secundário não mexe em OUTRO gerente secundário — mora
 * inteira em `autorizarEdicaoDoAlvo`, chamada tanto por `update()`
 * quanto pelos dois endpoints de permissão, pra a trava existir num
 * lugar só.
 */
class UsuarioController extends Controller
{
    /** GET /usuarios */
    public function index(Request $request)
    {
        $ator = $this->garantirPodeGerenciar($request);

        return User::where('empresa_id', $ator->empresa_id)
            ->orderBy('name')
            ->get()
            ->map(fn (User $u) => $this->paraFrontend($u));
    }

    /** POST /usuarios — sempre nasce 'secundario', nunca outro admin. */
    public function store(Request $request)
    {
        $ator = $this->garantirPodeGerenciar($request);

        $data = $request->validate([
            'name' => 'required|string|max:150',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8',
        ]);

        $usuario = User::create([
            'empresa_id' => $ator->empresa_id,
            'papel' => 'secundario',
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'ativo' => true,
            'pode_gerenciar_permissoes' => false,
        ]);

        return response()->json($this->paraFrontend($usuario), 201);
    }

    /** PUT /usuarios/{usuario} */
    public function update(Request $request, User $usuario)
    {
        $ator = $this->garantirPodeGerenciar($request);
        $this->autorizarEdicaoDoAlvo($ator, $usuario);

        $data = $request->validate([
            'name' => 'nullable|string|max:150',
            'email' => ['nullable', 'email', Rule::unique('users', 'email')->ignore($usuario->id)],
            'ativo' => 'nullable|boolean',
            'pode_gerenciar_permissoes' => 'nullable|boolean',
        ]);

        // Só o admin de verdade concede/revoga "gerenciar permissões" —
        // um gerente secundário não pode promover outro secundário ao
        // mesmo nível dele (só editar os campos básicos e as permissões
        // de módulo de quem já não é gerente).
        if (!$ator->ehAdmin()) {
            unset($data['pode_gerenciar_permissoes']);
        }

        $usuario->fill(array_filter($data, fn ($v) => $v !== null));
        $usuario->save();

        return $this->paraFrontend($usuario);
    }

    /** GET /usuarios/{usuario}/permissoes */
    public function listarPermissoes(Request $request, User $usuario)
    {
        $ator = $this->garantirPodeGerenciar($request);
        $this->autorizarEdicaoDoAlvo($ator, $usuario);

        return $this->permissoesParaFrontend($usuario);
    }

    /** PUT /usuarios/{usuario}/permissoes — grava o conjunto inteiro, upsert por módulo. */
    public function salvarPermissoes(Request $request, User $usuario)
    {
        $ator = $this->garantirPodeGerenciar($request);
        $this->autorizarEdicaoDoAlvo($ator, $usuario);

        $data = $request->validate([
            'modulos' => 'required|array',
            'modulos.*.modulo' => ['required', 'string', Rule::in(PermissaoService::MODULOS)],
            'modulos.*.podeUsar' => 'nullable|boolean',
            'modulos.*.podeCriar' => 'nullable|boolean',
            'modulos.*.podeEditar' => 'nullable|boolean',
            'modulos.*.podeExcluir' => 'nullable|boolean',
            'modulos.*.podeReabrir' => 'nullable|boolean',
        ]);

        foreach ($data['modulos'] as $linha) {
            ModuloPermissao::updateOrCreate(
                ['user_id' => $usuario->id, 'modulo' => $linha['modulo']],
                [
                    'empresa_id' => $usuario->empresa_id,
                    'pode_usar' => $linha['podeUsar'] ?? false,
                    'pode_criar' => $linha['podeCriar'] ?? false,
                    'pode_editar' => $linha['podeEditar'] ?? false,
                    'pode_excluir' => $linha['podeExcluir'] ?? false,
                    'pode_reabrir' => $linha['podeReabrir'] ?? false,
                ],
            );
        }

        return $this->permissoesParaFrontend($usuario->fresh());
    }

    // ------------------------------------------------------------------
    private function garantirPodeGerenciar(Request $request): User
    {
        $ator = $request->user();
        abort_unless($ator && ($ator->ehAdmin() || $ator->pode_gerenciar_permissoes), 403, 'Sem permissão para gerenciar usuários.');
        return $ator;
    }

    /**
     * A trava de hierarquia (requisito do Lucas): o admin mexe em
     * qualquer um; um gerente secundário mexe em outros secundários,
     * MENOS em outro que também seja gerente (nem nele mesmo, por esta
     * rota — edição própria não faz sentido aqui).
     */
    private function autorizarEdicaoDoAlvo(User $ator, User $alvo): void
    {
        abort_unless($alvo->empresa_id === $ator->empresa_id, 404);

        if ($ator->ehAdmin()) return;

        abort_if($alvo->id === $ator->id, 403, 'Use seu próprio perfil para isso.');
        abort_if($alvo->ehAdmin(), 403, 'Sem permissão para editar o administrador.');
        abort_if($alvo->pode_gerenciar_permissoes, 403, 'Sem permissão para editar outro gerente de permissões.');
    }

    private function paraFrontend(User $u): array
    {
        return [
            'id' => $u->id,
            'nome' => $u->name,
            'email' => $u->email,
            'papel' => $u->papel,
            'ativo' => (bool) $u->ativo,
            'podeGerenciarPermissoes' => (bool) $u->pode_gerenciar_permissoes,
        ];
    }

    private function permissoesParaFrontend(User $usuario): array
    {
        $porModulo = $usuario->permissoesModulo()->get()->keyBy('modulo');

        return collect(PermissaoService::MODULOS)->map(function (string $modulo) use ($porModulo) {
            $linha = $porModulo->get($modulo);
            return [
                'modulo' => $modulo,
                'podeUsar' => (bool) ($linha->pode_usar ?? false),
                'podeCriar' => (bool) ($linha->pode_criar ?? false),
                'podeEditar' => (bool) ($linha->pode_editar ?? false),
                'podeExcluir' => (bool) ($linha->pode_excluir ?? false),
                'podeReabrir' => (bool) ($linha->pode_reabrir ?? false),
            ];
        })->values()->all();
    }
}
