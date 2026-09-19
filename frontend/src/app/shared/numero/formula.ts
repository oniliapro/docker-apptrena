/**
 * Fórmulas estilo Excel (19/09/2026, pedido dos usuários): em campo
 * numérico, digitar "=" seguido de uma conta. Este arquivo é só o cálculo
 * puro (sem Angular, sem tela) — parser próprio, SEM `eval`.
 *
 * Sintaxe (formato brasileiro):
 *  - números com vírgula decimal: `0,1`; ponto de milhar aceito quando o
 *    agrupamento é regular (`1.234,56`, `1.400`); `2.5` vale 2,5;
 *  - operadores `+  -  *  /  ^`, parênteses, `%` depois do número (`10%` = 0,1);
 *  - funções (sem diferenciar maiúscula/acento; argumentos separados por
 *    `;`, porque a vírgula é o decimal): `soma`, `media`, `min`, `max`,
 *    `arredondar(valor; casas)`;
 *  - referências entre aspas, ex.: `"1.4-qtd"` — quem resolve o texto em
 *    número é o `resolver` injetado (a EAP faz isso na F5); sem resolver, a
 *    referência é erro.
 *
 * Precedência: parênteses > `%` > `^` > menos/mais unário > `* /` > `+ -`
 * (como na matemática: `-2^2` = -4; expoente pode ser negativo: `2^-1`).
 */

export type ResolvedorReferencia = (referencia: string) => number;

export interface ResultadoFormula {
  ok: boolean;
  valor: number;
  erro: string | null;
}

/** Erro "esperado" de fórmula — a mensagem já é para o usuário. */
export class ErroFormula extends Error {}

type Token =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'texto'; valor: string }
  | { tipo: 'nome'; valor: string }
  | { tipo: 'simbolo'; valor: string };

const SIMBOLOS = new Set(['+', '-', '*', '/', '^', '%', '(', ')', ';']);

/** Interpreta um literal numérico brasileiro (`1.234,56`, `0,1`, `2.5`, `1.400`). */
function lerLiteral(texto: string): number {
  let limpo = texto;
  if (limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.');
  } else if (limpo.includes('.')) {
    // "1.400" / "1.234.567" = milhar; "2.5" / "0.25" = decimal.
    limpo = /^\d{1,3}(\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, '') : limpo;
  }
  const numero = Number(limpo);
  if (!Number.isFinite(numero)) throw new ErroFormula(`Número inválido: "${texto}".`);
  return numero;
}

function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function tokenizar(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const c = expr[i];

    if (/\s/.test(c)) {
      i++;
    } else if (c === '"') {
      const fim = expr.indexOf('"', i + 1);
      if (fim < 0) throw new ErroFormula('Aspas sem fechar na referência.');
      tokens.push({ tipo: 'texto', valor: expr.slice(i + 1, fim) });
      i = fim + 1;
    } else if (/[0-9]/.test(c) || (c === ',' && /[0-9]/.test(expr[i + 1] ?? ''))) {
      const m = /^(?:\d[\d.]*(?:,\d+)?|,\d+)/.exec(expr.slice(i));
      const literal = m![0];
      // "1.4" seguido de letra não é número (evita "1.4qtd" virar 1,4 + lixo)
      tokens.push({ tipo: 'numero', valor: lerLiteral(literal) });
      i += literal.length;
    } else if (/[A-Za-zÀ-ÿ_]/.test(c)) {
      const m = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ_0-9.]*/.exec(expr.slice(i));
      tokens.push({ tipo: 'nome', valor: m![0] });
      i += m![0].length;
    } else if (SIMBOLOS.has(c)) {
      tokens.push({ tipo: 'simbolo', valor: c });
      i++;
    } else {
      throw new ErroFormula(`Caractere não reconhecido: "${c}".`);
    }
  }
  return tokens;
}

/** Referências (`"1.4-qtd"`) citadas na fórmula — usado para montar a ordem de cálculo entre células. */
export function extrairReferencias(expr: string): string[] {
  try {
    return tokenizar(expr.startsWith('=') ? expr.slice(1) : expr)
      .filter((t): t is { tipo: 'texto'; valor: string } => t.tipo === 'texto')
      .map((t) => t.valor);
  } catch {
    return [];
  }
}

