/**
 * Filtros por coluna nas telas de lista (19/08/2026, pedido do Lucas: "eu
 * quero algo como filtrar por obra, por descrição, por categoria, por
 * data" — não só a busca livre que já existia). Cada tela monta seus
 * próprios `<select>`/campos de data usando este helper pra listar as
 * opções realmente presentes nos dados carregados (não uma lista fixa
 * que poderia incluir opção sem nenhum registro, ou faltar uma opção
 * nova).
 */
export function valoresDistintos<T>(lista: readonly T[], valor: (item: T) => string): string[] {
  const vistos = new Set<string>();
  for (const item of lista) {
    const v = valor(item).trim();
    if (v) vistos.add(v);
  }
  return Array.from(vistos).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

/** Compara uma data (string "AAAA-MM-DD" ou ISO completo) contra um intervalo [de, até], inclusive. */
export function dataDentroDoIntervalo(data: string | null | undefined, de: string, ate: string): boolean {
  if (!de && !ate) return true;
  if (!data) return false;
  const valor = data.slice(0, 10);
  if (de && valor < de) return false;
  if (ate && valor > ate) return false;
  return true;
}
