import type { ConfigProposta } from '../../../shared/proposta-eap';

export type TipoContratoModelo = 'empreita' | 'obra' | 'proposta';
export type TamanhoPapelContrato = 'a4' | 'carta' | 'oficio';
export type OrientacaoContrato = 'retrato' | 'paisagem';

/**
 * Campos snake_case de propósito (igual a `Obra`/`Empreita` em
 * `core/models/api.models.ts`) — o backend devolve o modelo Eloquent como
 * está, sem mapear pra camelCase, então o front acompanha o mesmo nome de
 * coluna em vez de duplicar uma camada de tradução.
 */
export interface ContratoModelo {
  id: string;
  tipo: TipoContratoModelo;
  nome: string;
  conteudo: string;
  ativo: boolean;
  /**
   * Layout de página (29/09/2026). Margem esquerda/direita continua um
   * número escolhido; em cima/embaixo NÃO EXISTE MAIS como campo
   * independente desde 30/09/2026 — o corpo começa onde a caixa do
   * cabeçalho termina e acaba onde a do rodapé começa (calculado a
   * partir da altura real deles, ver `ContratoPdfController::gerar` e
   * `ContratoModeloEditor.alturaUtilPaginaPx`). O backend ainda TEM as
   * colunas `margem_superior_mm`/`margem_inferior_mm` (não removidas por
   * segurança), mas nada no front lê ou escreve mais nelas.
   */
  margem_direita_mm: number;
  margem_esquerda_mm: number;
  tamanho_papel: TamanhoPapelContrato;
  orientacao: OrientacaoContrato;
  /** HTML repetido em toda página do PDF (fora do corpo principal). */
  cabecalho_html: string | null;
  rodape_html: string | null;
  /** Distância da borda da folha até o texto do cabeçalho/rodapé (30/09/2026) — igual ao "Do topo"/"Do rodapé" do Word. Continua arrastável/editável; a altura de CONTEÚDO do cabeçalho/rodapé em si é medida, não escolhida. */
  margem_cabecalho_mm: number;
  margem_rodape_mm: number;
  /**
   * Papel timbrado (30/09/2026, redesenho — "tire a opção de papel
   * timbrado em faixa no topo, coloque a opção de centralizar... aplicar
   * transparência... redimensionar mantendo ou não a proporção"). Sempre
   * centralizado na folha agora — só existe o modo "fundo" (a opção de
   * faixa no topo saiu da tela). Largura em % da folha;
   * `timbrado_manter_proporcao` true → altura segue a largura mantendo a
   * proporção natural da imagem; false → `timbrado_altura_pct` vale por
   * si (pode esticar/achatar).
   */
  timbrado_largura_pct: number;
  timbrado_altura_pct: number | null;
  timbrado_manter_proporcao: boolean;
  timbrado_opacidade: number;
  /** Tag pra anexar automaticamente o PDF gerado em massa da lista de Empreitas (30/09/2026) — sem ela, esse modelo não pode ser usado na geração em lote. */
  tag_anexo_id: string | null;
  /** Só `tipo === 'proposta'` (14/10/2026): padrão da tabela da EAP — ver `shared/proposta-eap.ts`. */
  config_proposta: ConfigProposta | null;
  /**
   * Estilos PRÓPRIOS deste modelo (15/10/2026, pedido do Lucas: "editar um
   * estilo edita ele somente no contrato que foi editado"). `null` = modelo
   * antigo, ainda sem cópia — usa os estilos da empresa até ser salvo de novo.
   */
  estilos: ContratoEstilo[] | null;
}

/** Resposta de `ApiService.gerarContratosEmLote` (30/09/2026) — ver `ContratoPdfController::gerarEAnexarEmLote`. */
export interface ResultadoGeracaoEmLote {
  sucesso: { empreita_id: string; arquivo_id: string }[];
  falhas: { empreita_id: string; erro: string }[];
}

/**
 * Variáveis aceitas por tipo de modelo (28/09/2026, itens 8/9; ampliado
 * 29/09/2026 com os dados que Obra/Empresa já têm). Espelha
 * `ContratoModeloController::VARIAVEIS` no backend. Mostradas na tela de
 * cadastro como legenda e substituídas por `preencherModeloContrato`
 * (`shared/contrato-modelo-render.ts`) na hora de gerar o PDF.
 *
 * `cliente`/`empreiteiro` continuam só o NOME — telefone/documento/
 * endereço deles ficam pra quando os cadastros virarem tabela relacional
 * de verdade (decidido com o Lucas, fase separada).
 */
