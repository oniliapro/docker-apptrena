/**
 * Engine da EAP — cálculo do orçado e do BDI.
 * Portado de js/eap/03-engine.js, função por função.
 *
 * ------------------------------------------------------------------
 * Como o BDI funciona
 * ------------------------------------------------------------------
 * O BDI pode incidir de três formas, definidas em `header.bdiScope`:
 *
 *  - **global**: um percentual sobre o custo direto de cada item, ou um
 *    valor fechado rateado entre os itens proporcionalmente ao custo.
 *  - **category**: uma regra por categoria de custo (material, mão de
 *    obra…), cada uma em percentual ou valor.
 *  - **item**: nenhuma regra geral; só vale o BDI definido item a item.
 *
 * Em qualquer escopo, um item com BDI próprio ("override") ignora a
 * regra geral. E quando o BDI é um valor fechado a ser rateado, os
 * itens com override ficam de fora do rateio — eles já têm o seu.
 *
 * O BDI de cada item é então distribuído entre as categorias na mesma
 * proporção do custo direto, para que as colunas por categoria fechem
 * com o total.
 * ------------------------------------------------------------------
 */

import {
  CabecalhoObra,
  CacheOrcado,
  ItemEap,
  PorTipo,
  TIPOS_CUSTO,
  TotaisDoGrupo,
} from './eap.models';
import {
  criarVazioPorTipo,
  multiplicarPorTipo,
  normalizarPorTipo,
  somarEmPorTipo,
  somarPorTipo,
  ehDescendente,
} from './eap-normalize';

// Reexportado por conveniência — vários módulos (Empreita, Cronograma de
// Desembolso, o próprio componente da EAP) já importavam `ehDescendente`
// daqui. A implementação mudou de lugar (`eap-normalize.ts`, que agora
// também a usa pra derivar `isGroup`), mas o caminho de import antigo
// continua funcionando.
export { ehDescendente };

/** Divisão que devolve 0 em vez de NaN/Infinity quando não há base. */
export function percentualSeguro(numerador: unknown, denominador: unknown): number {
  const n = Number(numerador) || 0;
  const d = Number(denominador) || 0;
  return d <= 0 ? 0 : (n / d) * 100;
}

/**
 * BDI definido no próprio item, em reais.
 * Devolve null quando o item não tem override — o que é diferente de
 * ter override zero, e é essa distinção que decide se ele entra no
 * rateio da regra geral.
 */
export function calcularValorOverrideBdi(item: ItemEap, custoDireto: number): number | null {
  if (item?.bdiMode === 'value') {
    const valor = Number(item?.bdiValue) || 0;
    return valor > 0 ? valor : null;
  }

  const percentual = Number(item?.bdiPercent) || 0;
  if (percentual <= 0) return null;
  return (Number(custoDireto) || 0) * (percentual / 100);
}

