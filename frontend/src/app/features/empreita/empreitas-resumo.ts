/**
 * Agrupamento do "Copiar resumo" da lista de Empreitas (26/10/2026, pedido do Lucas): empreitas de um
 * MESMO empreiteiro viram uma entrada só — nome e PIX uma vez, com o valor a pagar somado (ex.: duas
 * empreitas de 1.000 e 1.500 → uma linha de 2.500). Função pura, sem Angular, pra testar sozinha.
 *
 * `chaveEmpreiteiro` é o nome normalizado (ver `EmpreitasObra.chaveDoEmpreiteiro`); empreita sem nome de
 * empreiteiro chega com uma chave própria e nunca se junta a outra. A ordem é a da primeira empreita de
 * cada empreiteiro na lista recebida.
 */
export interface EntradaResumoPagamento {
  chaveEmpreiteiro: string;
  beneficiado: string;
  pix: string;
  somaAPagar: number;
}

export function agruparResumoPorEmpreiteiro<T extends EntradaResumoPagamento>(lista: readonly T[]): T[] {
  const porEmpreiteiro = new Map<string, T>();

  for (const dados of lista) {
    const atual = porEmpreiteiro.get(dados.chaveEmpreiteiro);
    if (!atual) {
      porEmpreiteiro.set(dados.chaveEmpreiteiro, { ...dados });
      continue;
    }
    // Soma em centavos: evita 1000.1 + 1500.2 virar 2500.2999999.
    atual.somaAPagar = Math.round((atual.somaAPagar + dados.somaAPagar) * 100) / 100;
    if (!atual.pix && dados.pix) atual.pix = dados.pix;
  }

  return [...porEmpreiteiro.values()];
}
