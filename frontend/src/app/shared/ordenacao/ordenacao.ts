/**
 * Ordenação de tabela por clique no cabeçalho — reutilizada em todas as
 * páginas de lista (Obras, Mapas, Empreitas, Cadastros, Pagamentos,
 * Diário…) e no popup de pagamentos vinculados da EAP (18/08/2026, pedido
 * do Lucas). Não usada nas telas de edição de um registro só (EAP,
 * Cronograma, Mapa, Empreita, Cronograma de desembolso) — lá a ordem das
 * linhas é hierárquica/faz parte do dado, não é uma lista solta.
 */

export type DirecaoOrdenacao = 'asc' | 'desc';

export interface EstadoOrdenacao<C extends string> {
  coluna: C;
  direcao: DirecaoOrdenacao;
}

/**
 * Clicar na coluna já ativa inverte a direção; clicar numa coluna
 * diferente troca pra ela, sempre começando crescente.
 */
export function alternarOrdenacao<C extends string>(
  atual: EstadoOrdenacao<C> | null,
  coluna: C,
): EstadoOrdenacao<C> {
  if (atual?.coluna === coluna) {
    return { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' };
  }
  return { coluna, direcao: 'asc' };
}

/** Compara dois valores genéricos (texto, número ou data em string ISO) respeitando a direção. */
export function compararValores(a: unknown, b: unknown, direcao: DirecaoOrdenacao): number {
  const mult = direcao === 'asc' ? 1 : -1;
  const vazioA = a === null || a === undefined || a === '';
  const vazioB = b === null || b === undefined || b === '';
  if (vazioA && vazioB) return 0;
  if (vazioA) return 1; // vazios sempre no fim, nas duas direções
  if (vazioB) return -1;

  if (typeof a === 'number' && typeof b === 'number') return (a - b) * mult;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (Number(a) - Number(b)) * mult;

  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }) * mult;
}

/** Ordena uma cópia da lista (nunca muta a original) segundo o estado atual. */
export function ordenarPor<T, C extends string>(
  lista: readonly T[],
  estado: EstadoOrdenacao<C> | null,
  valorDaColuna: (item: T, coluna: C) => unknown,
): T[] {
  if (!estado) return [...lista];
  return [...lista].sort((a, b) =>
    compararValores(valorDaColuna(a, estado.coluna), valorDaColuna(b, estado.coluna), estado.direcao),
  );
}

/** Indicador visual (▲/▼) pro cabeçalho da coluna ativa — '' quando não é a coluna ordenada. */
export function setaOrdenacao<C extends string>(
  estado: EstadoOrdenacao<C> | null,
  coluna: C,
): string {
  if (estado?.coluna !== coluna) return '';
  return estado.direcao === 'asc' ? ' ▲' : ' ▼';
}
