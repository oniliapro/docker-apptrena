/**
 * Engine do Mapa de Fornecedores — portado de js/mapa/03-engine.js.
 *
 * ------------------------------------------------------------------
 * Como o imposto funciona — a parte que engana
 * ------------------------------------------------------------------
 * Há duas contas diferentes acontecendo, e confundi-las gera números
 * plausíveis mas errados:
 *
 *  1. **Na linha do item**, o total exibido é `quantidade × preço ×
 *     (1 + imposto)`. É o imposto daquele item isolado, usado só para
 *     comparar propostas e eleger o vencedor.
 *
 *  2. **Na nota do fornecedor**, o imposto incide sobre
 *     `itens + frete da loja − desconto`. Ou seja: o frete cobrado pela
 *     loja também é tributado, e o desconto reduz a base de imposto.
 *     Por isso a soma das linhas não fecha com o total da nota.
 *
 * E há uma exceção que não pode ser esquecida: o **frete particular**
 * (pago por fora, transporte próprio) não entra na nota e portanto
 * **não sofre imposto**. Ele se soma ao final, já líquido.
 * ------------------------------------------------------------------
 *
 * Todas as funções recebem o estado por parâmetro, sem globais — foi
 * assim que deu para testá-las contra o original.
 */

import { obterRateiosDoItem } from './mapa-resumos';
import { Alocacao, Fornecedor, Fracionado, ItemMapa, NotaFornecedor, TotaisNotas, Vencedor } from './mapa.models';

/** Alíquota do fornecedor como fração (18 → 0,18). */
export function obterTaxaImposto(fornecedores: Fornecedor[], si: number): number {
  return (Number(fornecedores?.[si]?.imposto) || 0) / 100;
}

/**
 * Nome do fornecedor pra exibir em relatórios e pagamentos gerados —
 * desambiguado pelo contato quando o mesmo nome aparece mais de uma vez
 * na cotação (pedido do Lucas, 17/08/2026: duas linhas "AC Coelho" com
 * vendedores diferentes ficavam indistinguíveis nos relatórios). Só
 * fornecedores com o nome repetido ganham o "(contato)" — um nome único
 * continua aparecendo sozinho, sem parênteses.
 */
export function rotuloFornecedor(fornecedores: Fornecedor[], indice: number): string {
  const fornecedor = fornecedores[indice];
  if (!fornecedor) return `Fornecedor ${indice + 1}`;

  const nome = fornecedor.nome || `Fornecedor ${indice + 1}`;
  const repetido = fornecedores.filter((f) => f.nome === fornecedor.nome).length > 1;
  return repetido && fornecedor.contato ? `${nome} (${fornecedor.contato})` : nome;
}

/** Quantidade × preço unitário, sem imposto. */
export function calcularBaseItem(item: ItemMapa, si: number): number {
  return (Number(item.qtde) || 0) * (Number(item.unit?.[si]) || 0);
}

/** Total da linha, com o imposto do item — o número que compara propostas. */
export function calcularTotalItem(
  item: ItemMapa,
  si: number,
  fornecedores: Fornecedor[],
): number {
  return calcularBaseItem(item, si) * (1 + obterTaxaImposto(fornecedores, si));
}

export function calcularImpostoItem(
  item: ItemMapa,
  si: number,
  fornecedores: Fornecedor[],
): number {
  return calcularTotalItem(item, si, fornecedores) - calcularBaseItem(item, si);
}

/**
 * Fornecedor mais barato para um item, entre os ativos que o cotaram.
 * Preço zero conta como "não cotou" — é o que distingue ausência de
 * proposta de uma proposta gratuita.
 */
export function obterVencedorAutomatico(
  item: ItemMapa,
  fornecedores: Fornecedor[],
): Vencedor | null {
  let vencedor: Vencedor | null = null;

  fornecedores.forEach((fornecedor, i) => {
    if (!fornecedor.ativo) return;
    if (!(Number(item.unit?.[i]) > 0)) return;

    const total = calcularTotalItem(item, i, fornecedores);
    if (!vencedor || total < vencedor.total) vencedor = { indice: i, total };
  });

  return vencedor;
}

