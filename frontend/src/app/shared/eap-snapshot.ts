/**
 * Itens da EAP reduzidos ao que os popups de Pagamento/Recebimento precisam
 * (rótulo do seletor de etapa) — extraído de `PagamentosStore` e
 * `RecebimentosStore` (21/09/2026) para as listas gerais e os cards do painel
 * também abrirem o editor de um lançamento de OUTRA obra com as etapas dela.
 */
export interface ItemEapResumo {
  id: string;
  isGroup: boolean;
  eap: string;
  desc: string;
}

export function extrairItensEapResumo(lista: unknown): ItemEapResumo[] {
  if (!Array.isArray(lista)) return [];

  return lista
    .map((bruto) => {
      const item = bruto as Record<string, unknown>;
      return {
        id: String(item?.['id'] ?? ''),
        isGroup: Boolean(item?.['isGroup']),
        eap: String(item?.['eap'] ?? ''),
        desc: String(item?.['desc'] ?? ''),
      };
    })
    .filter((item) => item.id);
}
