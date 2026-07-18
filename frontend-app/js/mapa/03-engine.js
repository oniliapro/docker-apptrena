/* =========================================================
   ENGINE (rev: imposto-na-nota + exceção frete particular)
   - Mantém o funcionamento atual da tela (Total por item com imposto do item)
   - Corrige os totais do rodapé/testes/resumos via funções de NOTA por fornecedor
   ========================================================= */

/* ===== COLUNAS ESTÁVEIS (mantém compatibilidade) ===== */
function colunaUnitario(si) { return (si + 1) * 10; } // 10,20,30...
function indiceFornecedorPorColuna(c) {
  if (c < 10) return -1;
  const si = Math.floor(c / 10) - 1;
  return (si >= 0 && si < fornecedores.length) ? si : -1;
}

/* ===== ITENS: BASE E TOTAL COM IMPOSTO (por item) =====
   OBS:
   - Mantemos o Total (C/ Imposto) na linha como: item * (1+imposto)
   - O ajuste pedido (imposto também sobre frete/desconto da loja) será feito
     nos TOTAIS de NOTA (rodapé/testes/resumos), não na célula do item.
*/
function obterTaxaImposto(si) {
  return (Number(fornecedores?.[si]?.imposto) || 0) / 100;
}

function calcularBaseItemPorFornecedor(item, si) {
  const q = Number(item.qtde) || 0;
  const u = Number(item.unit?.[si]) || 0;
  return q * u;
}

function calcularTotalItemPorFornecedor(item, si) {
  // Total do item com imposto (para exibir na coluna Total (C/ Imposto))
  const base = calcularBaseItemPorFornecedor(item, si);
  const t = obterTaxaImposto(si);
  return base * (1 + t);
}

function calcularImpostoItemPorFornecedor(item, si) {
  const base = calcularBaseItemPorFornecedor(item, si);
  const total = calcularTotalItemPorFornecedor(item, si);
  return total - base;
}

/* ===== VENCEDOR AUTOMÁTICO / EFETIVO (mantém) ===== */
function obterVencedorAutomaticoPorItem(item) {
  let vencedor = null;
  fornecedores.forEach((s, i) => {
    if (!s.ativo) return;
    if (!(Number(item.unit?.[i]) > 0)) return;

    const total = calcularTotalItemPorFornecedor(item, i);
    if (!vencedor || total < vencedor.total) vencedor = { i, total };
  });
  return vencedor;
}

function obterVencedorEfetivoPorItem(item) {
  if (modoManual && Number.isFinite(item.choice) && item.choice !== null) {
    const si = item.choice;
    const s = fornecedores[si];
    if (s && s.ativo && Number(item.unit?.[si]) > 0) {
      return { i: si, total: calcularTotalItemPorFornecedor(item, si) };
    }
  }
  return obterVencedorAutomaticoPorItem(item);
}

/* =========================================================
   NOVO: NOTA POR FORNECEDOR (onde a correção do imposto entra)
   Regras:
   - Frete da loja (frete individual) entra na nota => sofre imposto
   - Descontos na nota reduzem base => reduzem imposto
   - Frete particular NÃO entra na nota => NÃO sofre imposto
   ========================================================= */

/**
 * Soma dos ITENS (base, sem imposto) por fornecedor, considerando uma lista de alocações.
 * allocations: [{ itemIndex, supplierIndex }]
 */
function somarItensBasePorFornecedorDeAlocacoes(alocacoes) {
  const soma = fornecedores.map(() => 0);

  for (const a of alocacoes) {
    const it = itens[a.itemIndex];
    const si = a.supplierIndex;
    if (!it || si == null) continue;
    soma[si] += calcularBaseItemPorFornecedor(it, si);
  }

  return soma;
}

/**
 * Soma dos ITENS com imposto (somente itens), por fornecedor (para relatórios).
 */