export const VARIAVEIS_CONTRATO_MODELO: Record<TipoContratoModelo, readonly string[]> = {
  empreita: [
    'empresa_nome', 'empresa_cnpj', 'empresa_endereco', 'empresa_telefone', 'empresa_email', 'empresa_inscricao_estadual',
    'obra_nome', 'numero_contrato', 'local_obra', 'periodo', 'prazo_meses', 'data_base',
    'responsavel_tecnico', 'crea', 'art',
    'cliente', 'empreiteiro', 'descricao_empreita', 'numero_empreita', 'valor', 'data',
    'servicos_previstos', 'servicos_adicionais', 'servicos_todos',
    'total_servicos_previstos', 'total_servicos_adicionais', 'total_servicos',
  ],
  obra: [
    'empresa_nome', 'empresa_cnpj', 'empresa_endereco', 'empresa_telefone', 'empresa_email', 'empresa_inscricao_estadual',
    'obra_nome', 'numero_contrato', 'local_obra', 'periodo', 'prazo_meses', 'data_base',
    'responsavel', 'responsavel_tecnico', 'crea', 'art',
    'cliente', 'data',
  ],
  proposta: [
    'empresa_nome', 'empresa_cnpj', 'empresa_endereco', 'empresa_telefone', 'empresa_email', 'empresa_inscricao_estadual',
    'obra_nome', 'numero_contrato', 'local_obra', 'periodo', 'prazo_meses', 'data_base',
    'responsavel', 'responsavel_tecnico', 'crea', 'art',
    'cliente', 'data', 'tabela_eap',
    'custo_material', 'bdi_material', 'bdi_pct_material', 'total_material',
    'custo_mao_de_obra', 'bdi_mao_de_obra', 'bdi_pct_mao_de_obra', 'total_mao_de_obra',
    'custo_equipamento', 'bdi_equipamento', 'bdi_pct_equipamento', 'total_equipamento',
    'custo_outros', 'bdi_outros', 'bdi_pct_outros', 'total_outros',
    'custo_administracao', 'bdi_administracao', 'bdi_pct_administracao', 'total_administracao',
    'custo_total', 'bdi_total', 'bdi_pct_total', 'total_geral',
  ],
};

/**
 * Pseudo-variáveis só do cabeçalho/rodapé (numeração de página) — ver
 * `ContratoModeloController::VARIAVEIS_PAGINA`. Resolvidas pelo Puppeteer
 * na hora de gerar o PDF, não pela tela de impressão.
 */
export const VARIAVEIS_PAGINA_CONTRATO_MODELO: readonly string[] = ['pagina', 'total_paginas'];

/**
 * Mesmas variáveis de `VARIAVEIS_CONTRATO_MODELO`, reorganizadas por
 * OBJETO (29/09/2026, pedido do Lucas depois de ver a lista solta de
 * `chave` crua: "coloque uma caixa de seleção com o objeto... ao
 * selecionar, aparece a lista das variáveis... com nome amigável...
 * como botões"). Usada só pela UI do editor — `VARIAVEIS_CONTRATO_MODELO`
 * continua sendo a lista "achatada" que o backend valida/documenta.
 */
export type ObjetoVariavelContrato = 'empresa' | 'obra' | 'cliente' | 'empreiteiro' | 'empreita' | 'proposta' | 'geral';

export interface VariavelContrato {
  chave: string;
  rotulo: string;
  /** Agrupa a variável num menu (`<optgroup>`) em vez de um botão solto — usado pelas variáveis da EAP na proposta, que são muitas. */
  grupo?: string;
  /**
   * Só existe no CORPO do documento (calculada pela tela de impressão no
   * navegador): o cabeçalho/rodapé do PDF é montado no servidor
   * (`ContratoPdfController`), que não tem esses valores — no cabeçalho/
   * rodapé a variável sairia escrita como `{{chave}}`. O editor não oferece
   * essas variáveis quando o foco está no cabeçalho/rodapé.
   */
  soCorpo?: boolean;
}

