import { formatarMoeda } from '../core/utils/formato';
import { CacheOrcado, ChaveTipo, TIPOS_CUSTO } from '../features/eap/eap.models';
import { VariavelNumerica } from './contrato-modelo-render';

/**
 * Tabela da EAP dentro de uma PROPOSTA (14/10/2026, pedido do Lucas): "um
 * espaço pra incluir a tabela da EAP aberta e definir quais informações
 * serão vistas (valor Unit. e/ou Total)... até qual nível da EAP será
 * visível... personalizar cores de fundo e de textos".
 *
 * A configuração mora em dois lugares com o MESMO formato: o padrão do
 * modelo (`ContratoModelo.config_proposta`, editado em Configurações →
 * Modelos de documentos) e o ajuste feito na hora de gerar (modal "Gerar
 * proposta" da página da EAP, que parte do padrão do modelo escolhido — as
 * cores ficam só no modelo).
 *
 * Segunda rodada (14/10/2026): uma coluna por categoria de custo — as
 * MESMAS marcadas na EAP — mais a coluna Total; com Unit. e Total ligados, os
 * dois valores aparecem empilhados na mesma célula (igual ao PDF da EAP).
 */

export const NIVEIS_EAP_PROPOSTA = [1, 2, 3, 4] as const;
export type NivelEapProposta = (typeof NIVEIS_EAP_PROPOSTA)[number];

export type ChaveCorProposta =
  | 'cabecalho_fundo' | 'cabecalho_texto'
  | 'nivel1_fundo' | 'nivel1_texto'
  | 'nivel2_fundo' | 'nivel2_texto'
  | 'nivel3_fundo' | 'nivel3_texto'
  | 'nivel4_fundo' | 'nivel4_texto'
  | 'item_fundo' | 'item_texto'
  | 'zebra_fundo';

export interface ConfigProposta {
  /** Desligado, `{{tabela_eap}}` some do documento (a proposta sai só com o texto do modelo). */
  incluir_tabela: boolean;
  mostrar_unitario: boolean;
  mostrar_total: boolean;
  /** Maior nível da EAP que aparece (1 = só os grupos principais … 4 = tudo). */
  nivel_maximo: NivelEapProposta;
  cores: Record<ChaveCorProposta, string>;
}

/** Padrão alinhado à identidade do PDF da EAP (navy de grupo nível 1, tons claros nos demais). */
export const CORES_PADRAO_PROPOSTA: Record<ChaveCorProposta, string> = {
  cabecalho_fundo: '#1b3a4b',
  cabecalho_texto: '#ffffff',
  nivel1_fundo: '#12262f',
  nivel1_texto: '#ffffff',
  nivel2_fundo: '#d1dfe3',
  nivel2_texto: '#12262f',
  nivel3_fundo: '#e8eff1',
  nivel3_texto: '#12262f',
  nivel4_fundo: '#f3f6f7',
  nivel4_texto: '#12262f',
  item_fundo: '#ffffff',
  item_texto: '#12262f',
  zebra_fundo: '#f6f8f8',
};

export const CONFIG_PADRAO_PROPOSTA: ConfigProposta = {
  incluir_tabela: true,
  mostrar_unitario: true,
  mostrar_total: true,
  nivel_maximo: 4,
  cores: CORES_PADRAO_PROPOSTA,
};

/** Agrupamento usado pela tela de cores (um par fundo/texto por linha). */
export const PARES_DE_COR_PROPOSTA: ReadonlyArray<{ rotulo: string; fundo: ChaveCorProposta; texto: ChaveCorProposta | null }> = [
  { rotulo: 'Cabeçalho e total geral', fundo: 'cabecalho_fundo', texto: 'cabecalho_texto' },
  { rotulo: 'Grupo — nível 1', fundo: 'nivel1_fundo', texto: 'nivel1_texto' },
  { rotulo: 'Grupo — nível 2', fundo: 'nivel2_fundo', texto: 'nivel2_texto' },
  { rotulo: 'Grupo — nível 3', fundo: 'nivel3_fundo', texto: 'nivel3_texto' },
  { rotulo: 'Grupo — nível 4', fundo: 'nivel4_fundo', texto: 'nivel4_texto' },
  { rotulo: 'Itens (serviços)', fundo: 'item_fundo', texto: 'item_texto' },
  { rotulo: 'Itens — linha alternada', fundo: 'zebra_fundo', texto: null },
];