export function calcularCacheOrcado(itens: ItemEap[], cabecalho: CabecalhoObra): CacheOrcado {
  const n = itens.length;
  const vazio = () => Array.from({ length: n }, () => criarVazioPorTipo());

  const unitByType = vazio();
  const unitTotal = Array.from({ length: n }, () => 0);
  const directByType = vazio();
  const directTotal = Array.from({ length: n }, () => 0);
  const bdiOverrideValue = Array.from({ length: n }, () => null as number | null);
  const bdiApplied = Array.from({ length: n }, () => 0);
  const bdiByType = vazio();
  const totalWithBdi = Array.from({ length: n }, () => 0);
  const bdiPctApplied = Array.from({ length: n }, () => 0);

  const ehItemBase = (i: number) => Boolean(itens[i]) && !itens[i].isGroup;

  // 1) Custo direto — só itens-base; grupos são somatórios, calculados à parte.
  for (let i = 0; i < n; i++) {
    if (!ehItemBase(i)) continue;

    const item = itens[i];
    const unit = normalizarPorTipo(item.unit);

    unitByType[i] = unit;
    unitTotal[i] = somarPorTipo(unit);

    const total = multiplicarPorTipo(unit, Number(item.qtde) || 0);
    directByType[i] = total;
    directTotal[i] = somarPorTipo(total);
  }

  // 2) Overrides por item
  for (let i = 0; i < n; i++) {
    if (!ehItemBase(i)) continue;
    bdiOverrideValue[i] = calcularValorOverrideBdi(itens[i], directTotal[i]);
  }

  const escopo =
    cabecalho?.bdiScope === 'category' || cabecalho?.bdiScope === 'item'
      ? cabecalho.bdiScope
      : 'global';

  const modoGlobal = cabecalho?.bdiMode === 'value' ? 'value' : 'pct';
  const valorGlobal = Number(cabecalho?.bdiValue) || 0;
  const percentualGlobal = Number(cabecalho?.bdiPercent) || 0;

  /** Espalha o BDI do item entre as categorias, proporcional ao custo direto. */
  const distribuirPorTipo = (i: number, valorBdi: number): void => {
    const direto = directTotal[i] || 0;
    const bdi = Number(valorBdi) || 0;
    if (direto <= 0 || bdi <= 0) return;

    TIPOS_CUSTO.forEach((t) => {
      const fatia = (Number(directByType[i]?.[t.chave]) || 0) / direto;
      bdiByType[i][t.chave] = bdi * fatia;
    });
  };

  // 3) BDI aplicado, conforme o escopo
  if (escopo === 'item') {
    for (let i = 0; i < n; i++) {
      if (!ehItemBase(i)) continue;
      bdiApplied[i] = bdiOverrideValue[i] ?? 0;
      distribuirPorTipo(i, bdiApplied[i]);
    }
  } else if (escopo === 'category') {
    const config = cabecalho?.bdiByType ?? ({} as CabecalhoObra['bdiByType']);

    // Base de rateio das categorias em modo "valor": só os itens sem
    // override entram, já que os demais não participam do rateio.
    const baseSemOverride = criarVazioPorTipo();
    TIPOS_CUSTO.forEach((t) => {
      const slot = config?.[t.chave];
      const modo = slot?.mode === 'value' ? 'value' : 'pct';
      if (modo !== 'value' || (Number(slot?.value) || 0) <= 0) return;

      for (let i = 0; i < n; i++) {
        if (!ehItemBase(i) || bdiOverrideValue[i] !== null) continue;
        baseSemOverride[t.chave] += Number(directByType[i]?.[t.chave]) || 0;
      }
    });

    for (let i = 0; i < n; i++) {
      if (!ehItemBase(i)) continue;

      if (bdiOverrideValue[i] !== null) {
        bdiApplied[i] = bdiOverrideValue[i] as number;
        distribuirPorTipo(i, bdiApplied[i]);
        continue;
      }

      TIPOS_CUSTO.forEach((t) => {
        const slot = config?.[t.chave] ?? { mode: 'pct' as const, percent: 0, value: 0 };
        const modo = slot.mode === 'value' ? 'value' : 'pct';
        const percentual = Number(slot.percent) || 0;
        const valor = Number(slot.value) || 0;
        const direto = Number(directByType[i]?.[t.chave]) || 0;

        if (modo === 'pct') {
          bdiByType[i][t.chave] = percentual > 0 ? direto * (percentual / 100) : 0;
        } else {
          const base = Number(baseSemOverride[t.chave]) || 0;
          bdiByType[i][t.chave] = valor > 0 && base > 0 ? valor * (direto / base) : 0;
        }
      });

      // Aqui o BDI vem da soma das categorias, não o contrário.
      bdiApplied[i] = somarPorTipo(bdiByType[i]);
    }
  } else if (modoGlobal === 'value' && valorGlobal > 0) {
    // Valor fechado rateado entre os itens sem override.
    let baseSemOverride = 0;
    for (let i = 0; i < n; i++) {
      if (!ehItemBase(i) || bdiOverrideValue[i] !== null) continue;
      baseSemOverride += directTotal[i];
    }

    for (let i = 0; i < n; i++) {
      if (!ehItemBase(i)) continue;

      bdiApplied[i] =
        bdiOverrideValue[i] !== null
          ? (bdiOverrideValue[i] as number)
          : baseSemOverride > 0
            ? valorGlobal * (directTotal[i] / baseSemOverride)
            : 0;

      distribuirPorTipo(i, bdiApplied[i]);
    }
  } else if (modoGlobal === 'pct' && percentualGlobal > 0) {
    for (let i = 0; i < n; i++) {
      if (!ehItemBase(i)) continue;

      bdiApplied[i] =
        bdiOverrideValue[i] !== null
          ? (bdiOverrideValue[i] as number)
          : directTotal[i] * (percentualGlobal / 100);

      distribuirPorTipo(i, bdiApplied[i]);
    }
  } else {
    // Sem regra geral configurada: só os overrides valem.
    for (let i = 0; i < n; i++) {
      if (!ehItemBase(i)) continue;
      bdiApplied[i] = bdiOverrideValue[i] ?? 0;
      distribuirPorTipo(i, bdiApplied[i]);
    }
  }

  // 4) Fechamento por item
  for (let i = 0; i < n; i++) {
    if (!ehItemBase(i)) continue;
    totalWithBdi[i] = directTotal[i] + bdiApplied[i];
    bdiPctApplied[i] = percentualSeguro(bdiApplied[i], directTotal[i]);
  }

  // 5) Totais gerais
  const totalsDirectByType = criarVazioPorTipo();
  const totalsBdiByType = criarVazioPorTipo();

  for (let i = 0; i < n; i++) {
    if (!ehItemBase(i)) continue;
    somarEmPorTipo(totalsDirectByType, directByType[i]);
    somarEmPorTipo(totalsBdiByType, bdiByType[i]);
  }

  const totalsDirect = somarPorTipo(totalsDirectByType);
  const totalsBdi = somarPorTipo(totalsBdiByType);

  return {
    unitByType,
    unitTotal,
    directByType,
    directTotal,
    bdiOverrideValue,
    bdiApplied,
    bdiByType,
    bdiPctApplied,
    totalWithBdi,
    totalsDirectByType,
    totalsBdiByType,
    totalsDirect,
    totalsBdi,
    totalsWithBdi: totalsDirect + totalsBdi,
  };
}

