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
            // 15/10/2026 — listas e totais dos serviços da empreita (previstos
            // x adicionais), calculados pela tela de impressão. Só no corpo.
            'servicos_previstos', 'servicos_adicionais', 'servicos_todos',
            'total_servicos_previstos', 'total_servicos_adicionais', 'total_servicos',
            // 15/10/2026 — dados do cliente e do empreiteiro (vêm dos cadastros,
            // casados pelo NOME) e a previsão de conclusão da empreita.
            'tipo_cliente', 'cpf_cnpj_cliente', 'endereco_cliente',
            'tipo_empreiteiro', 'cpf_cnpj_empreiteiro', 'endereco_empreiteiro',
            'previsao_conclusao',
        ],
        'obra' => [
            'empresa_nome', 'empresa_cnpj', 'empresa_endereco', 'empresa_telefone', 'empresa_email', 'empresa_inscricao_estadual',
            'obra_nome', 'numero_contrato', 'local_obra', 'periodo', 'prazo_meses', 'data_base',
            'responsavel', 'responsavel_tecnico', 'crea', 'art',
            'cliente', 'data',
            'tipo_cliente', 'cpf_cnpj_cliente', 'endereco_cliente',
        ],
        // 14/10/2026 — proposta gerada a partir da EAP. `tabela_eap` é um
        // BLOCO (a tabela inteira), não um texto: só vale no corpo do
        // documento, não em cabeçalho/rodapé. Os totais/BDI por categoria
        // (mesmo dia) são calculados pela tela de impressão a partir da EAP
        // — também só no corpo, e também aceitos em fórmula `{{=...}}`.
        'proposta' => [
            'empresa_nome', 'empresa_cnpj', 'empresa_endereco', 'empresa_telefone', 'empresa_email', 'empresa_inscricao_estadual',
            'obra_nome', 'numero_contrato', 'local_obra', 'periodo', 'prazo_meses', 'data_base',
            'responsavel', 'responsavel_tecnico', 'crea', 'art',
            'cliente', 'data', 'tabela_eap',
            'tipo_cliente', 'cpf_cnpj_cliente', 'endereco_cliente',
            'custo_material', 'bdi_material', 'bdi_pct_material', 'total_material',
            'custo_mao_de_obra', 'bdi_mao_de_obra', 'bdi_pct_mao_de_obra', 'total_mao_de_obra',
            'custo_equipamento', 'bdi_equipamento', 'bdi_pct_equipamento', 'total_equipamento',
            'custo_outros', 'bdi_outros', 'bdi_pct_outros', 'total_outros',
            'custo_administracao', 'bdi_administracao', 'bdi_pct_administracao', 'total_administracao',
            'custo_total', 'bdi_total', 'bdi_pct_total', 'total_geral',
        ],
    ];

    /** Padrão da tabela da EAP na proposta — `config_proposta` só aceita estas chaves. */
    public const CONFIG_PROPOSTA_CORES = [
        'cabecalho_fundo', 'cabecalho_texto',
        'nivel1_fundo', 'nivel1_texto', 'nivel2_fundo', 'nivel2_texto',
        'nivel3_fundo', 'nivel3_texto', 'nivel4_fundo', 'nivel4_texto',
        'item_fundo', 'item_texto', 'zebra_fundo',
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

    /** Regras de `config_proposta` — também usadas pelo ContratoPdfController (ajuste feito na hora de gerar). */
    public static function regrasConfigProposta(string $prefixo): array
    {
        $regras = [
            $prefixo => 'nullable|array',
            "{$prefixo}.incluir_tabela" => 'nullable|boolean',
            "{$prefixo}.mostrar_unitario" => 'nullable|boolean',
            "{$prefixo}.mostrar_total" => 'nullable|boolean',
            "{$prefixo}.nivel_maximo" => 'nullable|integer|min:1|max:4',
            "{$prefixo}.cores" => 'nullable|array',
        ];

        foreach (self::CONFIG_PROPOSTA_CORES as $chave) {
            // Só `#rgb`/`#rrggbb` — a cor entra num atributo `style` do HTML
            // da tabela, então nada além de hex passa (sem injeção de CSS).
            $regras["{$prefixo}.cores.{$chave}"] = ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/'];
        }

        return $regras;
    }

    private function validar(Request $request): array
    {
        return $request->validate([
            ...self::regrasConfigProposta('config_proposta'),
            // Estilos PRÓPRIOS do modelo (15/10/2026) — mesmas regras do
            // `ContratoEstiloController`, por item da lista. O `id` vira
            // parte de uma classe CSS (`estilo-<id>`), por isso só
            // letras/números/hífen.
            'estilos' => 'nullable|array|max:200',
            'estilos.*.id' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9-]+$/'],
            'estilos.*.nome' => 'required|string|max:60',
            'estilos.*.tag_html' => ['required', Rule::in(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'])],
            'estilos.*.fonte' => 'nullable|string|max:60',
            'estilos.*.tamanho_pt' => 'nullable|integer|min:1|max:200',
            'estilos.*.cor' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'estilos.*.negrito' => 'nullable|boolean',
            'estilos.*.italico' => 'nullable|boolean',
            'estilos.*.sublinhado' => 'nullable|boolean',
            'estilos.*.alinhamento' => ['required', Rule::in(['esquerda', 'centro', 'direita', 'justificado'])],
            'estilos.*.caixa_texto' => ['nullable', Rule::in(['nenhuma', 'maiuscula', 'primeira_maiuscula', 'cada_palavra'])],
            'estilos.*.eh_lista' => 'nullable|boolean',
            'estilos.*.lista_formato' => ['nullable', Rule::in(['numero', 'romano_minusculo', 'romano_maiusculo', 'letra_minuscula', 'letra_maiuscula'])],
            'estilos.*.nivel_titulo' => 'nullable|integer|min:1|max:7',
            'estilos.*.lista_prefixo' => 'nullable|string|max:40',
            'estilos.*.lista_sufixo' => 'nullable|string|max:10',
            'estilos.*.padrao' => 'nullable|boolean',
            'tipo' => ['required', Rule::in(['empreita', 'obra', 'proposta'])],
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