class Avaliador {
  private posicao = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly resolver?: ResolvedorReferencia,
  ) {}

  avaliar(): number {
    if (!this.tokens.length) throw new ErroFormula('Fórmula vazia.');
    const valor = this.expressao();
    if (this.posicao < this.tokens.length) {
      throw new ErroFormula(`Trecho inesperado: "${this.descrever(this.tokens[this.posicao])}".`);
    }
    return valor;
  }

  private descrever(token: Token): string {
    return token.tipo === 'texto' ? `"${token.valor}"` : String(token.valor);
  }

  private espiar(): Token | undefined {
    return this.tokens[this.posicao];
  }

  private ehSimbolo(simbolo: string): boolean {
    const t = this.espiar();
    return t?.tipo === 'simbolo' && t.valor === simbolo;
  }

  private consumirSimbolo(simbolo: string): void {
    if (!this.ehSimbolo(simbolo)) throw new ErroFormula(`Esperado "${simbolo}".`);
    this.posicao++;
  }

  // expressao := termo (('+' | '-') termo)*
  private expressao(): number {
    let valor = this.termo();
    while (this.ehSimbolo('+') || this.ehSimbolo('-')) {
      const soma = this.ehSimbolo('+');
      this.posicao++;
      const direita = this.termo();
      valor = soma ? valor + direita : valor - direita;
    }
    return valor;
  }

  // termo := unario (('*' | '/') unario)*
  private termo(): number {
    let valor = this.unario();
    while (this.ehSimbolo('*') || this.ehSimbolo('/')) {
      const multiplica = this.ehSimbolo('*');
      this.posicao++;
      const direita = this.unario();
      if (!multiplica && direita === 0) throw new ErroFormula('Divisão por zero.');
      valor = multiplica ? valor * direita : valor / direita;
    }
    return valor;
  }

  // unario := ('-' | '+') unario | potencia
  private unario(): number {
    if (this.ehSimbolo('-')) {
      this.posicao++;
      return -this.unario();
    }
    if (this.ehSimbolo('+')) {
      this.posicao++;
      return this.unario();
    }
    return this.potencia();
  }

  // potencia := porcento ('^' unario)?   (associativa à direita; expoente pode ter sinal)
  private potencia(): number {
    const base = this.porcento();
    if (this.ehSimbolo('^')) {
      this.posicao++;
      return Math.pow(base, this.unario());
    }
    return base;
  }

  // porcento := primario ('%')*
  private porcento(): number {
    let valor = this.primario();
    while (this.ehSimbolo('%')) {
      this.posicao++;
      valor /= 100;
    }
    return valor;
  }

  private primario(): number {
    const token = this.espiar();
    if (!token) throw new ErroFormula('Fórmula incompleta.');

    if (token.tipo === 'numero') {
      this.posicao++;
      return token.valor;
    }

    if (token.tipo === 'texto') {
      this.posicao++;
      if (!this.resolver) throw new ErroFormula('Referências a outros campos não são permitidas aqui.');
      const valor = this.resolver(token.valor);
      if (!Number.isFinite(valor)) throw new ErroFormula(`Referência sem valor: "${token.valor}".`);
      return valor;
    }

    if (token.tipo === 'nome') {
      this.posicao++;
      return this.chamarFuncao(token.valor);
    }

    if (token.valor === '(') {
      this.posicao++;
      const valor = this.expressao();
      this.consumirSimbolo(')');
      return valor;
    }

    throw new ErroFormula(`Trecho inesperado: "${token.valor}".`);
  }

  private chamarFuncao(nomeOriginal: string): number {
    const nome = normalizarNome(nomeOriginal);
    if (!['soma', 'media', 'min', 'max', 'arredondar'].includes(nome)) {
      throw new ErroFormula(`Função desconhecida: "${nomeOriginal}".`);
    }

    this.consumirSimbolo('(');
    const argumentos: number[] = [];
    if (!this.ehSimbolo(')')) {
      argumentos.push(this.expressao());
      while (this.ehSimbolo(';')) {
        this.posicao++;
        argumentos.push(this.expressao());
      }
    }
    this.consumirSimbolo(')');

    if (nome === 'arredondar') {
      if (argumentos.length < 1 || argumentos.length > 2) {
        throw new ErroFormula('arredondar(valor; casas) precisa de 1 ou 2 argumentos.');
      }
      const casas = Math.trunc(argumentos[1] ?? 0);
      const fator = Math.pow(10, casas);
      // "meio pra cima" como no Excel (arredonda o meio para longe do zero)
      return (Math.sign(argumentos[0]) * Math.round(Math.abs(argumentos[0]) * fator + 1e-9)) / fator;
    }

    if (!argumentos.length) throw new ErroFormula(`${nome}() precisa de pelo menos 1 valor.`);
    switch (nome) {
      case 'soma':
        return argumentos.reduce((s, v) => s + v, 0);
      case 'media':
        return argumentos.reduce((s, v) => s + v, 0) / argumentos.length;
      case 'min':
        return Math.min(...argumentos);
      default:
        return Math.max(...argumentos);
    }
  }
}

/** Calcula a fórmula (com ou sem o "=" na frente). Nunca lança — o erro vem no resultado. */
export function avaliarFormula(expr: string, resolver?: ResolvedorReferencia): ResultadoFormula {
  try {
    const corpo = expr.trim().replace(/^=/, '');
    const valor = new Avaliador(tokenizar(corpo), resolver).avaliar();
    if (!Number.isFinite(valor)) return { ok: false, valor: 0, erro: 'Resultado inválido.' };
    return { ok: true, valor, erro: null };
  } catch (erro) {
    if (erro instanceof ErroFormula) return { ok: false, valor: 0, erro: erro.message };
    throw erro;
  }
}