/** Totais/BDI por categoria da EAP (14/10/2026) — calculados por `variaveisPropostaEap` (`shared/proposta-eap.ts`). */
const VARIAVEIS_EAP_PROPOSTA: readonly VariavelContrato[] = [
  ...(
    [
      ['material', 'Material'],
      ['mao_de_obra', 'Mão de obra'],
      ['equipamento', 'Equipamento'],
      ['outros', 'Outros'],
      ['administracao', 'Administração'],
    ] as const
  ).flatMap(([sufixo, grupo]) => [
    { chave: `custo_${sufixo}`, rotulo: 'Custo direto', grupo, soCorpo: true },
    { chave: `bdi_${sufixo}`, rotulo: 'BDI (R$)', grupo, soCorpo: true },
    { chave: `bdi_pct_${sufixo}`, rotulo: 'BDI (%)', grupo, soCorpo: true },
    { chave: `total_${sufixo}`, rotulo: 'Total com BDI', grupo, soCorpo: true },
  ]),
  { chave: 'custo_total', rotulo: 'Custo direto total', grupo: 'Total da EAP', soCorpo: true },
  { chave: 'bdi_total', rotulo: 'BDI total (R$)', grupo: 'Total da EAP', soCorpo: true },
  { chave: 'bdi_pct_total', rotulo: 'BDI total (%)', grupo: 'Total da EAP', soCorpo: true },
  { chave: 'total_geral', rotulo: 'Total geral com BDI', grupo: 'Total da EAP', soCorpo: true },
];

export const ROTULOS_OBJETO_VARIAVEL: Record<ObjetoVariavelContrato, string> = {
  empresa: 'Empresa',
  obra: 'Obra',
  cliente: 'Cliente',
  empreiteiro: 'Empreiteiro',
  empreita: 'Empreita',
  proposta: 'Proposta',
  geral: 'Geral',
};

export const VARIAVEIS_POR_OBJETO: Record<ObjetoVariavelContrato, readonly VariavelContrato[]> = {
  empresa: [
    { chave: 'empresa_nome', rotulo: 'Nome' },
    { chave: 'empresa_cnpj', rotulo: 'CNPJ' },
    { chave: 'empresa_endereco', rotulo: 'Endereço' },
    { chave: 'empresa_telefone', rotulo: 'Telefone' },
    { chave: 'empresa_email', rotulo: 'E-mail' },
    { chave: 'empresa_inscricao_estadual', rotulo: 'Inscrição estadual' },
  ],
  obra: [
    { chave: 'obra_nome', rotulo: 'Nome' },
    { chave: 'numero_contrato', rotulo: 'Número do contrato' },
    { chave: 'local_obra', rotulo: 'Local' },
    { chave: 'periodo', rotulo: 'Período' },
    { chave: 'prazo_meses', rotulo: 'Prazo (meses)' },
    { chave: 'data_base', rotulo: 'Data base' },
    { chave: 'responsavel', rotulo: 'Responsável' },
    { chave: 'responsavel_tecnico', rotulo: 'Responsável técnico' },
    { chave: 'crea', rotulo: 'CREA' },
    { chave: 'art', rotulo: 'ART' },
  ],
  cliente: [{ chave: 'cliente', rotulo: 'Nome' }],
  empreiteiro: [{ chave: 'empreiteiro', rotulo: 'Nome' }],
  empreita: [
    { chave: 'numero_empreita', rotulo: 'Número' },
    { chave: 'descricao_empreita', rotulo: 'Descrição' },
    // Soma calculada no navegador (relatório de pagamentos) — ver `ContratoPdfController::variaveisComuns`.
    { chave: 'valor', rotulo: 'Valor do contrato', soCorpo: true },
    // 15/10/2026 — serviços da empreita filtrados por "adicional" da EAP. As
    // listas saem uma linha por serviço ("Serviço 1 | descrição | R$ valor",
    // "Aditivo 1 | …"); os totais são numéricos (entram em fórmula).
    { chave: 'servicos_previstos', rotulo: 'Lista — serviços previstos', soCorpo: true },
    { chave: 'servicos_adicionais', rotulo: 'Lista — serviços adicionais', soCorpo: true },
    { chave: 'servicos_todos', rotulo: 'Lista — todos os serviços', soCorpo: true },
    { chave: 'total_servicos_previstos', rotulo: 'Total dos previstos', soCorpo: true },
    { chave: 'total_servicos_adicionais', rotulo: 'Total dos adicionais', soCorpo: true },
    { chave: 'total_servicos', rotulo: 'Total de todos os serviços', soCorpo: true },
  ],
  /** `tabela_eap` é um BLOCO (a tabela da EAP inteira), não um texto — ver `shared/proposta-eap.ts`. */
  proposta: [{ chave: 'tabela_eap', rotulo: 'Tabela da EAP', soCorpo: true }, ...VARIAVEIS_EAP_PROPOSTA],
  geral: [{ chave: 'data', rotulo: 'Data de emissão' }],
};

/** Quais objetos aparecem pra cada tipo — `obra` não tem empreiteiro/empreita, o resto é comum aos dois. */
export const OBJETOS_POR_TIPO: Record<TipoContratoModelo, readonly ObjetoVariavelContrato[]> = {
  empreita: ['empresa', 'obra', 'cliente', 'empreiteiro', 'empreita', 'geral'],
  obra: ['empresa', 'obra', 'cliente', 'geral'],
  proposta: ['empresa', 'obra', 'cliente', 'proposta', 'geral'],
};

