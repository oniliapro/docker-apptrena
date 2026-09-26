/**
 * Engine da Empreita — portado de js/empreita/12-empreita-engine.js.
 *
 * ------------------------------------------------------------------
 * Como uma medição se transforma em pagamento
 * ------------------------------------------------------------------
 * Cada serviço da empreita aponta para um item da EAP e pertence a UMA
 * categoria de custo só (`item.tipo` — 25/08/2026, pedido do Lucas: "cada
 * item da lista só vai ter um tipo"; antes um serviço podia ter contrato/
 * medição em várias categorias ao mesmo tempo). É o orçado desse item,
 * NAQUELA categoria, que entra como referência de comparação na tela.
 *
 * A medição é feita em percentual, e o que se paga é o **avanço** do
 * período: `atual − acumulado`. Retrocesso não gera crédito negativo; a
 * linha é marcada como inválida, porque medição que anda para trás é erro
 * de digitação, não estorno.
 *
 * Sobre o avanço incidem duas coisas em paralelo:
 *
 *  - `pagar`    = contratoEmp     × avanço%
 *  - `reservar` = contratoReserva × avanço%
 *
 * O contrato **não é distribuído automaticamente pelo orçado** — decisão
 * da task #45 (28/07/2026): o usuário lança o valor à mão. O orçado da
 * EAP continua calculado aqui (`orcado`), mas só como referência de
 * comparação na tela — não entra mais na conta de quanto pagar.
 *
 * A **reserva discricionária** é o diferencial do AppTrena: em vez de
 * uma retenção percentual fixa, é um valor lançado à mão por serviço,
 * que acompanha o avanço mas pode ser dimensionado caso a caso — e usado
 * para cobrir problema em outra obra.
 * ------------------------------------------------------------------
 */

