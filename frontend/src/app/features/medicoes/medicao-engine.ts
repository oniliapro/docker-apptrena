/**
 * Cálculo da Medição (23/08/2026, pedido do Lucas) — funções puras, sem
 * Angular, seguindo o mesmo padrão de `eap-engine.ts`/`empreita-engine.ts`.
 *
 * A ideia central: cada item-folha da EAP é medido diretamente (0-100%
 * por categoria de custo); um item-grupo é a **média ponderada pelo
 * orçado** dos descendentes-folha naquela categoria — a mesma lógica que
 * `somarDescendentesDoGrupo` já usa pra somar dinheiro, adaptada pra uma
 * média de percentuais em vez de uma soma de valores. Um grupo também
 * pode ser medido manualmente (`manual: true` na célula gravada) — nesse
 * caso ignora os filhos até a sobrescrita ser removida.
 */

import { ChaveTipo, ItemEap, PorTipo, TIPOS_CUSTO } from '../eap/eap.models';
import { ehDescendente } from '../eap/eap-engine';

export interface ValorGravado {
  valor: number;
  manual: boolean;
}

/**
 * Um item da EAP visto pela Medição: sua hierarquia (`isGroup`/`eap`, pra
 * achar descendentes), o orçado por categoria (peso da ponderação — do
 * próprio item se folha, soma dos descendentes se grupo) e o que já foi
 * gravado nesta medição pra ele (folha: sempre que digitado; grupo: só
 * quando sobrescrito à mão).
 */
export interface EntradaMedicao {
  eapItemId: string;
  isGroup: boolean;
  eap: string;
  orcadoPorTipo: PorTipo;
  valorGravado: Partial<Record<ChaveTipo, ValorGravado>>;
}

export function limitarPercentual(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(100, Math.max(0, valor));
}

/** Converte percentual (0-100) em R$, dado o orçado da categoria/item. */
export function pctParaValor(pct: number, orcado: number): number {
  return (pct / 100) * orcado;
}

/** Converte R$ de volta pra percentual (0-100), dado o orçado da categoria/item. */
export function valorParaPct(valor: number, orcado: number): number {
  return orcado > 0 ? (valor / orcado) * 100 : 0;
}

/**
 * Percentual efetivo de um item numa categoria: o que foi gravado
 * (sempre pra folha; só se `manual` pra grupo), senão — só pra grupo — a
 * média ponderada pelo orçado dos descendentes-folha. Recursão de um
 * nível só: `folhas` por definição não são grupo, então a chamada
 * recursiva sobre uma folha sempre cai direto no primeiro `if`.
 */
export function pctEfetivoPorTipo(
  item: EntradaMedicao,
  tipo: ChaveTipo,
  todos: EntradaMedicao[],
): number {
  const gravado = item.valorGravado[tipo];
  // Numa folha, qualquer valor gravado vale (é a própria medição direta
  // dela). Num grupo, só vale se `manual` — sem isso, uma linha deixada
  // no banco com `manual: false` (ex.: o usuário desligou a sobrescrita
  // sem apagar o valor) continuaria congelando o grupo em vez de voltar
  // a recalcular dos filhos.
  if (gravado && (!item.isGroup || gravado.manual)) return gravado.valor;
  if (!item.isGroup) return 0;

  const folhas = todos.filter((f) => !f.isGroup && ehDescendente(item.eap, f.eap));
  let somaPesos = 0;
  let somaPonderada = 0;
  for (const folha of folhas) {
    const peso = folha.orcadoPorTipo[tipo] ?? 0;
    somaPonderada += pctEfetivoPorTipo(folha, tipo, todos) * peso;
    somaPesos += peso;
  }
  return somaPesos > 0 ? somaPonderada / somaPesos : 0;
}

/**
 * "Medição total" de um item — média ponderada ENTRE categorias (não
 * entre itens), pelo orçado de cada categoria dentro do próprio item.
 * Coluna final da grade, com barra de preenchimento (mesmo padrão do
 * "Consumo" em Relatórios).
 */
export function pctTotalItem(item: EntradaMedicao, todos: EntradaMedicao[]): number {
  let somaPesos = 0;
  let somaPonderada = 0;
  for (const tipo of TIPOS_CUSTO) {
    const peso = item.orcadoPorTipo[tipo.chave] ?? 0;
    somaPonderada += pctEfetivoPorTipo(item, tipo.chave, todos) * peso;
    somaPesos += peso;
  }
  return somaPesos > 0 ? somaPonderada / somaPesos : 0;
}

/** Um valor novo nunca pode regredir abaixo do acumulado da medição aprovada anterior. */
export function regrediu(valorNovo: number, acumuladoAnterior: number): boolean {
  return valorNovo < acumuladoAnterior - 1e-9;
}

/**
 * Monta a lista de `EntradaMedicao` combinando a hierarquia/orçado da
 * EAP (`itensEap`, na mesma ordem/índice de `orcadoPorItem`) com o que já
 * foi gravado nesta medição (`valoresGravados`, por eapItemId). Função
 * pura de composição — quem chama já resolveu o orçado por item (ver
 * `MedicaoStore`, mesma lógica de `eap.ts::orcadoDoItemTipo`).
 */
export function montarEntradas(
  itensEap: ItemEap[],
  orcadoPorItem: PorTipo[],
  valoresGravados: Map<string, Partial<Record<ChaveTipo, ValorGravado>>>,
): EntradaMedicao[] {
  return itensEap.map((item, i) => ({
    eapItemId: item.id,
    isGroup: item.isGroup,
    eap: item.eap,
    orcadoPorTipo: orcadoPorItem[i] ?? ({} as PorTipo),
    valorGravado: valoresGravados.get(item.id) ?? {},
  }));
}
