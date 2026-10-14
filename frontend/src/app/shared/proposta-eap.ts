import { formatarMoeda } from '../core/utils/formato';

/**
 * Tabela da EAP dentro de uma PROPOSTA (14/10/2026, pedido do Lucas): "um
 * espaço pra incluir a tabela da EAP aberta e definir quais informações
 * serão vistas (valor Unit. e/ou Total)... até qual nível da EAP será
 * visível... personalizar cores de fundo e de textos".
 *
 * A configuração mora em dois lugares com o MESMO formato: o padrão do
 * modelo (`ContratoModelo.config_proposta`, editado em Configurações →
 * Modelos de documentos) e o ajuste feito na hora de gerar (modal "Gerar
 * proposta" da página da EAP, que parte do padrão do modelo escolhido).
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
  { rotulo: 'Cabeçalho da tabela', fundo: 'cabecalho_fundo', texto: 'cabecalho_texto' },
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

/** Uma linha já calculada da EAP (quem monta é a tela de impressão, que tem o `EapStore`). */
export interface LinhaPropostaEap {
  nivel: number;
  isGroup: boolean;
  eap: string;
  desc: string;
  qtde: number;
  unid: string;
  /** Preço unitário (com BDI) — vazio pra grupo. */
  unitario: number;
  /** Total do item ou do grupo (com BDI). */
  total: number;
}

function escaparHtml(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function moedaOuVazio(valor: number): string {
  return valor ? formatarMoeda(valor) : '';
}

function numeroOuVazio(valor: number): string {
  return valor ? String(valor).replace('.', ',') : '';
}

/**
 * HTML da tabela, com estilos INLINE — o corpo da proposta é injetado via
 * `[innerHTML]` e as cores são escolhidas pelo usuário, então nada de
 * classe CSS fixa: cada linha leva o próprio fundo/texto. As cores já
 * passaram por `normalizarConfigProposta` (só hex), por isso entram no
 * `style` sem escape adicional.
 */
export function montarTabelaPropostaEap(linhas: readonly LinhaPropostaEap[], configBruta: ConfigProposta): string {
  const config = normalizarConfigProposta(configBruta);
  const c = config.cores;
  const visiveis = linhas.filter((l) => (l.nivel || 1) <= config.nivel_maximo);

  const celula = 'padding:3px 6px; border:0.5pt solid #b9c7cc;';
  const direita = 'text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums;';

  const cabecalho =
    `<tr style="background:${c.cabecalho_fundo}; color:${c.cabecalho_texto};">` +
    `<th style="${celula} text-align:left; width:11%;">Item</th>` +
    `<th style="${celula} text-align:left;">Descrição</th>` +
    `<th style="${celula} ${direita} width:8%;">Qtde</th>` +
    `<th style="${celula} text-align:center; width:7%;">Un.</th>` +
    (config.mostrar_unitario ? `<th style="${celula} ${direita} width:15%;">Valor unit.</th>` : '') +
    (config.mostrar_total ? `<th style="${celula} ${direita} width:15%;">Valor total</th>` : '') +
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

      const recuo = (nivel - 1) * 10;
      return (
        `<tr style="background:${fundo}; color:${texto}; ${negrito} break-inside:avoid;">` +
        `<td style="${celula} white-space:nowrap;">${escaparHtml(linha.eap)}</td>` +
        `<td style="${celula} padding-left:${6 + recuo}px;">${escaparHtml(linha.desc || '—')}</td>` +
        `<td style="${celula} ${direita}">${linha.isGroup ? '' : numeroOuVazio(linha.qtde)}</td>` +
        `<td style="${celula} text-align:center;">${linha.isGroup ? '' : escaparHtml(linha.unid)}</td>` +
        (config.mostrar_unitario
          ? `<td style="${celula} ${direita}">${linha.isGroup ? '' : moedaOuVazio(linha.unitario)}</td>`
          : '') +
        (config.mostrar_total ? `<td style="${celula} ${direita}">${moedaOuVazio(linha.total)}</td>` : '') +
        '</tr>'
      );
    })
    .join('');

  if (!visiveis.length) {
    return '<p style="font-style:italic; color:#666;">Nenhum item lançado na EAP desta obra.</p>';
  }

  return (
    '<table style="width:100%; border-collapse:collapse; font-size:9pt; table-layout:auto; margin:4mm 0;">' +
    `<thead style="display:table-header-group;">${cabecalho}</thead>` +
    `<tbody>${corpo}</tbody>` +
    '</table>'
  );
}
