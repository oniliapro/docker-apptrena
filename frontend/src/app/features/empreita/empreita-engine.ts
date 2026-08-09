/**
 * Engine da Empreita — portado de js/empreita/12-empreita-engine.js.
 *
 * ------------------------------------------------------------------
 * Como uma medição se transforma em pagamento
 * ------------------------------------------------------------------
 * Cada serviço da empreita aponta para um item da EAP, e é o orçado
 * desse item que define **como o valor contratado se distribui entre as
 * categorias de custo**. Se o item orçado é 70% material e 30% mão de
 * obra, o contrato é lido na mesma proporção. Quando não há orçado, a
 * divisão é igual entre as categorias — melhor que travar.
 *
 * A medição é feita em percentual por categoria, e o que se paga é o
 * **avanço** do período: `atual − acumulado`. Retrocesso não gera
 * crédito negativo; a linha é marcada como inválida, porque medição que
 * anda para trás é erro de digitação, não estorno.
 *
 * Sobre o avanço incidem duas coisas em paralelo, categoria a categoria:
 *
 *  - `pagar`    = contratoEmpPorTipo[categoria]     × avanço%
 *  - `reservar` = contratoReservaPorTipo[categoria] × avanço%
 *
 * O contrato **não é distribuído automaticamente pelo orçado** — decisão
 * da task #45 (28/07/2026): o usuário lança o valor de cada categoria à
 * mão. O orçado da EAP continua calculado aqui (`orcadoPorTipo`), mas só
 * como referência de comparação na tela — não entra mais na conta de
 * quanto pagar.
 *
 * A **reserva discricionária** é o diferencial do AppTrena: em vez de
 * uma retenção percentual fixa, é um valor lançado à mão por serviço (e
 * por categoria), que acompanha o avanço mas pode ser dimensionado caso
 * a caso — e usado para cobrir problema em outra obra.
 * ------------------------------------------------------------------
 */

import { ChaveTipo, ItemEap, PorTipo, TIPOS_CUSTO } from '../eap/eap.models';
import { criarVazioPorTipo, somarEmPorTipo, somarPorTipo } from '../eap/eap-normalize';
import { ehDescendente } from '../eap/eap-engine';
import {
  CabecalhoEmpreita,
  CabecalhoEapSnapshot,
  ItemEmpreita,
  LinhaEmpreita,
  OrcadoEap,
  TotaisEmpreita,
} from './empreita.models';

