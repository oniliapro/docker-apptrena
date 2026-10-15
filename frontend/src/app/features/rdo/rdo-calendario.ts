/**
 * Calendário mensal do RDO (F8, 22/09/2026) — puro, sem Angular.
 *
 * Extraído de `publico-rdo.ts` (o acompanhamento do contratante já tinha essa
 * grade, estilo Google Agenda, desde 15/09/2026) pra também virar a visão da
 * tela interna (`rdo.ts`), no lugar da lista solta de relatórios — mesma
 * grade, dois lugares.
 */

import { hojeNoFuso } from '../../core/utils/fuso';

/** Uma célula do calendário mensal — `item` é o tipo de registro de cada tela (RdoRegistro completo ou o resumo público). */
export interface DiaCalendario<T> {
  data: string;
  dia: number;
  doMes: boolean;
  hoje: boolean;
  registros: T[];
}

export function paraIso(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Primeiro dia do mês de uma data qualquer — usado pra normalizar `mesAtual`. */
export function inicioDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

export function mesComPasso(mesAtual: Date, passo: number): Date {
  return new Date(mesAtual.getFullYear(), mesAtual.getMonth() + passo, 1);
}

/**
 * Grade do mês de `mesReferencia`: começa no domingo da semana do dia 1 e vai
 * até completar a última semana (28 a 42 dias, sempre múltiplo de 7) — mesmo
 * formato que qualquer calendário mensal (Google Agenda incluso).
 *
 * `dataDoItem` extrai a data (YYYY-MM-DD ou com hora — só os 10 primeiros
 * caracteres contam) de cada item de `itens`, pra agrupar por dia.
 */
export function construirSemanas<T>(
  mesReferencia: Date,
  itens: readonly T[],
  dataDoItem: (item: T) => string,
  hojeIso: string = hojeNoFuso(),
): DiaCalendario<T>[][] {
  const ano = mesReferencia.getFullYear();
  const mes = mesReferencia.getMonth();

  const inicio = new Date(ano, mes, 1);
  inicio.setDate(inicio.getDate() - inicio.getDay());

  const fim = new Date(ano, mes + 1, 0);
  fim.setDate(fim.getDate() + (6 - fim.getDay()));

  const porData = new Map<string, T[]>();
  for (const item of itens) {
    const chave = dataDoItem(item).substring(0, 10);
    porData.set(chave, [...(porData.get(chave) ?? []), item]);
  }

  const semanas: DiaCalendario<T>[][] = [];
  let semana: DiaCalendario<T>[] = [];
  const cursor = new Date(inicio);

  while (cursor <= fim) {
    const iso = paraIso(cursor);
    semana.push({
      data: iso,
      dia: cursor.getDate(),
      doMes: cursor.getMonth() === mes,
      hoje: iso === hojeIso,
      registros: porData.get(iso) ?? [],
    });

    if (semana.length === 7) {
      semanas.push(semana);
      semana = [];
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return semanas;
}

/** Mês do item mais recente de uma lista (assumida ordenada do mais novo pro mais velho) — abrir o calendário nesse mês evita mostrar um mês vazio numa obra parada. */
export function mesDoMaisRecente<T>(itens: readonly T[], dataDoItem: (item: T) => string): Date | null {
  const primeiro = itens[0];
  if (!primeiro) return null;
  const iso = dataDoItem(primeiro).substring(0, 10);
  const d = new Date(`${iso}T12:00:00`);
  return inicioDoMes(d);
}
