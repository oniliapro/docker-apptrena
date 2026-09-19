import { ResolvedorReferencia, avaliarFormula } from './formula';

export interface EntradaNumerica {
  /** Número resultante; `null` quando a fórmula tem erro (o chamador decide se mantém o valor anterior). */
  valor: number | null;
  /** Texto da fórmula (com o "=") quando o usuário digitou uma; `null` para número comum. */
  formula: string | null;
  /** Mensagem de erro da fórmula, se houve. */
  erro: string | null;
}

/**
 * Lê número no formato brasileiro, tolerando "R$", "%", espaços, separador
 * de milhar e vírgula decimal. Ex.: "R$ 1.234,56" -> 1234.56. Mesmo
 * comportamento do `parsearBR` que cada tela já usava (em
 * `pagamentos-calc.ts` e `recebimentos-calc.ts`) — número comum, sem "=",
 * continua sendo lido exatamente como antes.
 */
export function parsearNumeroBR(entrada: unknown): number {
  const limpo = String(entrada ?? '')
    .replace(/[R$\s%]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return Number(limpo) || 0;
}

/**
 * Ponto único de leitura de um campo numérico (19/09/2026): se o texto
 * começa com "=", é fórmula — calcula (ver `formula.ts`) e devolve também o
 * texto da fórmula, pra tela poder guardá-lo e mostrá-lo de novo ao focar
 * o campo. Senão, é um número comum.
 *
 * `resolver` é opcional: só a EAP passa um (referências a outros campos,
 * F5). Nos demais campos, "=2*3" funciona, "="1.4-qtd"" dá erro.
 */
export function avaliarEntrada(texto: unknown, resolver?: ResolvedorReferencia): EntradaNumerica {
  const bruto = String(texto ?? '').trim();

  if (!bruto.startsWith('=')) {
    return { valor: parsearNumeroBR(bruto), formula: null, erro: null };
  }

  const resultado = avaliarFormula(bruto, resolver);
  return resultado.ok
    ? { valor: resultado.valor, formula: bruto, erro: null }
    : { valor: null, formula: bruto, erro: resultado.erro };
}