/** Mantém percentuais no intervalo 0–100. */
export function limitarPercentual(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Categorias consideradas. Nenhuma marcada equivale a todas — assim uma
 * empreita recém-criada já funciona, sem exigir configuração antes.
 */
export function obterTiposIncluidos(cabecalho: CabecalhoEmpreita): ChaveTipo[] {
  const marcadas = TIPOS_CUSTO.filter((t) => cabecalho?.typesIncluded?.[t.chave]).map(
    (t) => t.chave,
  );
  return marcadas.length ? marcadas : TIPOS_CUSTO.map((t) => t.chave);
}

function calcularOverrideBdi(item: ItemEap, totalDireto: number): number | null {
  if (item?.bdiMode === 'value') {
    const v = Number(item?.bdiValue) || 0;
    return v > 0 ? v : null;
  }
  const p = Number(item?.bdiPercent) || 0;
  if (p <= 0) return null;
  return (Number(totalDireto) || 0) * (p / 100);
}

/**
 * Orçado de cada item da EAP, indexado por id, com o BDI já distribuído
 * entre as categorias. Linhas de grupo recebem a soma dos descendentes.
 *
 * O BDI considerado combina o **global da obra** (do cabeçalho da EAP)
 * com os **overrides por item** — item que tem BDI próprio ignora a
 * regra global, e quando o global é um valor fechado, esses itens ficam
 * fora do rateio. Diferente da EAP, aqui o escopo "por categoria" não
 * entra: a empreita lê sempre o global ou o do item.
 */
export function calcularOrcadoDaEap(
  itensEap: ItemEap[],
  cabecalhoEap?: CabecalhoEapSnapshot | null,
): Map<string, OrcadoEap> {
  const n = itensEap.length;
  const vazio = () => Array.from({ length: n }, () => criarVazioPorTipo());

  const diretoPorTipo = vazio();
  const totalDireto = Array.from({ length: n }, () => 0);
  const bdiPorTipo = vazio();
  const bdiAplicado = Array.from({ length: n }, () => 0);
  const totalPorTipo = vazio();
  const totalComBdi = Array.from({ length: n }, () => 0);

  // 1) Custo direto dos itens-base
  for (let i = 0; i < n; i++) {
    const item = itensEap[i];
    if (!item || item.isGroup) continue;

    const quantidade = Number(item.qtde) || 0;
    TIPOS_CUSTO.forEach((t) => {
      diretoPorTipo[i][t.chave] = (Number(item.unit?.[t.chave]) || 0) * quantidade;
    });
    totalDireto[i] = somarPorTipo(diretoPorTipo[i]);
  }

  // 2) Overrides por item
  const override = Array.from({ length: n }, () => null as number | null);
  for (let i = 0; i < n; i++) {
    const item = itensEap[i];
    if (!item || item.isGroup) continue;
    override[i] = calcularOverrideBdi(item, totalDireto[i]);
  }

  // 3) BDI aplicado: global da obra, com os overrides prevalecendo
  const modoGlobal = cabecalhoEap?.bdiMode === 'value' ? 'value' : 'pct';
  const valorGlobal = Number(cabecalhoEap?.bdiValue) || 0;
  const percentualGlobal = Number(cabecalhoEap?.bdiPercent) || 0;

  if (modoGlobal === 'value' && valorGlobal > 0) {
    // Valor fechado rateado entre os itens sem override.
    let baseSemOverride = 0;
    for (let i = 0; i < n; i++) {
      const item = itensEap[i];
      if (!item || item.isGroup || override[i] !== null) continue;
      baseSemOverride += totalDireto[i];
    }

    for (let i = 0; i < n; i++) {
      const item = itensEap[i];
      if (!item || item.isGroup) continue;

      bdiAplicado[i] =
        override[i] !== null
          ? (override[i] as number)
          : baseSemOverride > 0
            ? valorGlobal * (totalDireto[i] / baseSemOverride)
            : 0;
    }
  } else if (modoGlobal === 'pct' && percentualGlobal > 0) {
    for (let i = 0; i < n; i++) {
      const item = itensEap[i];
      if (!item || item.isGroup) continue;
      bdiAplicado[i] =
        override[i] !== null
          ? (override[i] as number)
          : totalDireto[i] * (percentualGlobal / 100);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const item = itensEap[i];
      if (!item || item.isGroup) continue;
      bdiAplicado[i] = override[i] ?? 0;
    }
  }

  // 4) Distribui o BDI entre as categorias, proporcional ao custo direto
  for (let i = 0; i < n; i++) {
    const item = itensEap[i];
    if (!item || item.isGroup) continue;

    const base = totalDireto[i];
    const bdi = bdiAplicado[i];
    if (base > 0 && bdi > 0) {
      TIPOS_CUSTO.forEach((t) => {
        bdiPorTipo[i][t.chave] = bdi * ((Number(diretoPorTipo[i][t.chave]) || 0) / base);
      });
    }

    TIPOS_CUSTO.forEach((t) => {
      totalPorTipo[i][t.chave] =
        (Number(diretoPorTipo[i][t.chave]) || 0) + (Number(bdiPorTipo[i][t.chave]) || 0);
    });

    totalComBdi[i] = base + bdi;
  }

  // 5) Grupos: soma dos descendentes, gravada na própria posição do grupo
  for (let i = 0; i < n; i++) {
    const grupo = itensEap[i];
    if (!grupo?.isGroup) continue;

    const eap = String(grupo.eap ?? '').trim();
    if (!eap) continue;

    const acumDireto: PorTipo = criarVazioPorTipo();
    const acumBdi: PorTipo = criarVazioPorTipo();
    let somaDireto = 0;
    let somaBdi = 0;

    for (let j = 0; j < n; j++) {
      const filho = itensEap[j];
      if (!filho || filho.isGroup) continue;
      if (!ehDescendente(eap, filho.eap)) continue;

      somarEmPorTipo(acumDireto, diretoPorTipo[j]);
      somarEmPorTipo(acumBdi, bdiPorTipo[j]);
      somaDireto += totalDireto[j];
      somaBdi += bdiAplicado[j];
    }

    diretoPorTipo[i] = acumDireto;
    bdiPorTipo[i] = acumBdi;
    totalDireto[i] = somaDireto;
    bdiAplicado[i] = somaBdi;
    totalComBdi[i] = somaDireto + somaBdi;

    TIPOS_CUSTO.forEach((t) => {
      totalPorTipo[i][t.chave] =
        (Number(acumDireto[t.chave]) || 0) + (Number(acumBdi[t.chave]) || 0);
    });
  }

  const mapa = new Map<string, OrcadoEap>();
  for (let i = 0; i < n; i++) {
    const id = String(itensEap[i]?.id ?? '');
    if (!id) continue;
    mapa.set(id, {
      diretoPorTipo: diretoPorTipo[i],
      totalDireto: totalDireto[i],
      bdiPorTipo: bdiPorTipo[i],
      bdiTotal: bdiAplicado[i],
      totalPorTipo: totalPorTipo[i],
      total: totalComBdi[i],
    });
  }

  return mapa;
}

/** Cálculo completo de uma linha de empreita. */
export function calcularLinhaEmpreita(
  item: ItemEmpreita,
  cabecalho: CabecalhoEmpreita,
  orcadoPorId: Map<string, OrcadoEap>,
): LinhaEmpreita {
  const tipos = obterTiposIncluidos(cabecalho);
  const orcado = orcadoPorId.get(String(item?.eapId ?? '')) ?? null;

  // Parte de todas as categorias zeradas, e não só das consideradas: as
  // excluídas aparecem como 0 em vez de ausentes, o que mantém a forma do
  // objeto estável para quem consome (tabelas, somatórios, comparações).
  // Usado só como referência de comparação na tela — não entra mais no
  // cálculo de quanto pagar (task #45, 28/07/2026: o contrato é lançado
  // pelo usuário por categoria, não distribuído pelo sistema).
  const orcadoPorTipo: PorTipo = criarVazioPorTipo();
  tipos.forEach((k) => {
    orcadoPorTipo[k] = Number(orcado?.totalPorTipo?.[k]) || 0;
  });
  const orcadoTotal = tipos.reduce((soma, k) => soma + (Number(orcadoPorTipo[k]) || 0), 0);

  // Contrato lançado pelo usuário, categoria a categoria — fonte única de
  // verdade, sem cálculo automático a partir do orçado.
  const contratoEmpPorTipo = item?.contratoEmpPorTipo ?? {};
  const contratoReservaPorTipo = item?.contratoReservaPorTipo ?? {};

  const contratoPorTipo: Partial<PorTipo> = {};
  let valorEmp = 0;
  let valorReserva = 0;
  tipos.forEach((k) => {
    const emp = Number(contratoEmpPorTipo[k]) || 0;
    const reserva = Number(contratoReservaPorTipo[k]) || 0;
    valorEmp += emp;
    valorReserva += reserva;
    contratoPorTipo[k] = emp + reserva;
  });
  const valorTotal = valorEmp + valorReserva;

  const acumuladoPorTipo: Partial<Record<ChaveTipo, number>> = {};
  const atualPorTipo: Partial<Record<ChaveTipo, number>> = {};
  const avancoPorTipo: Partial<Record<ChaveTipo, number>> = {};
  const pagarPorTipo: Partial<Record<ChaveTipo, number>> = {};
  const reservarPorTipo: Partial<Record<ChaveTipo, number>> = {};
  const tiposInvalidos: ChaveTipo[] = [];

  let temAvanco = false;
  let pagarEmp = 0;
  let reservarPgto = 0;

  for (const k of tipos) {
    const acumulado = limitarPercentual(item?.medicaoAcumByType?.[k]);

    // Atual em branco significa "sem avanço", não zero — herda o acumulado.
    const atualBruto = item?.medicaoAtualByType?.[k];
    const atual =
      atualBruto === null || atualBruto === undefined ? acumulado : limitarPercentual(atualBruto);

    const avanco = Math.max(0, atual - acumulado);
    if (atual < acumulado) tiposInvalidos.push(k);
    if (avanco > 0) temAvanco = true;

    acumuladoPorTipo[k] = acumulado;
    atualPorTipo[k] = atual;
    avancoPorTipo[k] = avanco;

    const empTipo = Number(contratoEmpPorTipo[k]) || 0;
    const reservaTipo = Number(contratoReservaPorTipo[k]) || 0;
    const pagar = empTipo * (avanco / 100);
    const reservar = reservaTipo * (avanco / 100);

    pagarPorTipo[k] = pagar;
    reservarPorTipo[k] = reservar;
    pagarEmp += pagar;
    reservarPgto += reservar;
  }

  return {
    valorEmp,
    valorReserva,
    valorTotal,
    tipos,
    orcadoPorTipo,
    orcadoTotal,
    contratoPorTipo,
    acumuladoPorTipo,
    atualPorTipo,
    avancoPorTipo,
    pagarPorTipo,
    reservarPorTipo,
    temAvanco,
    pagarEmp,
    reservarPgto,
    totalPeriodo: pagarEmp + reservarPgto,
    reducaoInvalida: tiposInvalidos.length > 0,
    tiposInvalidos,
  };
}

export function calcularTotaisEmpreita(
  itens: ItemEmpreita[],
  cabecalho: CabecalhoEmpreita,
  orcadoPorId: Map<string, OrcadoEap>,
): TotaisEmpreita {
  return itens.reduce<TotaisEmpreita>(
    (totais, item) => {
      const linha = calcularLinhaEmpreita(item, cabecalho, orcadoPorId);
      return {
        orcadoTotal: totais.orcadoTotal + linha.orcadoTotal,
        valorEmp: totais.valorEmp + linha.valorEmp,
        valorReserva: totais.valorReserva + linha.valorReserva,
        valorTotal: totais.valorTotal + linha.valorTotal,
        pagarEmp: totais.pagarEmp + linha.pagarEmp,
        reservarPgto: totais.reservarPgto + linha.reservarPgto,
        totalPeriodo: totais.totalPeriodo + linha.totalPeriodo,
      };
    },
    {
      orcadoTotal: 0,
      valorEmp: 0,
      valorReserva: 0,
      valorTotal: 0,
      pagarEmp: 0,
      reservarPgto: 0,
      totalPeriodo: 0,
    },
  );
}
