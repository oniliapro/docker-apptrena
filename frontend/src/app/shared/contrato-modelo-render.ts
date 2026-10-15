import { formatarMoeda } from '../core/utils/formato';
import { avaliarFormula, extrairNomes } from './numero/formula';
import { valorPorExtenso } from './valor-por-extenso';

/**
 * Escapa um valor pra entrar com segurança dentro do HTML do modelo
 * (29/09/2026: o editor virou rico/visual — `conteudo` passou a ser HTML,
 * não mais texto puro — então um valor de variável com `&`, `<` etc.
 * (nome de obra, cliente...) precisa ser escapado pra não quebrar a marcação
 * nem virar injeção de HTML).
 */
function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Formato de uma variável NUMÉRICA (14/10/2026) — define como ela aparece no
 * texto e o formato do resultado de uma fórmula que use ela.
 * `percentual` guarda a FRAÇÃO (0,25 = 25%), igual planilha: `custo *
 * bdi_pct` já dá o valor do BDI.
 */
export type FormatoVariavel = 'moeda' | 'numero' | 'percentual';

/** Variável com valor numérico — além de aparecer formatada, pode entrar em fórmula `{{=...}}`. */
export interface VariavelNumerica {
  numero: number;
  formato: FormatoVariavel;
}

/** Texto pronto (o caso de sempre) ou número com formato. */
export type VariaveisModelo = Record<string, string | VariavelNumerica>;

export function formatarValorVariavel(numero: number, formato: FormatoVariavel): string {
  switch (formato) {
    case 'moeda':
      return formatarMoeda(numero);
    case 'percentual':
      return (numero * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    default:
      return numero.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
}

const ENTIDADES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * A fórmula chega do HTML do editor: espaço digitado vira `&nbsp;`, e um
 * pedaço formatado (negrito no meio) vira tag. Pro cálculo só interessa o
 * texto.
 */
function textoDaFormula(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, nome: string) => {
      if (nome[0] === '#') {
        const codigo = nome[1] === 'x' || nome[1] === 'X' ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
        return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteira;
      }
      return ENTIDADES[nome.toLowerCase()] ?? inteira;
    })
    .replace(/ /g, ' ')
    .trim();
}

/** Funções que só fazem sentido POR FORA da conta (o resultado delas é texto/formato, não número). */
const FUNCOES_DE_FORMATO = ['texto', 'moeda', 'numero', 'percentual'] as const;
type FuncaoDeFormato = (typeof FUNCOES_DE_FORMATO)[number];

function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** `MOEDA(a + b)` → `{ funcao: 'moeda', corpo: 'a + b' }`; `MOEDA(a) + MOEDA(b)` não é um envoltório só (os parênteses não fecham no fim). */
function separarFuncaoDeFormato(expr: string): { funcao: FuncaoDeFormato | null; corpo: string } {
  const m = /^([A-Za-zÀ-ÿ]+)\s*\(([\s\S]*)\)$/.exec(expr);
  if (!m) return { funcao: null, corpo: expr };
  const funcao = normalizarNome(m[1]) as FuncaoDeFormato;
  if (!FUNCOES_DE_FORMATO.includes(funcao)) return { funcao: null, corpo: expr };

  let profundidade = 0;
  for (const c of m[2]) {
    if (c === '(') profundidade++;
    if (c === ')' && --profundidade < 0) return { funcao: null, corpo: expr };
  }
  return profundidade === 0 ? { funcao, corpo: m[2] } : { funcao: null, corpo: expr };
}

export type ResultadoFormulaModelo = { ok: true; texto: string } | { ok: false; erro: string };