/**
 * Vencedor considerando a escolha manual. A escolha só vale se o modo
 * manual estiver ligado e o fornecedor escolhido continuar ativo e com
 * preço — senão cai no automático, para nunca ficar sem vencedor por
 * causa de uma escolha que envelheceu.
 */
export function obterVencedorEfetivo(
  item: ItemMapa,
  fornecedores: Fornecedor[],
  modoManual: boolean,
): Vencedor | null {
  if (modoManual && item.choice !== null && Number.isFinite(item.choice)) {
    const si = item.choice;
    const fornecedor = fornecedores[si];
    if (fornecedor?.ativo && Number(item.unit?.[si]) > 0) {
      return { indice: si, total: calcularTotalItem(item, si, fornecedores) };
    }
  }
  return obterVencedorAutomatico(item, fornecedores);
}

/** Itens com quantidade, cada um ligado ao seu fornecedor vencedor. */
export function obterAlocacoes(
  itens: ItemMapa[],
  fornecedores: Fornecedor[],
  modoManual: boolean,
): Alocacao[] {
  const alocacoes: Alocacao[] = [];

  itens.forEach((item, indice) => {
    if ((Number(item.qtde) || 0) <= 0) return;
    const vencedor = obterVencedorEfetivo(item, fornecedores, modoManual);
    if (!vencedor) return;
    alocacoes.push({ itemIndex: indice, supplierIndex: vencedor.indice });
  });

  return alocacoes;
}

/** Como acima, mas ignorando escolhas manuais. */
export function obterAlocacoesAutomaticas(
  itens: ItemMapa[],
  fornecedores: Fornecedor[],
): Alocacao[] {
  return obterAlocacoes(itens, fornecedores, false);
}

/**
 * Desconto de cada fornecedor, só quando ele de fato leva TODOS os itens
 * com quantidade nesta alocação — desconto é global do fornecedor (não
 * por item), e negociado pra compra integral; se ele ficou só com parte
 * da compra (fracionado), o desconto não vale (18/08/2026, pedido do
 * Lucas — "o desconto só é aplicado na compra integral"). Cobre tanto o
 * caso "garantido" (alocação já é a compra integral) quanto o caso raro
 * em que um fornecedor acaba levando tudo mesmo numa alocação fracionada
 * (por ser o mais barato item a item em toda a lista).
 */
export function descontosAplicaveis(
  alocacoes: Alocacao[],
  itens: ItemMapa[],
  fornecedores: Fornecedor[],
): number[] {
  const totalItensComQtde = itens.filter((item) => (Number(item.qtde) || 0) > 0).length;
  const contagemPorFornecedor = new Map<number, number>();
  for (const alocacao of alocacoes) {
    contagemPorFornecedor.set(
      alocacao.supplierIndex,
      (contagemPorFornecedor.get(alocacao.supplierIndex) ?? 0) + 1,
    );
  }

  return fornecedores.map((fornecedor, si) => {
    const levouTudo = totalItensComQtde > 0 && contagemPorFornecedor.get(si) === totalItensComQtde;
    return levouTudo ? Number(fornecedor.desconto) || 0 : 0;
  });
}

/**
 * Nota de um fornecedor: o imposto incide sobre itens + frete da loja
 * − desconto, e não sobre os itens isoladamente.
 */
export function calcularNota(
  itensBase: number,
  si: number,
  fornecedores: Fornecedor[],
  incluirFreteLoja: boolean,
  freteLoja: number,
  desconto: number,
): { baseNota: number; impostoNota: number; totalNota: number } {
  const taxa = obterTaxaImposto(fornecedores, si);
  const frete = incluirFreteLoja ? Number(freteLoja) || 0 : 0;
  const baseNota = (Number(itensBase) || 0) + frete - (Number(desconto) || 0);
  const impostoNota = baseNota * taxa;

  return { baseNota, impostoNota, totalNota: baseNota + impostoNota };
}

