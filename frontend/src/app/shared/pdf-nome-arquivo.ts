/**
 * Nome de arquivo padrão pra todo PDF exportado (27/09/2026, pedido do
 * Lucas: "padronizar nome de arquivo de todos os PDFs exportados" — a
 * maioria baixava com o UUID interno no nome, ex.:
 * "mapa-c8f8e5c9-210a-407e-8119-601db0929fc2.pdf", sem nada legível). Um só
 * padrão: `Tipo-Identificador1-Identificador2....pdf`, com cada pedaço
 * "limpo" (sem acento, sem caractere que o sistema de arquivos rejeita,
 * espaço virando hífen) — mesma ideia que o RDO já fazia sozinho
 * ("RDO-003.pdf"), agora repetida em todo PDF do sistema.
 */
function limpar(parte: string): string {
  return parte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * `partes` são os identificadores, na ordem em que devem aparecer no nome —
 * uma parte vazia/nula é descartada (ex.: um mapa sem descrição ainda). Se
 * nada sobrar, cai no `idReserva` (o UUID), pra nunca gerar um nome vazio.
 */
export function nomeArquivoPdf(tipo: string, partes: Array<string | number | null | undefined>, idReserva: string): string {
  const limpas = partes
    .map((p) => (p === null || p === undefined ? '' : limpar(String(p))))
    .filter((p) => p.length > 0);

  const corpo = limpas.length ? limpas.join('-') : limpar(idReserva);

  return `${limpar(tipo)}-${corpo}.pdf`;
}