function somarItensComImpostoPorFornecedorDeAlocacoes(alocacoes) {
  const soma = fornecedores.map(() => 0);

  for (const a of alocacoes) {
    const it = itens[a.itemIndex];
    const si = a.supplierIndex;
    if (!it || si == null) continue;
    soma[si] += calcularTotalItemPorFornecedor(it, si);
  }

  return soma;
}

/**
 * Calcula a NOTA (por fornecedor) com base, imposto e total.
 *
 * Params:
 * - itensBase: number (soma base dos itens daquele fornecedor)
 * - si: supplier index
 * - includeShopFreight: boolean (se o frete da loja deve entrar na nota)
 * - shopFreight: number (frete da loja)
 * - discount: number (desconto aplicável naquela nota)
 *
 * Regras:
 * - BaseNota = itensBase + (includeShopFreight ? shopFreight : 0) - discount
 * - ImpostoNota = BaseNota * taxRate(si)
 * - TotalNota = BaseNota + ImpostoNota
 */
function calcularNotaFornecedor({ itensBase, si, includeShopFreight, shopFreight, discount }) {
  const t = obterTaxaImposto(si);
  const frete = includeShopFreight ? (Number(shopFreight) || 0) : 0;
  const desc = Number(discount) || 0;

  const baseNota = (Number(itensBase) || 0) + frete - desc;
  const impostoNota = baseNota * t;
  const totalNota = baseNota + impostoNota;

  return {
    baseNota,
    impostoNota,
    totalNota,
    taxRate: t
  };
}

/**
 * Ajuda: calcula nota por fornecedor para um conjunto de allocations.
 * - includeShopFreight: true => frete loja entra e é tributado
 * - discountsBySupplier: array opcional (desconto aplicado por fornecedor)
 *
 * Retorna:
 * { bySupplier: [{itensBase,itensComImposto,baseNota,impostoNota,totalNota,frete,desconto}], totals: {...} }
 */
function calcularNotasPorFornecedorDeAlocacoes({
  allocations,
  includeShopFreight,
  discountsBySupplier
}) {
  const itensBase = somarItensBasePorFornecedorDeAlocacoes(allocations);
  const itensComImposto = somarItensComImpostoPorFornecedorDeAlocacoes(allocations);

  const bySupplier = fornecedores.map((s, si) => {
    const used = itensBase[si] > 0;
    const frete = includeShopFreight && used ? (Number(s.frete) || 0) : 0;
    const desconto = used ? (Number(discountsBySupplier?.[si]) || 0) : 0;

    const nota = calcularNotaFornecedor({
      itensBase: itensBase[si],
      si,
      includeShopFreight: includeShopFreight && used,
      shopFreight: frete,
      discount: desconto
    });

    return {
      used,
      itensBase: itensBase[si],
      itensComImposto: itensComImposto[si], // somente itens, com imposto
      frete, // (se shop freight, entra na nota)
      desconto,
      baseNota: nota.baseNota,
      impostoNota: nota.impostoNota,
      totalNota: nota.totalNota
    };
  });

  const totals = bySupplier.reduce((acc, x) => {
    acc.itensBase += x.itensBase;
    acc.itensComImposto += x.itensComImposto;
    acc.frete += x.frete;
    acc.desconto += x.desconto;
    acc.baseNota += x.baseNota;
    acc.impostoNota += x.impostoNota;
    acc.totalNota += x.totalNota;
    return acc;
  }, { itensBase: 0, itensComImposto: 0, frete: 0, desconto: 0, baseNota: 0, impostoNota: 0, totalNota: 0 });

  return { bySupplier, totals };
}

/* =========================================================
   CÁLCULOS EXISTENTES (ajustados) - usados no rodapé/testes
   - integral por loja: agora total considera imposto sobre (itens + frete - desconto)
   - fracionado por fornecedor: idem, mas por alocação vencedora
   ========================================================= */

/**
 * Alocações automáticas (vencedor por item) respeitando fornecedor ativo
 * Retorna: [{ itemIndex, supplierIndex }]
 */
