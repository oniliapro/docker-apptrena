<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Empresa;
use App\Models\EmpresaRepresentante;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Aba "Dados da empresa" do popup de Configurações (26/08/2026, pedido do
 * Lucas) — cadastro da empresa (razão social, CNPJ, inscrição estadual,
 * endereço, contato), identidade visual (cores, fonte, logo, papel
 * timbrado) e representantes legais.
 */
class EmpresaPerfilController extends Controller
{
    /** GET /api/empresa/perfil */
    public function mostrar(Request $request)
    {
        $empresa = $request->user()->empresa()->with('representantes')->first();

        return $this->paraFrontend($empresa);
    }

    /**
     * POST (não PUT) /api/empresa/perfil — precisa aceitar multipart por
     * causa dos uploads de logo/papel timbrado (mesmo motivo de
     * `DiarioObraController::store`). Ao trocar um arquivo, apaga o antigo
     * do disco antes de gravar o novo — diferente de `DiarioObra`, aqui é
     * 1 slot só, não uma lista que só cresce.
     */
    public function atualizar(Request $request)
    {
        $data = $request->validate([
            'razao_social' => 'nullable|string|max:180',
            'nome' => 'nullable|string|max:150',
            'cnpj' => 'nullable|string|max:20',
            'inscricao_estadual' => 'nullable|string|max:30',
            'endereco' => 'nullable|string|max:255',
            'telefone' => 'nullable|string|max:30',
            'email_contato' => 'nullable|email|max:150',
            'cor_primaria' => 'nullable|regex:/^#[0-9a-fA-F]{6}$/',
            'cor_secundaria' => 'nullable|regex:/^#[0-9a-fA-F]{6}$/',
            'fonte' => 'nullable|string|max:30',
            'logo' => 'nullable|image|max:2048',
            'papel_timbrado' => 'nullable|image|max:4096',
        ]);

        $empresa = $request->user()->empresa;

        if ($request->hasFile('logo')) {
            if ($empresa->logo_path) {
                Storage::disk('public')->delete($empresa->logo_path);
            }
            $data['logo_path'] = $request->file('logo')->store('empresa', 'public');
        }

        if ($request->hasFile('papel_timbrado')) {
            if ($empresa->papel_timbrado_path) {
                Storage::disk('public')->delete($empresa->papel_timbrado_path);
            }
            $data['papel_timbrado_path'] = $request->file('papel_timbrado')->store('empresa', 'public');
        }

        $empresa->fill($data);
        $empresa->save();

        return $this->paraFrontend($empresa->load('representantes'));
    }

    /** GET /api/empresa/representantes */
    public function listarRepresentantes(Request $request)
    {
        return $request->user()->empresa->representantes()->orderBy('nome')->get()
            ->map(fn (EmpresaRepresentante $r) => $this->representanteParaFrontend($r));
    }

    /** POST /api/empresa/representantes */
    public function criarRepresentante(Request $request)
    {
        $data = $this->validarRepresentante($request);
        // `create()` não recarrega o registro depois do INSERT — sem isso,
        // o `ativo` da resposta ficaria `null` (⇒ `false` no cast) mesmo
        // com o default `true` da coluna, até a próxima recarga da página.
        $data['ativo'] = $data['ativo'] ?? true;
        $representante = $request->user()->empresa->representantes()->create($data);

        return $this->representanteParaFrontend($representante);
    }

    /** PUT /api/empresa/representantes/{representante} */
    public function atualizarRepresentante(Request $request, EmpresaRepresentante $representante)
    {
        $data = $this->validarRepresentante($request);
        $representante->update($data);

        return $this->representanteParaFrontend($representante);
    }

    /** DELETE /api/empresa/representantes/{representante} */
    public function excluirRepresentante(EmpresaRepresentante $representante)
    {
        $representante->delete();
        return response()->noContent();
    }

    private function validarRepresentante(Request $request): array
    {
        return $request->validate([
            'nome' => 'required|string|max:150',
            'cargo' => 'nullable|string|max:100',
            'cpf' => 'nullable|string|max:14',
            'email' => 'nullable|email|max:150',
            'telefone' => 'nullable|string|max:30',
            'ativo' => 'nullable|boolean',
        ]);
    }

    private function paraFrontend(Empresa $empresa): array
    {
        return [
            'nome' => $empresa->nome ?? '',
            'razaoSocial' => $empresa->razao_social ?? '',
            'cnpj' => $empresa->cnpj ?? '',
            'inscricaoEstadual' => $empresa->inscricao_estadual ?? '',
            'endereco' => $empresa->endereco ?? '',
            'telefone' => $empresa->telefone ?? '',
            'emailContato' => $empresa->email_contato ?? '',
            'corPrimaria' => $empresa->cor_primaria ?? '',
            'corSecundaria' => $empresa->cor_secundaria ?? '',
            'fonte' => $empresa->fonte ?? 'padrao',
            'logoUrl' => $empresa->logo_url,
            'papelTimbradoUrl' => $empresa->papel_timbrado_url,
            'representantes' => $empresa->representantes->map(
                fn (EmpresaRepresentante $r) => $this->representanteParaFrontend($r),
            )->values(),
        ];
    }

    private function representanteParaFrontend(EmpresaRepresentante $r): array
    {
        return [
            'id' => $r->id,
            'nome' => $r->nome,
            'cargo' => $r->cargo ?? '',
            'cpf' => $r->cpf ?? '',
            'email' => $r->email ?? '',
            'telefone' => $r->telefone ?? '',
            'ativo' => (bool) $r->ativo,
        ];
    }
}