import { ChaveTipo, ItemEap, PorTipo, TIPOS_CUSTO } from '../eap/eap.models';
import { criarVazioPorTipo, somarEmPorTipo, somarPorTipo } from '../eap/eap-normalize';
import { ehDescendente } from '../eap/eap-engine';
import { expandirItensPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import {
  CabecalhoEapSnapshot,
  ItemEmpreita,
  JaPagoLinha,
  LinhaEmpreita,
  LinhaEmpreitaEstendida,
  OrcadoEap,
  ResumoContratoEmpreita,
  TotaisEmpreita,
  TotaisEmpreitaEstendida,
} from './empreita.models';

/** Mantém percentuais no intervalo 0–100. */
export function limitarPercentual(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
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
  orcadoPorId: Map<string, OrcadoEap>,
): LinhaEmpreita {
  const orcadoItem = orcadoPorId.get(String(item?.eapId ?? '')) ?? null;
  const orcado = Number(orcadoItem?.totalPorTipo?.[item.tipo]) || 0;

  const valorEmp = Number(item?.contratoEmp) || 0;
  const valorReserva = Number(item?.contratoReserva) || 0;
  const valorTotal = valorEmp + valorReserva;
  const contrato = valorTotal;

  const acumulado = limitarPercentual(item?.medicaoAcum);
  // Atual em branco significa "sem avanço", não zero — herda o acumulado.
  const atualBruto = item?.medicaoAtual;
  const atual =
    atualBruto === null || atualBruto === undefined ? acumulado : limitarPercentual(atualBruto);

  const avanco = Math.max(0, atual - acumulado);
  const reducaoInvalida = atual < acumulado;
  const temAvanco = avanco > 0;

  const pagar = valorEmp * (avanco / 100);
  const reservar = valorReserva * (avanco / 100);

  return {
    valorEmp,
    valorReserva,
    valorTotal,
    orcado,
    contrato,
    acumulado,
    atual,
    avanco,
    pagar,
    reservar,
    temAvanco,
    totalPeriodo: pagar + reservar,
    reducaoInvalida,
  };
}

export function calcularTotaisEmpreita(
  itens: ItemEmpreita[],
  orcadoPorId: Map<string, OrcadoEap>,
): TotaisEmpreita {
  return itens.reduce<TotaisEmpreita>(
    (totais, item) => {
      const linha = calcularLinhaEmpreita(item, orcadoPorId);
      return {
        orcadoTotal: totais.orcadoTotal + linha.orcado,
        valorEmp: totais.valorEmp + linha.valorEmp,
        valorReserva: totais.valorReserva + linha.valorReserva,
        valorTotal: totais.valorTotal + linha.valorTotal,
        pagarEmp: totais.pagarEmp + linha.pagar,
        reservarPgto: totais.reservarPgto + linha.reservar,
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

// ----------------------------------------------------------------------
// Redesign 25/08/2026 (pedido do Lucas) — saldo comprometido entre
// empreitas, Já pago/Divergência acumulados, e o "Saldo após pagamento".
// ----------------------------------------------------------------------

/**
 * Saldo disponível por item da EAP e categoria de custo — quanto do
 * orçado ainda não foi comprometido por CONTRATOS de outras empreitas da
 * mesma obra. Adaptado do `saldoPorEtapa` do Mapa
 * (`mapa.store.ts:392-548`), mas a "contribuição" descontada aqui é o
 * Contrato Total (Empreiteiro + Reserva) de cada empreita-irmã, não o que
 * foi de fato pago — "quando uma empreita é criada o valor total dela
 * compromete o saldo" (pedido do Lucas, 24/08/2026). Nunca bloqueia nada:
 * o resultado pode ficar negativo, e a tela só mostra em vermelho.
 *
 * Só conta empreitas CRIADAS ANTES da atual (`criadoEmAtual`, empate por
 * id) — uma empreita nunca desconta de si mesma, e a ordem de criação é a
 * mesma fila que decide "quem chegou primeiro" no orçamento da etapa.
 *
 * Continua devolvendo `Map<eapId, PorTipo>` (5 categorias) mesmo com cada
 * ITEM só tendo uma categoria — o orçado da EAP em si continua sendo por
 * categoria, e duas empreitas diferentes podem comprometer categorias
 * diferentes do mesmo item da EAP.
 */
/**
 * Empreitas "criadas antes" da atual (empate por id) — mesma fila usada
 * tanto pelo Saldo disp. (R$) quanto pela Qtde. disp. (física): quem
 * chegou primeiro consome do recurso compartilhado (orçado da categoria,
 * ou quantidade física do item) antes de quem chegou depois.
 */
function empreitaFoiCriadaAntes(
  sibling: ResumoContratoEmpreita,
  empreitaIdAtual: string,
  criadoEmAtual: string,
): boolean {
  if (sibling.id === empreitaIdAtual) return false;
  if (!criadoEmAtual) return true; // empreita atual ainda sem data (nova) — todas as existentes contam como "antes"
  if (!sibling.criadoEm) return false;
  if (sibling.criadoEm !== criadoEmAtual) return sibling.criadoEm < criadoEmAtual;
  return sibling.id < empreitaIdAtual;
}

export function calcularSaldoDisponivelPorEap(
  itensEap: ItemEap[],
  cabecalhoEap: CabecalhoEapSnapshot | null | undefined,
  siblings: ResumoContratoEmpreita[],
  empreitaIdAtual: string,
  criadoEmAtual: string,
): Map<string, PorTipo> {
  const orcadoPorId = calcularOrcadoDaEap(itensEap, cabecalhoEap);

  const consumido = new Map<string, PorTipo>();
  for (const sibling of siblings) {
    if (!empreitaFoiCriadaAntes(sibling, empreitaIdAtual, criadoEmAtual)) continue;
    for (const item of sibling.itens) {
      if (!item.eapId || !item.tipo) continue;
      if (!consumido.has(item.eapId)) consumido.set(item.eapId, criarVazioPorTipo());
      const porTipo = consumido.get(item.eapId)!;
      porTipo[item.tipo] += (Number(item.contratoEmp) || 0) + (Number(item.contratoReserva) || 0);
    }
  }

  const resultado = new Map<string, PorTipo>();
  for (const [eapId, orcado] of orcadoPorId) {
    const usado = consumido.get(eapId) ?? criarVazioPorTipo();
    const saldo = criarVazioPorTipo();
    TIPOS_CUSTO.forEach((t) => {
      saldo[t.chave] = (Number(orcado.totalPorTipo[t.chave]) || 0) - (Number(usado[t.chave]) || 0);
    });
    resultado.set(eapId, saldo);
  }
  return resultado;
}

export type SituacaoMedicaoLinha = 'pagamento' | 'concluido' | 'andamento' | null;

/**
 * Cor de cada serviço na fase de medição (19/09/2026, pedido dos usuários):
 *  - `pagamento` (azul): o rascunho do pagamento do período tem valor (do
 *    empreiteiro OU da reserva) — prevalece sobre as outras;
 *  - `concluido` (verde claro): 100% medido;
 *  - `andamento` (amarelo claro): medição iniciada e incompleta (> 0% e < 100%);
 *  - `null`: sem medição — sem cor.
 */
export function classificarSituacaoMedicao(linha: LinhaEmpreitaEstendida): SituacaoMedicaoLinha {
  if (linha.pagamentoDraftTotal > 0.005) return 'pagamento';
  if (linha.atual >= 100) return 'concluido';
  if (linha.atual > 0) return 'andamento';
  return null;
}

/**
 * "Lançar reservas" (19/09/2026, pedido dos usuários): para cada serviço com
 * a reserva VAZIA (`null`; zero digitado conta como preenchido), sugere
 * reserva = max(0, saldo disponível da etapa/categoria − contrato do
 * empreiteiro do serviço). Reservas já digitadas nunca são sobrescritas.
 *
 * Vários serviços da MESMA etapa e categoria disputam o mesmo saldo: o
 * saldo vai sendo consumido na ordem das linhas (contrato + reserva de cada
 * uma), senão duas linhas "reservariam" o mesmo dinheiro. Serviço sem etapa,
 * sem categoria ou sem contrato do empreiteiro (> 0) é ignorado — não há de
 * onde tirar a reserva.
 *
 * Devolve só as reservas a lançar (id do serviço → valor, já arredondado a
 * centavos e maior que zero).
 */
export function calcularReservasSugeridas(
  itens: ItemEmpreita[],
  saldoDispPorEap: Map<string, PorTipo>,
): Map<string, number> {
  const restante = new Map<string, number>();
  const sugeridas = new Map<string, number>();

  for (const item of itens) {
    if (!item.eapId || !item.tipo) continue;
    const chave = `${item.eapId}|${item.tipo}`;
    if (!restante.has(chave)) restante.set(chave, Number(saldoDispPorEap.get(item.eapId)?.[item.tipo]) || 0);

    const contratoEmp = Number(item.contratoEmp) || 0;
    if (item.contratoReserva === null) {
      if (contratoEmp <= 0) continue;
      const reserva = Math.round(Math.max(0, restante.get(chave)! - contratoEmp) * 100) / 100;
      if (reserva > 0) sugeridas.set(item.id, reserva);
      restante.set(chave, restante.get(chave)! - contratoEmp - reserva);
    } else {
      restante.set(chave, restante.get(chave)! - contratoEmp - (Number(item.contratoReserva) || 0));
    }
  }
  return sugeridas;
}

/**
 * Qtde. disp. (25/08/2026, pedido do Lucas) — mesma ideia do Saldo disp.,
 * mas em quantidade física: `item.qtde` (da EAP) menos a quantidade
 * contratada de empreitas anteriores no MESMO item da EAP. Ao contrário
 * do Saldo disp., não é por categoria — a quantidade física é um recurso
 * só, comum a todas as categorias que porventura contratem pedaços do
 * mesmo item (ex.: mão de obra e material do mesmo item disputam a
 * mesma quantidade física, não orçamentos separados).
 */
export function calcularQtdeDisponivelPorEap(
  itensEap: ItemEap[],
  siblings: ResumoContratoEmpreita[],
  empreitaIdAtual: string,
  criadoEmAtual: string,
): Map<string, number> {
  const consumido = new Map<string, number>();
  for (const sibling of siblings) {
    if (!empreitaFoiCriadaAntes(sibling, empreitaIdAtual, criadoEmAtual)) continue;
    for (const item of sibling.itens) {
      if (!item.eapId) continue;
      consumido.set(item.eapId, (consumido.get(item.eapId) ?? 0) + (Number(item.qtdeContratada) || 0));
    }
  }

  const resultado = new Map<string, number>();
  for (const itemEap of itensEap) {
    if (!itemEap?.id) continue;
    const usado = consumido.get(itemEap.id) ?? 0;
    resultado.set(itemEap.id, (Number(itemEap.qtde) || 0) - usado);
  }
  return resultado;
}

/**
 * "Já pago" + Divergência, por linha de serviço (`ItemEmpreita.id`) —
 * replay de todos os pagamentos CONFIRMADOS já gerados por esta empreita
 * (pendentes ficam de fora, mesma regra do resto do sistema: um
 * pagamento pendente ainda não é dinheiro de verdade). A ordem dos
 * pagamentos não afeta o resultado — Divergência é uma soma comutativa de
 * (medido − liberado), sem clamp (pedido do Lucas, 25/08/2026: "a sobra
 * seria quando o pagamento liberado for menor do que o medido... se a
 * medição aferiu que ele pode receber 250, mas o pagamento foi de apenas
 * 200 então fica uma sobra de 50 reais" — e pode ir negativa se o
 * empreiteiro recebeu adiantado).
 */
export function calcularJaPagoPorLinha(pagamentosConfirmados: Pagamento[]): Map<string, JaPagoLinha> {
  interface Acumulador {
    empreiteiro: number;
    reserva: number;
    divergencia: number;
  }
  const acumulado = new Map<string, Acumulador>();

  for (const pagamento of pagamentosConfirmados) {
    for (const item of expandirItensPagamento(pagamento)) {
      if (!item.empreitaItemId) continue;

      if (!acumulado.has(item.empreitaItemId)) {
        acumulado.set(item.empreitaItemId, { empreiteiro: 0, reserva: 0, divergencia: 0 });
      }
      const acc = acumulado.get(item.empreitaItemId)!;

      if (item.parcela === 'reserva') {
        acc.reserva += item.valorCalculado;
      } else if (item.parcela === 'empreiteiro') {
        acc.empreiteiro += item.valorCalculado;
        acc.divergencia += (item.valorReferencia ?? 0) - item.valorCalculado;
      }
      // parcela null (pagamento de empreita gerado pelo código antigo,
      // antes desta coluna existir): não é possível saber se era
      // empreiteiro ou reserva, então fica de fora do replay — o
      // pagamento ainda conta normalmente como Realizado em todo o resto
      // do sistema, só não aparece em "Já pago"/Divergência desta tela.
    }
  }

  const resultado = new Map<string, JaPagoLinha>();
  for (const [empreitaItemId, acc] of acumulado) {
    resultado.set(empreitaItemId, {
      empreiteiro: acc.empreiteiro,
      reserva: acc.reserva,
      divergencia: acc.divergencia,
      total: acc.empreiteiro + acc.reserva,
    });
  }
  return resultado;
}

const JA_PAGO_VAZIO: JaPagoLinha = { empreiteiro: 0, reserva: 0, divergencia: 0, total: 0 };

/** `calcularLinhaEmpreita` + Saldo disp., Já pago/Divergência, o rascunho efetivo de Pagamento, e o Saldo após pagamento. */
export function calcularLinhaEmpreitaEstendida(
  item: ItemEmpreita,
  orcadoPorId: Map<string, OrcadoEap>,
  saldoDispPorEap: Map<string, PorTipo>,
  qtdeDispPorEap: Map<string, number>,
  jaPagoPorItem: Map<string, JaPagoLinha>,
): LinhaEmpreitaEstendida {
  const linha = calcularLinhaEmpreita(item, orcadoPorId);

  const saldoDispBase = saldoDispPorEap.get(item.eapId) ?? criarVazioPorTipo();
  const saldoDisp = Number(saldoDispBase[item.tipo]) || 0;
  const qtdeDisp = Number(qtdeDispPorEap.get(item.eapId)) || 0;

  const jaPago = jaPagoPorItem.get(item.id) ?? JA_PAGO_VAZIO;

  // "Medido" (26/09/2026, pedido do Lucas) — o ACUMULADO do serviço (períodos
  // já fechados) vezes o valor contratado: `medido` sobre o valor do
  // empreiteiro (tela não simplificada) e `medidoContrato` sobre o total do
  // contrato (simplificada). Fica na coluna "Já pago", pra comparar com o que
  // já foi pago; substituiu o antigo "quanto falta pagar" e a Divergência.
  const medido = (linha.acumulado / 100) * (Number(item.contratoEmp) || 0);
  const medidoContrato = (linha.acumulado / 100) * linha.valorTotal;

  // "Disponível" da coluna Pagamento (26/09/2026, pedido do Lucas): o que o empreiteiro já
  // tem direito a receber pela medição — (acumulado + avanço) × valor do empreiteiro − já pago
  // ao empreiteiro. Negativo = recebeu adiantado. `disponivelContrato` é a versão da tela
  // simplificada (sobre o total do contrato e o total já pago).
  const medidoAteAgora = (linha.acumulado + linha.avanco) / 100;
  const disponivelEmp = medidoAteAgora * (Number(item.contratoEmp) || 0) - jaPago.empreiteiro;
  const disponivelContrato = medidoAteAgora * linha.valorTotal - jaPago.total;
  // Pré-preenchimento do Pagamento (26/09/2026, pedido do Lucas): empreiteiro = disponível (emp.);
  // reserva = (acumulado + avanço) × reserva contratada − reserva já paga. Nunca negativo
  // (adiantamento não vira "pagamento negativo"). O usuário ainda pode digitar por cima.
  const pagamentoEmpPadrao = Math.max(0, disponivelEmp);
  const pagamentoReservaPadrao = Math.max(
    0,
    medidoAteAgora * (Number(item.contratoReserva) || 0) - jaPago.reserva,
  );

  // null/undefined = sem sobrescrita, herda o calculado pela engine.
  const overrideEmp = item.pagamentoEmp;
  const overrideReserva = item.pagamentoReserva;
  const pagamentoEmpDraft =
    overrideEmp === null || overrideEmp === undefined ? pagamentoEmpPadrao : Number(overrideEmp) || 0;
  const pagamentoReservaDraft =
    overrideReserva === null || overrideReserva === undefined ? pagamentoReservaPadrao : Number(overrideReserva) || 0;
  const pagamentoDraftTotal = pagamentoEmpDraft + pagamentoReservaDraft;

  const saldoAposPagamentoEtapa = saldoDisp - linha.contrato;
  const saldoAposPagamentoEmp = (Number(item.contratoEmp) || 0) - jaPago.empreiteiro - pagamentoEmpDraft;
  const saldoAposPagamentoReserva = (Number(item.contratoReserva) || 0) - jaPago.reserva - pagamentoReservaDraft;
  const saldoAposPagamentoTotal = saldoAposPagamentoEmp + saldoAposPagamentoReserva;
  // "Medição" do Saldo remanescente (26/09/2026): o que falta medir — (100% − medição atual) × total do contrato.
  const saldoMedicao = (1 - medidoAteAgora) * linha.valorTotal;

  return {
    ...linha,
    saldoDisp,
    qtdeDisp,
    jaPago,
    medido,
    medidoContrato,
    disponivelEmp,
    disponivelContrato,
    saldoMedicao,
    pagamentoEmpDraft,
    pagamentoReservaDraft,
    pagamentoDraftTotal,
    saldoAposPagamentoEtapa,
    saldoAposPagamentoEmp,
    saldoAposPagamentoReserva,
    saldoAposPagamentoTotal,
  };
}

export function calcularTotaisEmpreitaEstendida(
  itens: ItemEmpreita[],
  orcadoPorId: Map<string, OrcadoEap>,
  saldoDispPorEap: Map<string, PorTipo>,
  qtdeDispPorEap: Map<string, number>,
  jaPagoPorItem: Map<string, JaPagoLinha>,
): TotaisEmpreitaEstendida {
  const base = calcularTotaisEmpreita(itens, orcadoPorId);

  return itens.reduce<TotaisEmpreitaEstendida>(
    (totais, item) => {
      const linha = calcularLinhaEmpreitaEstendida(item, orcadoPorId, saldoDispPorEap, qtdeDispPorEap, jaPagoPorItem);
      return {
        ...totais,
        jaPagoEmpreiteiro: totais.jaPagoEmpreiteiro + linha.jaPago.empreiteiro,
        jaPagoReserva: totais.jaPagoReserva + linha.jaPago.reserva,
        jaPagoDivergencia: totais.jaPagoDivergencia + linha.jaPago.divergencia,
        jaPagoTotal: totais.jaPagoTotal + linha.jaPago.total,
        medidoTotal: totais.medidoTotal + linha.medido,
        medidoContratoTotal: totais.medidoContratoTotal + linha.medidoContrato,
        disponivelEmpTotal: totais.disponivelEmpTotal + linha.disponivelEmp,
        disponivelContratoTotal: totais.disponivelContratoTotal + linha.disponivelContrato,
        saldoMedicaoTotal: totais.saldoMedicaoTotal + linha.saldoMedicao,
        pagamentoDraftEmp: totais.pagamentoDraftEmp + linha.pagamentoEmpDraft,
        pagamentoDraftReserva: totais.pagamentoDraftReserva + linha.pagamentoReservaDraft,
        pagamentoDraftTotal: totais.pagamentoDraftTotal + linha.pagamentoDraftTotal,
        saldoAposPagamentoEmp: totais.saldoAposPagamentoEmp + linha.saldoAposPagamentoEmp,
        saldoAposPagamentoReserva: totais.saldoAposPagamentoReserva + linha.saldoAposPagamentoReserva,
        saldoAposPagamentoTotal: totais.saldoAposPagamentoTotal + linha.saldoAposPagamentoTotal,
      };
    },
    {
      ...base,
      jaPagoEmpreiteiro: 0,
      jaPagoReserva: 0,
      jaPagoDivergencia: 0,
      jaPagoTotal: 0,
      medidoTotal: 0,
      medidoContratoTotal: 0,
      disponivelEmpTotal: 0,
      disponivelContratoTotal: 0,
      saldoMedicaoTotal: 0,
      pagamentoDraftEmp: 0,
      pagamentoDraftReserva: 0,
      pagamentoDraftTotal: 0,
      saldoAposPagamentoEmp: 0,
      saldoAposPagamentoReserva: 0,
      saldoAposPagamentoTotal: 0,
    },
  );
}

// ---- Conversores do toggle R$ ⇄ % ⇄ Qtde (Medição de contrato) ----
// Mesma convenção dos toggles de 2 estados já existentes (Mapa/Medição/
// Cronograma): o valor gravado continua sempre percentual — isto é só
// conveniência de exibição/edição, client-side, nunca persistido.

export function pctParaQtde(pct: number, qtdeTotal: number): number {
  return qtdeTotal * ((Number(pct) || 0) / 100);
}

export function qtdeParaPct(qtde: number, qtdeTotal: number): number {
  return qtdeTotal > 0 ? ((Number(qtde) || 0) / qtdeTotal) * 100 : 0;
}

export function pctParaValorContrato(pct: number, contratoTotal: number): number {
  return contratoTotal * ((Number(pct) || 0) / 100);
}

export function valorContratoParaPct(valor: number, contratoTotal: number): number {
  return contratoTotal > 0 ? ((Number(valor) || 0) / contratoTotal) * 100 : 0;
}