export const ROTULOS_TIPO_CONTRATO_MODELO: Record<TipoContratoModelo, string> = {
  empreita: 'Empreita',
  obra: 'Contrato de obra',
  proposta: 'Proposta',
};

export const ROTULOS_TAMANHO_PAPEL: Record<TamanhoPapelContrato, string> = {
  a4: 'A4',
  carta: 'Carta',
  oficio: 'Ofício',
};

/** Estilo de texto nomeado pelo usuário (29/09/2026) — único por empresa, reaproveitado em qualquer modelo. */
export type TagHtmlEstilo = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote';
export type AlinhamentoEstilo = 'esquerda' | 'centro' | 'direita' | 'justificado';
/** 30/09/2026, pedido do Lucas: "caixa alta, primeira maiúscula, cada palavra maiúscula, ou livre". */
export type CaixaTextoEstilo = 'nenhuma' | 'maiuscula' | 'primeira_maiuscula' | 'cada_palavra';
/** Formato da numeração de uma LISTA ORDENADA AVULSA (não confundir com o título numerado hierárquico, que é sempre decimal em cadeia). */
export type ListaFormatoEstilo = 'numero' | 'romano_minusculo' | 'romano_maiusculo' | 'letra_minuscula' | 'letra_maiuscula';

/**
 * 30/09/2026 — REARQUITETADO: o estilo passou a ser um VÍNCULO de verdade
 * (classe CSS gerada dinamicamente, ver `shared/contrato-estilo-css.ts`),
 * não mais uma cópia de valores aplicada como `style` inline no bloco
 * (pedido do Lucas: "se eu alterar o formato do título 1 o texto não
 * atualiza — isso é um comportamento indesejado"). Ganhou também dois
 * modos de numeração automática, mutuamente exclusivos:
 * - `eh_lista` (+ `lista_formato`): lista ordenada AVULSA, numeração
 *   própria independente de hierarquia de título.
 * - `nivel_titulo` (1 a 7): título numerado HIERÁRQUICO — entra na cadeia
 *   de contadores CSS aninhados (1, 1.1, 1.1.1…), sempre decimal; a
 *   numeração recalcula sozinha ao inserir/excluir/mover título, porque é
 *   100% contador CSS por ordem no documento (nada gravado em lugar
 *   nenhum além da própria ordem dos elementos).
 * `lista_prefixo`/`lista_sufixo` valem pros dois modos, sempre envolvendo
 * o número (ou a cadeia toda, no hierárquico).
 */
export interface ContratoEstilo {
  id: string;
  nome: string;
  tag_html: TagHtmlEstilo;
  fonte: string | null;
  tamanho_pt: number | null;
  cor: string | null;
  negrito: boolean;
  italico: boolean;
  sublinhado: boolean;
  alinhamento: AlinhamentoEstilo;
  caixa_texto: CaixaTextoEstilo;
  eh_lista: boolean;
  lista_formato: ListaFormatoEstilo;
  nivel_titulo: number | null;
  lista_prefixo: string | null;
  lista_sufixo: string | null;
  /** `true` pros estilos semeados automaticamente pra cada empresa (Normal/Título 1-7/Citação) — editáveis e excluíveis como qualquer outro. */
  padrao: boolean;
}

export const ROTULOS_TAG_ESTILO: Record<TagHtmlEstilo, string> = {
  p: 'Parágrafo',
  h1: 'Título 1',
  h2: 'Título 2',
  h3: 'Título 3',
  h4: 'Título 4',
  h5: 'Título 5',
  h6: 'Título 6',
  blockquote: 'Citação',
};

export const ROTULOS_ALINHAMENTO_ESTILO: Record<AlinhamentoEstilo, string> = {
  esquerda: 'Esquerda',
  centro: 'Centro',
  direita: 'Direita',
  justificado: 'Justificado',
};

export const ROTULOS_CAIXA_TEXTO: Record<CaixaTextoEstilo, string> = {
  nenhuma: 'Livre (como digitado)',
  maiuscula: 'TUDO EM MAIÚSCULAS',
  primeira_maiuscula: 'Primeira letra maiúscula',
  cada_palavra: 'Cada Palavra Maiúscula',
};

export const ROTULOS_LISTA_FORMATO: Record<ListaFormatoEstilo, string> = {
  numero: '1, 2, 3…',
  romano_minusculo: 'i, ii, iii…',
  romano_maiusculo: 'I, II, III…',
  letra_minuscula: 'a, b, c…',
  letra_maiuscula: 'A, B, C…',
};