/** Nota de cada fornecedor a partir de um conjunto de alocações. */
export function calcularNotasPorFornecedor(
  alocacoes: Alocacao[],
  itens: ItemMapa[],
  fornecedores: Fornecedor[],
  incluirFreteLoja: boolean,
  descontosPorFornecedor?: number[],
): { bySupplier: NotaFornecedor[]; totals: TotaisNotas } {
  const base = fornecedores.map(() => 0);
  const comImposto = fornecedores.map(() => 0);

  for (const alocacao of alocacoes) {
    const item = itens[alocacao.itemIndex];
    const si = alocacao.supplierIndex;
    if (!item || si == null) continue;
    base[si] += calcularBaseItem(item, si);
    comImposto[si] += calcularTotalItem(item, si, fornecedores);
  }

  const bySupplier: NotaFornecedor[] = fornecedores.map((fornecedor, si) => {
    // Fornecedor que não ficou com nenhum item não gera nota — nem
    // frete, nem desconto, nem imposto.
    const used = base[si] > 0;
    const frete = incluirFreteLoja && used ? Number(fornecedor.frete) || 0 : 0;
    const desconto = used ? Number(descontosPorFornecedor?.[si]) || 0 : 0;

    const nota = calcularNota(
      base[si],
      si,
      fornecedores,
      incluirFreteLoja && used,
      frete,
      desconto,
    );

    return {
      used,
      itensBase: base[si],
      itensComImposto: comImposto[si],
      frete,
      desconto,
      baseNota: nota.baseNota,
      impostoNota: nota.impostoNota,
      totalNota: nota.totalNota,
    };
  });

  const totals = bySupplier.reduce<TotaisNotas>(
    (acc, nota) => ({
      itensBase: acc.itensBase + nota.itensBase,
      itensComImposto: acc.itensComImposto + nota.itensComImposto,
      frete: acc.frete + nota.frete,
      desconto: acc.desconto + nota.desconto,
      baseNota: acc.baseNota + nota.baseNota,
      impostoNota: acc.impostoNota + nota.impostoNota,
      totalNota: acc.totalNota + nota.totalNota,
    }),
    {
      itensBase: 0,
      itensComImposto: 0,
      frete: 0,
      desconto: 0,
      baseNota: 0,
      impostoNota: 0,
      totalNota: 0,
    },
  );

  return { bySupplier, totals };
}

/**
 * Cenário **fracionado**: cada item comprado de quem ofereceu mais
 * barato (ou, em modo manual, de quem foi marcado) — calculado por
 * fornecedor INDEPENDENTE de quem venceu a comparação de cenários, pra
 * sempre mostrar "quanto essa loja tem de mais barato" mesmo quando a
 * compra recomendada é integral em outra loja (18/08/2026, pedido do
 * Lucas — "Análise de compra individual" usava a alocação recomendada
 * pra decidir se calculava essa célula, então uma loja B com alguns itens
 * mais baratos que a loja A vencedora simplesmente sumia da tela).
 *
 * `totalItensComFrete` só aplica o desconto do fornecedor quando ele leva
 * TODOS os itens desta alocação (`descontosAplicaveis`) — desconto é
 * global e negociado pra compra integral, então numa referência de
 * "mais barato" (que é, por definição, uma fatia da compra) ele não
 * entra, a menos que essa loja realmente seja a mais barata em cada
 * item (19/08/2026, pedido do Lucas — corrige o cálculo que aplicava o
 * desconto mesmo quando a loja só cobria parte da compra).
 */
export function calcularFracionado(
  itens: ItemMapa[],
  fornecedores: Fornecedor[],
  modoManual: boolean,
  // `true` (padrão de sempre): cada nota inclui o frete da própria loja.
  // `false` (17/08/2026, pedido do Lucas): a compra usa frete particular em
  // vez do frete de cada loja — cobrar os dois seria contar o frete em
  // dobro, já que o freteiro vira um pagamento independente.
  incluirFreteLoja = true,
): Fracionado[] {
  const resultado: Fracionado[] = fornecedores.map(() => ({
    totalItens: 0,
    totalItensComFrete: 0,
    used: false,
  }));

  const alocacoes = obterAlocacoes(itens, fornecedores, modoManual);

  for (const alocacao of alocacoes) {
    const si = alocacao.supplierIndex;
    resultado[si].totalItens += calcularTotalItem(itens[alocacao.itemIndex], si, fornecedores);
    resultado[si].used = true;
  }

  const notas = calcularNotasPorFornecedor(
    alocacoes,
    itens,
    fornecedores,
    incluirFreteLoja,
    descontosAplicaveis(alocacoes, itens, fornecedores),
  );

  notas.bySupplier.forEach((nota, si) => {
    if (!fornecedores[si].ativo) return;
    resultado[si].totalItensComFrete = nota.used ? nota.totalNota : 0;
  });

  return resultado;
}