/**
 * Totais de uma linha de grupo: a soma dos itens-base cujo código EAP
 * começa com o código do grupo (ex.: grupo "2" soma "2.1", "2.2"…).
 */
export function somarDescendentesDoGrupo(
  indiceGrupo: number,
  itens: ItemEap[],
  cache: CacheOrcado,
): TotaisDoGrupo {
  const eapGrupo = String(itens[indiceGrupo]?.eap ?? '').trim();
  const directByType: PorTipo = criarVazioPorTipo();
  const bdiByType: PorTipo = criarVazioPorTipo();

  if (!eapGrupo) {
    return {
      directByType,
      directTotal: 0,
      bdiApplied: 0,
      bdiByType,
      totalWithBdi: 0,
      bdiPctApplied: 0,
    };
  }

  let directTotal = 0;
  let bdiApplied = 0;

  for (let i = 0; i < itens.length; i++) {
    const filho = itens[i];
    if (!filho || filho.isGroup) continue;
    if (!ehDescendente(eapGrupo, filho.eap)) continue;

    somarEmPorTipo(directByType, cache.directByType[i]);
    somarEmPorTipo(bdiByType, cache.bdiByType[i]);
    directTotal += cache.directTotal[i];
    bdiApplied += cache.bdiApplied[i];
  }

  return {
    directByType,
    directTotal,
    bdiApplied,
    bdiByType,
    totalWithBdi: directTotal + bdiApplied,
    bdiPctApplied: percentualSeguro(bdiApplied, directTotal),
  };
}

/**
 * Orçado (com BDI) de uma etapa da EAP, por categoria de custo — usado
 * fora da própria EAP, no "saldo remanescente por etapa" do Mapa de
 * Fornecedores (17/08/2026, pedido do Lucas). Aceita tanto um item-folha
 * (usa o orçado dele direto) quanto um grupo (soma os descendentes,
 * mesma regra do "Orçado" mostrado na linha de grupo da EAP) — o select
 * de Etapa do Mapa permite escolher os dois.
 */
export function orcadoDaEtapa(etapaId: string, itens: ItemEap[], cache: CacheOrcado): PorTipo {
  const indice = itens.findIndex((i) => i.id === etapaId);
  if (indice < 0) return criarVazioPorTipo();

  const total = criarVazioPorTipo();

  if (!itens[indice].isGroup) {
    somarEmPorTipo(total, cache.directByType[indice]);
    somarEmPorTipo(total, cache.bdiByType[indice]);
    return total;
  }

  const grupo = somarDescendentesDoGrupo(indice, itens, cache);
  somarEmPorTipo(total, grupo.directByType);
  somarEmPorTipo(total, grupo.bdiByType);
  return total;
}
