/**
 * Leitura dos nomes de fornecedores cadastrados, pra alimentar campos com
 * busca (`shared/autocomplete`) — extraído de `MapaStore` (19/09/2026) pra
 * ser reaproveitado pelo campo Fornecedor do Pagamento. O cadastro vive na
 * ponte chave-valor (`ArmazenamentoService`, `/api/storage`), então a leitura
 * devolve o JSON cru da lista inteira.
 */
export const CHAVE_FORNECEDORES = 'controleObra.fornecedores.v1';

/** Nomes dos fornecedores ATIVOS, sem repetição e em ordem alfabética. */
export function extrairNomesFornecedoresAtivos(bruto: string | null): string[] {
  if (!bruto) return [];
  try {
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];

    const nomes = lista
      .filter((f: Record<string, unknown>) => f?.['ativo'] !== false)
      .map((f: Record<string, unknown>) => String(f?.['nome'] ?? '').trim())
      .filter((nome) => nome.length > 0);

    return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  } catch {
    return [];
  }
}