/**
 * Fórmula de modelo de documento (14/10/2026, pedido do Lucas): `{{=x+y}}`
 * com as variáveis numéricas. O cálculo em si é o MESMO parser das fórmulas
 * dos campos numéricos do sistema (`numero/formula.ts`: `+ - * / ^`,
 * parênteses, vírgula decimal, `10%`, `soma/media/min/max/arredondar` com
 * `;` entre os argumentos).
 *
 * Formato do resultado: se todas as variáveis da conta têm o mesmo formato
 * (ex.: as duas em moeda), o resultado sai nele; misturando formatos, sai
 * como número. `MOEDA()`, `NUMERO()` e `PERCENTUAL()` por fora forçam um
 * formato; `TEXTO()` escreve o valor em reais por extenso (só pra moeda).
 */
export function calcularFormulaModelo(expressaoHtml: string, variaveis: VariaveisModelo): ResultadoFormulaModelo {
  const { funcao, corpo } = separarFuncaoDeFormato(textoDaFormula(expressaoHtml));

  // Nome de variável sem diferenciar maiúscula — `Total_Geral` acha `total_geral`.
  const porNome = new Map<string, string | VariavelNumerica>();
  for (const [chave, valor] of Object.entries(variaveis)) porNome.set(chave.toLowerCase(), valor);

  const formatos = new Set<FormatoVariavel>();
  for (const nome of extrairNomes(corpo)) {
    const valor = porNome.get(nome.toLowerCase());
    if (valor === undefined) return { ok: false, erro: `variável desconhecida "${nome}"` };
    if (typeof valor === 'string') return { ok: false, erro: `"${nome}" não é um número` };
    formatos.add(valor.formato);
  }

  const resultado = avaliarFormula(corpo, undefined, (nome) => {
    const valor = porNome.get(nome.toLowerCase());
    return valor !== undefined && typeof valor !== 'string' ? valor.numero : Number.NaN;
  });
  if (!resultado.ok) return { ok: false, erro: resultado.erro ?? 'fórmula inválida' };

  switch (funcao) {
    case 'texto':
      if (formatos.size && !formatos.has('moeda')) {
        return { ok: false, erro: 'TEXTO() só funciona com valores em moeda' };
      }
      return { ok: true, texto: valorPorExtenso(resultado.valor) };
    case 'moeda':
    case 'numero':
    case 'percentual':
      return { ok: true, texto: formatarValorVariavel(resultado.valor, funcao) };
    default:
      return { ok: true, texto: formatarValorVariavel(resultado.valor, formatos.size === 1 ? [...formatos][0] : 'numero') };
  }
}

/**
 * Substitui variáveis `{{chave}}` e fórmulas `{{=...}}` no HTML de um modelo
 * de contrato (28/09/2026, itens 8/9; fórmulas em 14/10/2026) pelos valores
 * já calculados de uma empreita/obra específica. Puro — sem chamada de API.
 * `ContratoImprimir` injeta o resultado como HTML confiável (`[innerHTML]`),
 * então cada valor é escapado aqui antes de entrar no texto.
 *
 * Uma chave sem valor correspondente em `variaveis` é deixada como está
 * (`{{chave}}` visível no resultado) — mais fácil de notar um nome de
 * variável errado no modelo do que sumir a informação silenciosamente. Pelo
 * mesmo motivo, fórmula com erro aparece em vermelho no lugar do valor.
 */
export function preencherModeloContrato(conteudo: string, variaveis: VariaveisModelo): string {
  return conteudo
    .replace(/\{\{\s*=([\s\S]*?)\}\}/g, (_inteira, expressao: string) => {
      const resultado = calcularFormulaModelo(expressao, variaveis);
      return resultado.ok
        ? escaparHtml(resultado.texto)
        : `<span style="color:#b00020; font-weight:700;">[fórmula com erro: ${escaparHtml(resultado.erro)}]</span>`;
    })
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (correspondencia, chave: string) => {
      if (!Object.prototype.hasOwnProperty.call(variaveis, chave)) return correspondencia;
      const valor = variaveis[chave];
      return escaparHtml(typeof valor === 'string' ? valor : formatarValorVariavel(valor.numero, valor.formato));
    });
}