function obterAlocacoesAutomaticasEstadoAtual() {
  const allocations = [];
  itens.forEach((it, idx) => {
    const q = Number(it.qtde) || 0;
    if (q <= 0) return;
    const win = obterVencedorAutomaticoPorItem(it);
    if (!win) return;
    allocations.push({ itemIndex: idx, supplierIndex: win.i });
  });
  return allocations;
}

/**
 * Alocações efetivas (manual se ativo e válido, senão vencedor automático)
 */
function obterAlocacoesEfetivasEstadoAtual() {
  const allocations = [];
  itens.forEach((it, idx) => {
    const q = Number(it.qtde) || 0;
    if (q <= 0) return;
    const win = obterVencedorEfetivoPorItem(it);
    if (!win) return;
    allocations.push({ itemIndex: idx, supplierIndex: win.i });
  });
  return allocations;
}

/**
 * FRACIONADO (por fornecedor) para o rodapé "Total (Apenas itens mais baratos)" etc.
 * Ajuste:
 * - totalItens = soma do TOTAL DO ITEM (com imposto do item)
 * - totalItensComFrete = NOTA com imposto incluindo frete loja e desconto (tributados)
 *
 * OBS:
 * Esse retorno mantém compatibilidade com seu renderFoot atual
 * (frac.totalItens e frac.totalItensComFrete).
 */
function calcularFracionadoPorFornecedor() {
  const result = fornecedores.map(() => ({
    totalItens: 0,           // itens com imposto (apenas itens)
    totalItensComFrete: 0,   // nota total (itens+frete-desconto) com imposto na nota
    used: false
  }));

  const allocations = obterAlocacoesEfetivasEstadoAtual();

  // soma itens (com imposto do item)
  for (const a of allocations) {
    const si = a.supplierIndex;
    result[si].totalItens += calcularTotalItemPorFornecedor(itens[a.itemIndex], si);
    result[si].used = true;
  }

  // agora nota com frete loja e desconto tributados
  // desconto integral NÃO deveria aplicar em fracionado (vamos corrigir isso no arquivo de render/tests depois),
  // então aqui por enquanto usa desconto=0 como padrão para fracionado automático.
  const discounts = fornecedores.map(() => 0);

  const notas = calcularNotasPorFornecedorDeAlocacoes({
    allocations,
    includeShopFreight: true,
    discountsBySupplier: discounts
  });

  notas.bySupplier.forEach((x, si) => {
    if (!fornecedores[si].ativo) return;
    result[si].totalItensComFrete = x.used ? x.totalNota : 0;
  });

  return result;
}

/**
 * INTEGRAL POR LOJA:
 * Ajuste:
 * - só válido se a loja tiver preço para todos os itens com qtde>0
 * - total agora é:
 *   Nota = (itensBase + freteLoja - descontoIntegral) * (1 + imposto%)
 * - Retorna array totals[si] (0 se inválido)
 */
function calcularIntegralPorFornecedor() {
  const totals = fornecedores.map(() => 0);

  fornecedores.forEach((s, si) => {
    if (!s.ativo) { totals[si] = 0; return; }

    // precisa ter todos os itens precificados (qtde>0)
    for (const it of itens) {
      const q = Number(it.qtde) || 0;
      if (q > 0 && !(Number(it.unit?.[si]) > 0)) {
        totals[si] = 0;
        return;
      }
    }

    // soma base itens
    let itensBase = 0;
    for (const it of itens) {
      const q = Number(it.qtde) || 0;
      if (q <= 0) continue;
      itensBase += calcularBaseItemPorFornecedor(it, si);
    }

    // nota integral inclui frete loja e desconto integral, tributados
    const nota = calcularNotaFornecedor({
      itensBase,
      si,
      includeShopFreight: true,
      shopFreight: Number(s.frete) || 0,
      discount: Number(s.desconto) || 0
    });

    totals[si] = nota.totalNota;
  });

  return totals;
}