const REGEX_COR = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

/** Aceita o que vier do backend (`null`, JSON antigo, campo faltando) e devolve sempre uma config completa e válida. */
export function normalizarConfigProposta(bruto: unknown): ConfigProposta {
  const origem = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const coresOrigem = (origem['cores'] && typeof origem['cores'] === 'object' ? origem['cores'] : {}) as Record<string, unknown>;

  const cores = { ...CORES_PADRAO_PROPOSTA };
  (Object.keys(cores) as ChaveCorProposta[]).forEach((chave) => {
    const valor = coresOrigem[chave];
    if (typeof valor === 'string' && REGEX_COR.test(valor)) cores[chave] = valor;
  });

  const nivel = Number(origem['nivel_maximo']);
  const booleano = (chave: string, padrao: boolean) => (typeof origem[chave] === 'boolean' ? (origem[chave] as boolean) : padrao);

  return {
    incluir_tabela: booleano('incluir_tabela', true),
    mostrar_unitario: booleano('mostrar_unitario', true),
    mostrar_total: booleano('mostrar_total', true),
    nivel_maximo: (NIVEIS_EAP_PROPOSTA as readonly number[]).includes(nivel) ? (nivel as NivelEapProposta) : 4,
    cores,
  };
}

/** Uma coluna de categoria da tabela (as categorias marcadas na EAP). */
export interface CategoriaProposta {
  chave: ChaveTipo;
  rotulo: string;
}

/** Uma linha já calculada da EAP (quem monta é a tela de impressão, que tem o `EapStore`). Valores sempre COM BDI. */
export interface LinhaPropostaEap {
  nivel: number;
  isGroup: boolean;
  eap: string;
  desc: string;
  qtde: number;
  unid: string;
  /** Preço unitário por categoria — não existe em grupo. */
  unitarioPorCategoria: Partial<Record<ChaveTipo, number>>;
  totalPorCategoria: Partial<Record<ChaveTipo, number>>;
  /** Preço unitário do item (todas as categorias) — 0 em grupo. */
  unitario: number;
  /** Total do item ou do grupo. */
  total: number;
}

export interface TotaisPropostaEap {
  porCategoria: Partial<Record<ChaveTipo, number>>;
  total: number;
}

