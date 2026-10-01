<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContratoModelo;
use App\Models\Tag;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Cadastro de modelos de contrato (28/09/2026, itens 8/9, Configurações) —
 * mesmo espírito de Materiais/Profissionais/Modelos de FVS: criado uma
 * vez, escolhido depois ao gerar o contrato de uma empreita ou de uma obra
 * específica (`ContratoPdfController`).
 */
class ContratoModeloController extends Controller
{
    /**
     * Variáveis que cada `tipo` de modelo aceita — mostradas na tela de
     * cadastro e substituídas ao gerar o PDF. Ampliado em 29/09/2026 com
     * os campos que Obra e Empresa já têm de verdade (pedido do Lucas de
     * "colocar todos os dados... da obra e dados da empresa"). `cliente` e
     * `empreiteiro` continuam sendo só o NOME (texto livre hoje na Obra/
     * Empreita, sem ligação com o cadastro completo) — telefone/documento/
     * endereço deles ficam pra quando Clientes/Empreiteiros virarem cadastro
     * relacional de verdade (decidido com o Lucas, fase separada).
     */
    public const VARIAVEIS = [
        'empreita' => [
            'empresa_nome', 'empresa_cnpj', 'empresa_endereco', 'empresa_telefone', 'empresa_email', 'empresa_inscricao_estadual',
            'obra_nome', 'numero_contrato', 'local_obra', 'periodo', 'prazo_meses', 'data_base',
            'responsavel_tecnico', 'crea', 'art',
            'cliente', 'empreiteiro', 'descricao_empreita', 'numero_empreita', 'valor', 'data',
        ],
        'obra' => [
            'empresa_nome', 'empresa_cnpj', 'empresa_endereco', 'empresa_telefone', 'empresa_email', 'empresa_inscricao_estadual',
            'obra_nome', 'numero_contrato', 'local_obra', 'periodo', 'prazo_meses', 'data_base',
            'responsavel', 'responsavel_tecnico', 'crea', 'art',
            'cliente', 'data',
        ],
    ];

    /**
     * Pseudo-variáveis só do cabeçalho/rodapé (numeração de página) — não
     * fazem parte de `VARIAVEIS` porque não são substituídas pela tela de
     * impressão (`preencherModeloContrato`): o Browsershot as resolve
     * direto na hora de gerar o PDF, via `->headerHtml()`/`->footerHtml()`
     * (ver `ContratoPdfController`), que roda fora da página normal do
     * Angular.
     */
    public const VARIAVEIS_PAGINA = ['pagina', 'total_paginas'];

    public function index(Request $request)
    {
        $query = ContratoModelo::orderBy('nome');
        if ($request->filled('tipo')) {
            $query->where('tipo', $request->query('tipo'));
        }

        return $query->get();
    }

    public function store(Request $request)
    {
        return response()->json(ContratoModelo::create($this->validar($request)), 201);
    }

    public function update(Request $request, ContratoModelo $contratoModelo)
    {
        $contratoModelo->update($this->validar($request));

        return $contratoModelo->fresh();
    }

    public function destroy(ContratoModelo $contratoModelo)
    {
        $contratoModelo->delete();

        return response()->noContent();
    }

    private function validar(Request $request): array
    {
        return $request->validate([
            'tipo' => ['required', Rule::in(['empreita', 'obra'])],
            'nome' => 'required|string|max:150',
            'conteudo' => 'required|string',
            'ativo' => 'nullable|boolean',
            'margem_superior_mm' => 'nullable|integer|min:0|max:100',
            'margem_direita_mm' => 'nullable|integer|min:0|max:100',
            'margem_inferior_mm' => 'nullable|integer|min:0|max:100',
            'margem_esquerda_mm' => 'nullable|integer|min:0|max:100',
            'tamanho_papel' => ['nullable', Rule::in(['a4', 'carta', 'oficio'])],
            'orientacao' => ['nullable', Rule::in(['retrato', 'paisagem'])],
            'cabecalho_html' => 'nullable|string',
            'rodape_html' => 'nullable|string',
            'margem_cabecalho_mm' => 'nullable|integer|min:0|max:60',
            'margem_rodape_mm' => 'nullable|integer|min:0|max:60',
            // `timbrado_modo`/`timbrado_ajuste` continuam aceitos só por
            // compatibilidade com modelo salvo antes de 30/09/2026 — a
            // tela não manda mais nenhum dos dois (opção "faixa no topo"
            // saiu, "cobrir/conter/esticar" virou os 4 campos abaixo).
            'timbrado_modo' => ['nullable', Rule::in(['topo', 'fundo'])],
            'timbrado_ajuste' => ['nullable', Rule::in(['cobrir', 'conter', 'esticar'])],
            // 30/09/2026 — redesenho do papel timbrado (pedido do Lucas:
            // "centralizar a imagem... transparência... redimensionar
            // mantendo ou não a proporção").
            'timbrado_largura_pct' => 'nullable|integer|min:1|max:200',
            'timbrado_altura_pct' => 'nullable|integer|min:1|max:200',
            'timbrado_manter_proporcao' => 'nullable|boolean',
            'timbrado_opacidade' => 'nullable|integer|min:0|max:100',
            // 30/09/2026 — tag de anexo automático (geração em lote a partir
            // da lista de Empreitas). `Tag::find()` (não `exists:tags,id`
            // cru) de propósito: respeita o global scope `PertenceAEmpresa`,
            // então um id de tag de outra empresa reprova aqui mesmo que
            // exista na tabela.
            'tag_anexo_id' => [
                'nullable', 'string',
                function (string $atributo, $valor, \Closure $falha) {
                    if ($valor !== null && $valor !== '' && !Tag::find($valor)) {
                        $falha('A tag escolhida não foi encontrada.');
                    }
                },
            ],
        ]);
    }
}