/**
 * Cenário **integral**: comprar tudo de um só fornecedor.
 *
 * Só vale para quem cotou *todos* os itens com quantidade — um
 * fornecedor que deixou item de fora não pode atender o pedido inteiro,
 * e é por isso que devolve zero em vez de um total parcial que
 * pareceria a melhor oferta.
 */
export function calcularIntegral(itens: ItemMapa[], fornecedores: Fornecedor[]): number[] {
  return fornecedores.map((fornecedor, si) => {
    if (!fornecedor.ativo) return 0;

    const cotouTudo = itens.every(
      (item) => (Number(item.qtde) || 0) <= 0 || Number(item.unit?.[si]) > 0,
    );
    if (!cotouTudo) return 0;

    const itensBase = itens.reduce(
      (soma, item) => ((Number(item.qtde) || 0) > 0 ? soma + calcularBaseItem(item, si) : soma),
      0,
    );

    return calcularNota(
      itensBase,
      si,
      fornecedores,
      true,
      Number(fornecedor.frete) || 0,
      Number(fornecedor.desconto) || 0,
    ).totalNota;
  });
}

/**
 * Total de um cenário de compra fracionada, com o frete que cabe a cada
 * um (da loja, ou particular) — a base de "Comparação de cenários"
 * (17/08/2026, pedido do Lucas). `incluirFreteLoja=false` soma
 * `freteParticular` no lugar do frete de cada loja, sem imposto (mesma
 * regra do frete particular de sempre — não entra na nota).
 */
export function calcularTotalCenario(
  itens: ItemMapa[],
  fornecedores: Fornecedor[],
  alocacoes: Alocacao[],
  incluirFreteLoja: boolean,
  freteParticular: number,
): number {
  const notas = calcularNotasPorFornecedor(
    alocacoes,
    itens,
    fornecedores,
    incluirFreteLoja,
    fornecedores.map(() => 0),
  );
  const frete = incluirFreteLoja ? 0 : Number(freteParticular) || 0;
  return notas.totals.totalNota + frete;
}

/**
 * Divide o frete particular entre as etapas da obra, proporcional ao
 * total (com imposto, pelo fornecedor efetivamente alocado) que cada
 * etapa representa no mapa inteiro — pedido do Lucas, 17/08/2026: o
 * freteiro entra no rateio "como se fosse um fornecedor", mas o cálculo
 * dele é mais simples que o de uma nota (não tem trava manual de
 * percentual — é sempre proporcional).
 *
 * @returns mapa etapaKey (`item.eapId`, ou `ETAPA_SEM_NOME`) → valor
 */
export function ratearFreteiro(
  itens: ItemMapa[],
  fornecedores: Fornecedor[],
  alocacoes: Alocacao[],
  freteParticular: number,
): Map<string, number> {
  const totalPorEtapa = new Map<string, number>();

  for (const alocacao of alocacoes) {
    const item = itens[alocacao.itemIndex];
    if (!item) continue;
    const total = calcularTotalItem(item, alocacao.supplierIndex, fornecedores);
    for (const rateio of obterRateiosDoItem(item)) {
      totalPorEtapa.set(
        rateio.etapaKey,
        (totalPorEtapa.get(rateio.etapaKey) ?? 0) + total * rateio.fator,
      );
    }
  }

  const totalGeral = Array.from(totalPorEtapa.values()).reduce((soma, v) => soma + v, 0);
  const resultado = new Map<string, number>();
  if (totalGeral <= 0) return resultado;

  for (const [etapa, valor] of totalPorEtapa) {
    resultado.set(etapa, (Number(freteParticular) || 0) * (valor / totalGeral));
  }
  return resultado;
}