function escaparHtml(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function moedaOuVazio(valor: number | undefined): string {
  return valor ? formatarMoeda(valor) : '';
}

function numeroOuVazio(valor: number): string {
  return valor ? valor.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '';
}

/**
 * HTML da tabela, com estilos INLINE — o corpo da proposta é injetado via
 * `[innerHTML]` e as cores são escolhidas pelo usuário, então nada de
 * classe CSS fixa: cada linha leva o próprio fundo/texto. As cores já
 * passaram por `normalizarConfigProposta` (só hex), por isso entram no
 * `style` sem escape adicional. É o MESMO HTML na prévia do editor
 * (`ContratoModeloEditor`, com dados de exemplo) e no PDF.
 */
export function montarTabelaPropostaEap(
  linhas: readonly LinhaPropostaEap[],
  configBruta: ConfigProposta,
  categorias: readonly CategoriaProposta[],
  totais?: TotaisPropostaEap,
): string {
  const config = normalizarConfigProposta(configBruta);
  const c = config.cores;
  const visiveis = linhas.filter((l) => (l.nivel || 1) <= config.nivel_maximo);
  if (!visiveis.length) {
    return '<p style="font-style:italic; color:#666;">Nenhum item lançado na EAP desta obra.</p>';
  }

  const comValores = config.mostrar_unitario || config.mostrar_total;
  const ambos = config.mostrar_unitario && config.mostrar_total;
  const colunasValor = comValores ? categorias.length + 1 : 0;
  // Muitas colunas de valor numa folha em pé: a fonte encolhe pra descrição não sumir.
  const fonte = colunasValor <= 3 ? 9 : colunasValor === 4 ? 8 : colunasValor === 5 ? 7.5 : 7;
  const fonteRotulo = Math.max(5.5, fonte - 2.5);

  const celula = 'padding:1mm 1.5mm; border:0.5pt solid #b9c7cc; vertical-align:top;';
  const direita = 'text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums;';
  // Fundo/texto/fonte do cabeçalho NA PRÓPRIA célula: o `th` global do app
  // (`_base.scss`: fundo azul-claro, texto cinza, fonte mono em caixa alta)
  // vale também na tela de impressão e passava por cima da cor que vinha só
  // do `<tr>` — a cor escolhida pro cabeçalho não aparecia.
  const th =
    `${celula} background:${c.cabecalho_fundo}; color:${c.cabecalho_texto}; font-family:inherit; font-size:inherit; ` +
    'font-weight:700; text-transform:none; letter-spacing:normal;';

  const linhaValor = (rotulo: string, valor: number | undefined) =>
    valor
      ? '<div style="display:flex; justify-content:flex-end; align-items:baseline; gap:1mm; white-space:nowrap;">' +
        `<span style="font-size:${fonteRotulo}pt; font-weight:400; opacity:0.75;">${rotulo}</span>` +
        `<span>${formatarMoeda(valor)}</span></div>`
      : '';

  /** Unit. e Total empilhados quando os dois estão ligados; senão só o valor pedido. Grupo não tem unitário. */
  const conteudoValor = (unitario: number | undefined, total: number | undefined, grupo: boolean) => {
    if (ambos) return (grupo ? '' : linhaValor('Unit.', unitario)) + linhaValor('Total', total);
    if (config.mostrar_unitario) return grupo ? '' : moedaOuVazio(unitario);
    return moedaOuVazio(total);
  };

  const subtitulo = ambos ? '' : config.mostrar_unitario ? 'unitário' : 'total';
  const thValor = (rotulo: string) =>
    `<th style="${th} ${direita} vertical-align:bottom;">${escaparHtml(rotulo)}` +
    (subtitulo ? `<div style="font-size:${fonteRotulo}pt; font-weight:400;">${subtitulo}</div>` : '') +
    '</th>';

  const cabecalho =
    `<tr style="background:${c.cabecalho_fundo}; color:${c.cabecalho_texto};">` +
    `<th style="${th} text-align:left; white-space:nowrap; vertical-align:bottom;">Item</th>` +
    `<th style="${th} text-align:left; white-space:normal; vertical-align:bottom;">Descrição</th>` +
    `<th style="${th} ${direita} vertical-align:bottom;">Qtde</th>` +
    `<th style="${th} text-align:center; white-space:nowrap; vertical-align:bottom;">Un.</th>` +
    (comValores ? categorias.map((cat) => thValor(cat.rotulo)).join('') + thValor(categorias.length ? 'Total' : 'Valor') : '') +
    '</tr>';

  let indiceItem = 0;
  const corpo = visiveis
    .map((linha) => {
      const nivel = Math.min(4, Math.max(1, linha.nivel || 1));
      let fundo: string;
      let texto: string;
      let negrito = '';

      if (linha.isGroup) {
        fundo = c[`nivel${nivel}_fundo` as ChaveCorProposta];
        texto = c[`nivel${nivel}_texto` as ChaveCorProposta];
        negrito = 'font-weight:700;';
      } else {
        fundo = indiceItem % 2 === 1 ? c.zebra_fundo : c.item_fundo;
        texto = c.item_texto;
        indiceItem += 1;
      }

      const valores = comValores
        ? categorias
            .map(
              (cat) =>
                `<td style="${celula} ${direita}">` +
                conteudoValor(linha.unitarioPorCategoria[cat.chave], linha.totalPorCategoria[cat.chave], linha.isGroup) +
                '</td>',
            )
            .join('') + `<td style="${celula} ${direita}">${conteudoValor(linha.unitario, linha.total, linha.isGroup)}</td>`
        : '';

      return (
        `<tr style="background:${fundo}; color:${texto}; ${negrito} break-inside:avoid; page-break-inside:avoid;">` +
        `<td style="${celula} white-space:nowrap;">${escaparHtml(linha.eap)}</td>` +
        `<td style="${celula} padding-left:${1.5 + (nivel - 1) * 3}mm;">${escaparHtml(linha.desc || '—')}</td>` +
        `<td style="${celula} ${direita}">${linha.isGroup ? '' : numeroOuVazio(linha.qtde)}</td>` +
        `<td style="${celula} text-align:center; white-space:nowrap;">${linha.isGroup ? '' : escaparHtml(linha.unid)}</td>` +
        valores +
        '</tr>'
      );
    })
    .join('');

  // Total geral no fim (só com "Total" ligado — com só o unitário, somar não faz sentido).
  let linhaTotal = '';
  if (config.mostrar_total) {
    const soma = totais ?? somarNivelUm(linhas, categorias);
    linhaTotal =
      `<tr style="background:${c.cabecalho_fundo}; color:${c.cabecalho_texto}; font-weight:700; break-inside:avoid; page-break-inside:avoid;">` +
      `<td colspan="4" style="${celula} text-align:right;">TOTAL GERAL</td>` +
      categorias.map((cat) => `<td style="${celula} ${direita}">${moedaOuVazio(soma.porCategoria[cat.chave])}</td>`).join('') +
      `<td style="${celula} ${direita}">${moedaOuVazio(soma.total)}</td>` +
      '</tr>';
  }

  return (
    `<table style="width:100%; border-collapse:collapse; font-size:${fonte}pt; line-height:1.3; table-layout:auto; margin:4mm 0;">` +
    `<thead style="display:table-header-group;">${cabecalho}</thead>` +
    `<tbody>${corpo}${linhaTotal}</tbody>` +
    '</table>'
  );
}

/** Sem totais prontos (prévia do editor): soma as linhas de nível 1 — os grupos já trazem os descendentes. */
function somarNivelUm(linhas: readonly LinhaPropostaEap[], categorias: readonly CategoriaProposta[]): TotaisPropostaEap {
  const topo = linhas.filter((l) => (l.nivel || 1) === 1);
  const porCategoria: Partial<Record<ChaveTipo, number>> = {};
  for (const cat of categorias) porCategoria[cat.chave] = topo.reduce((s, l) => s + (l.totalPorCategoria[cat.chave] ?? 0), 0);
  return { porCategoria, total: topo.reduce((s, l) => s + l.total, 0) };
}

// ---------------------------------------------------------------------------
// Variáveis da proposta (14/10/2026, pedido do Lucas: "totais por categoria
// da EAP e o total geral, além dos BDI's percentuais por categoria e os BDI's
// absolutos") — numéricas, então também entram em fórmula `{{=...}}`.
// ---------------------------------------------------------------------------

/** Pedaço do nome da variável de cada categoria (`custo_mao_de_obra`, `bdi_pct_material`…). */
export const SUFIXO_VARIAVEL_CATEGORIA: Record<ChaveTipo, string> = {
  material: 'material',
  maoDeObra: 'mao_de_obra',
  equipamento: 'equipamento',
  outros: 'outros',
  administracao: 'administracao',
};

type TotaisDaEap = Pick<CacheOrcado, 'totalsDirectByType' | 'totalsBdiByType' | 'totalsDirect' | 'totalsBdi' | 'totalsWithBdi'>;

/** BDI % = BDI ÷ custo direto (o efetivo — vale também quando cada item tem o seu). Fração: 0,25 = 25%. */
function fracao(parte: number, todo: number): number {
  return todo ? parte / todo : 0;
}

export function variaveisPropostaEap(totais: TotaisDaEap): Record<string, VariavelNumerica> {
  const variaveis: Record<string, VariavelNumerica> = {};
  for (const tipo of TIPOS_CUSTO) {
    const sufixo = SUFIXO_VARIAVEL_CATEGORIA[tipo.chave];
    const custo = totais.totalsDirectByType[tipo.chave] ?? 0;
    const bdi = totais.totalsBdiByType[tipo.chave] ?? 0;
    variaveis[`custo_${sufixo}`] = { numero: custo, formato: 'moeda' };
    variaveis[`bdi_${sufixo}`] = { numero: bdi, formato: 'moeda' };
    variaveis[`bdi_pct_${sufixo}`] = { numero: fracao(bdi, custo), formato: 'percentual' };
    variaveis[`total_${sufixo}`] = { numero: custo + bdi, formato: 'moeda' };
  }
  variaveis['custo_total'] = { numero: totais.totalsDirect, formato: 'moeda' };
  variaveis['bdi_total'] = { numero: totais.totalsBdi, formato: 'moeda' };
  variaveis['bdi_pct_total'] = { numero: fracao(totais.totalsBdi, totais.totalsDirect), formato: 'percentual' };
  variaveis['total_geral'] = { numero: totais.totalsWithBdi, formato: 'moeda' };
  return variaveis;
}

// ---------------------------------------------------------------------------
// Prévia no editor do modelo (14/10/2026, pedido do Lucas: "quero configurar
// as cores da tabela dentro do modelo") — a tabela aparece no lugar de
// `{{tabela_eap}}` com estes dados de EXEMPLO, já com as cores/níveis/
// colunas escolhidos, pra ver o resultado sem gerar o PDF.
// ---------------------------------------------------------------------------

export const CATEGORIAS_EXEMPLO_PROPOSTA: readonly CategoriaProposta[] = [
  { chave: 'material', rotulo: 'Material' },
  { chave: 'maoDeObra', rotulo: 'Mão de obra' },
];

const BDI_EXEMPLO = 0.25;

const ITENS_EXEMPLO: ReadonlyArray<{ nivel: number; eap: string; desc: string; qtde?: number; unid?: string; unit?: Partial<Record<ChaveTipo, number>> }> = [
  { nivel: 1, eap: '1', desc: 'SERVIÇOS PRELIMINARES' },
  { nivel: 2, eap: '1.1', desc: 'Locação da obra com gabarito de madeira', qtde: 120, unid: 'm²', unit: { material: 6.4, maoDeObra: 9.1 } },
  { nivel: 2, eap: '1.2', desc: 'Tapume em chapa compensada 6mm', qtde: 48, unid: 'm', unit: { material: 38.5, maoDeObra: 21.3 } },
  { nivel: 1, eap: '2', desc: 'FUNDAÇÕES' },
  { nivel: 2, eap: '2.1', desc: 'Sapatas' },
  { nivel: 3, eap: '2.1.1', desc: 'Escavação manual de vala', qtde: 18, unid: 'm³', unit: { maoDeObra: 62.8 } },
  { nivel: 3, eap: '2.1.2', desc: 'Concreto usinado fck 25 MPa, lançado e adensado', qtde: 6.5, unid: 'm³', unit: { material: 520, maoDeObra: 95.4 } },
];

export function linhasExemploPropostaEap(): LinhaPropostaEap[] {
  const linhas: LinhaPropostaEap[] = ITENS_EXEMPLO.map((item) => {
    const unitarioPorCategoria: Partial<Record<ChaveTipo, number>> = {};
    const totalPorCategoria: Partial<Record<ChaveTipo, number>> = {};
    for (const [chave, valor] of Object.entries(item.unit ?? {}) as Array<[ChaveTipo, number]>) {
      unitarioPorCategoria[chave] = valor * (1 + BDI_EXEMPLO);
      totalPorCategoria[chave] = valor * (1 + BDI_EXEMPLO) * (item.qtde ?? 0);
    }
    const unitario = Object.values(unitarioPorCategoria).reduce((s, v) => s + (v ?? 0), 0);
    return {
      nivel: item.nivel,
      isGroup: !item.unit,
      eap: item.eap,
      desc: item.desc,
      qtde: item.qtde ?? 0,
      unid: item.unid ?? '',
      unitarioPorCategoria,
      totalPorCategoria,
      unitario,
      total: unitario * (item.qtde ?? 0),
    };
  });

  // Grupo = soma dos descendentes (linhas seguintes de nível maior, até voltar pro nível dele).
  linhas.forEach((linha, i) => {
    if (!linha.isGroup) return;
    for (let j = i + 1; j < linhas.length && linhas[j].nivel > linha.nivel; j++) {
      if (linhas[j].isGroup) continue;
      linha.total += linhas[j].total;
      for (const [chave, valor] of Object.entries(linhas[j].totalPorCategoria) as Array<[ChaveTipo, number]>) {
        linha.totalPorCategoria[chave] = (linha.totalPorCategoria[chave] ?? 0) + valor;
      }
    }
  });
  return linhas;
}
