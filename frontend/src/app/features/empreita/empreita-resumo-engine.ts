/**
 * Cálculos do "Resumo para o profissional" (19/09/2026, pedido dos usuários):
 * PDF das empreitas selecionadas para entregar ao profissional. Puro (sem
 * Angular): a tela de impressão só apresenta o que sai daqui.
 *
 * Regra de visibilidade — o que o profissional vê depende das opções:
 *  - "Valores do profissional" mostra a coluna/soma do que é dele;
 *  - "Reservas" mostra a coluna/soma da reserva;
 *  - nenhuma das duas marcada = sem discriminação: um valor único que soma
 *    os dois lados;
 *  - todo total, "já pago" e saldo é sempre a soma dos lados VISÍVEIS, pra
 *    a conta bater com o que está na página (ex.: só "Reservas" marcada →
 *    total/pago/saldo são só da reserva).
 * Nunca entra o orçado da EAP nem o saldo disponível da etapa (dados internos).
 */
import { expandirItensPagamento } from '../pagamentos/pagamentos-calc';
import { MedicaoSnapshotEmpreita, Pagamento } from '../pagamentos/pagamentos.models';
import { ItemEmpreita, LinhaEmpreitaEstendida } from './empreita.models';

export interface OpcoesResumo {
  pagamentos: boolean;
  medicoes: boolean;
  medicaoAtual: boolean;
  reservas: boolean;
  valoresEmpreiteiro: boolean;
}

export const OPCOES_RESUMO_PADRAO: OpcoesResumo = {
  pagamentos: true,
  medicoes: false,
  medicaoAtual: true,
  reservas: false,
  valoresEmpreiteiro: true,
};

export const CHAVES_OPCOES_RESUMO = Object.keys(OPCOES_RESUMO_PADRAO) as (keyof OpcoesResumo)[];

/** Lê `?opcoes=a,b` da tela de impressão; chave desconhecida é ignorada. */
export function lerOpcoesResumo(texto: string | null): OpcoesResumo {
  const marcadas = new Set((texto ?? '').split(',').map((t) => t.trim()));
  return {
    pagamentos: marcadas.has('pagamentos'),
    medicoes: marcadas.has('medicoes'),
    medicaoAtual: marcadas.has('medicaoAtual'),
    reservas: marcadas.has('reservas'),
    valoresEmpreiteiro: marcadas.has('valoresEmpreiteiro'),
  };
}

export interface LadosResumo {
  /** O valor do profissional entra nas somas. */
  somaEmp: boolean;
  /** A reserva entra nas somas. */
  somaReserva: boolean;
  /** Mostra a coluna própria do profissional. */
  colunaEmp: boolean;
  /** Mostra a coluna própria da reserva. */
  colunaReserva: boolean;
}

export function ladosDoResumo(opcoes: OpcoesResumo): LadosResumo {
  const discriminar = opcoes.reservas || opcoes.valoresEmpreiteiro;
  return {
    somaEmp: discriminar ? opcoes.valoresEmpreiteiro : true,
    somaReserva: discriminar ? opcoes.reservas : true,
    colunaEmp: opcoes.valoresEmpreiteiro,
    colunaReserva: opcoes.reservas,
  };
}

function somar(lados: LadosResumo, emp: number, reserva: number): number {
  return (lados.somaEmp ? emp : 0) + (lados.somaReserva ? reserva : 0);
}

export interface LinhaResumoServico {
  id: string;
  /** Descrição do serviço; se estiver em branco, cai no rótulo da etapa. */
  servico: string;
  etapa: string;
  pctMedido: number;
  valorEmp: number;
  valorReserva: number;
  total: number;
  pago: number;
  saldo: number;
}

/** Uma linha por serviço, na ordem da empreita. `linhas[i]` é o cálculo de `itens[i]`. */
export function montarLinhasServicos(
  itens: ItemEmpreita[],
  linhas: LinhaEmpreitaEstendida[],
  rotuloEtapa: (eapId: string) => string,
  lados: LadosResumo,
): LinhaResumoServico[] {
  return itens.map((item, i) => {
    const linha = linhas[i];
    const etapa = item.eapId ? rotuloEtapa(item.eapId) : '';
    const total = somar(lados, linha.valorEmp, linha.valorReserva);
    const pago = somar(lados, linha.jaPago.empreiteiro, linha.jaPago.reserva);
    return {
      id: item.id,
      servico: item.desc.trim() || etapa || '—',
      etapa: item.desc.trim() ? etapa : '',
      pctMedido: linha.atual,
      valorEmp: linha.valorEmp,
      valorReserva: linha.valorReserva,
      total,
      pago,
      saldo: total - pago,
    };
  });
}

export interface TotaisResumo {
  total: number;
  pago: number;
  saldo: number;
  valorEmp: number;
  valorReserva: number;
}

export function totalizarServicos(servicos: LinhaResumoServico[]): TotaisResumo {
  const t: TotaisResumo = { total: 0, pago: 0, saldo: 0, valorEmp: 0, valorReserva: 0 };
  for (const s of servicos) {
    t.total += s.total;
    t.pago += s.pago;
    t.saldo += s.saldo;
    t.valorEmp += s.valorEmp;
    t.valorReserva += s.valorReserva;
  }
  return t;
}

/** % de medição física da empreita, ponderada pelo contrato do profissional (mesma conta da lista de empreitas). `null` sem contrato. */
export function pctFisicoPonderado(linhas: LinhaEmpreitaEstendida[]): number | null {
  let soma = 0;
  let contrato = 0;
  for (const l of linhas) {
    if (l.valorEmp <= 0) continue;
    soma += l.atual * l.valorEmp;
    contrato += l.valorEmp;
  }
  return contrato > 0 ? soma / contrato : null;
}

/** Acumulado/atual ponderados por contrato do profissional, a partir do retrato guardado num pagamento. */
export function medicaoPonderada(
  snapshot: MedicaoSnapshotEmpreita | null,
): { acumulado: number | null; atual: number | null } {
  if (!snapshot) return { acumulado: null, atual: null };

  let somaAcum = 0;
  let somaAtual = 0;
  let somaContrato = 0;
  for (const item of snapshot.itens) {
    const contrato = item.contratoEmp || 0;
    if (contrato <= 0) continue;
    somaAcum += item.medicaoAcum * contrato;
    somaAtual += item.medicaoAtual * contrato;
    somaContrato += contrato;
  }
  return somaContrato > 0
    ? { acumulado: somaAcum / somaContrato, atual: somaAtual / somaContrato }
    : { acumulado: null, atual: null };
}

export interface LinhaResumoPagamento {
  id: string;
  numero: string;
  dataSolicitacao: string;
  dataPagamento: string;
  status: string;
  valorEmp: number;
  valorReserva: number;
  total: number;
}

/** Pagamentos da empreita por data (do mais antigo ao mais novo), com os valores dos lados visíveis. */
export function montarLinhasPagamentos(pagamentos: Pagamento[], lados: LadosResumo): LinhaResumoPagamento[] {
  return [...pagamentos]
    .sort((a, b) => (a.dataPagamento || a.dataSolicitacao || '').localeCompare(b.dataPagamento || b.dataSolicitacao || ''))
    .map((pagamento) => {
      let valorEmp = 0;
      let valorReserva = 0;
      for (const item of expandirItensPagamento(pagamento)) {
        if (item.parcela === 'reserva') valorReserva += item.valorCalculado;
        else if (item.parcela === 'empreiteiro') valorEmp += item.valorCalculado;
      }
      return {
        id: pagamento.id,
        numero: pagamento.numeroPagamento,
        dataSolicitacao: pagamento.dataSolicitacao,
        dataPagamento: pagamento.dataPagamento,
        status: pagamento.status,
        valorEmp,
        valorReserva,
        total: somar(lados, valorEmp, valorReserva),
      };
    });
}

export interface LinhaResumoMedicaoPeriodo {
  id: string;
  servico: string;
  acumulado: number;
  atual: number;
  avanco: number;
  valorEmp: number;
  valorReserva: number;
  total: number;
}

/**
 * "Medição atual": a posição da medição por serviço — só os serviços que já
 * têm medição (atual > 0); os sem medição não aparecem. Mostra o acumulado
 * (períodos já fechados), o medido até agora e o avanço do período em aberto
 * (zero quando o período acabou de ser fechado), com os valores desse período.
 */
export function montarMedicaoAtual(
  itens: ItemEmpreita[],
  linhas: LinhaEmpreitaEstendida[],
  rotulo: (indice: number) => string,
  lados: LadosResumo,
): LinhaResumoMedicaoPeriodo[] {
  const resultado: LinhaResumoMedicaoPeriodo[] = [];
  itens.forEach((item, i) => {
    const l = linhas[i];
    if (!(l.atual > 0)) return;
    resultado.push({
      id: item.id,
      servico: rotulo(i),
      acumulado: l.acumulado,
      atual: l.atual,
      avanco: l.avanco,
      valorEmp: l.pagamentoEmpDraft,
      valorReserva: l.pagamentoReservaDraft,
      total: somar(lados, l.pagamentoEmpDraft, l.pagamentoReservaDraft),
    });
  });
  return resultado;
}

export interface MedicaoHistorica {
  pagamentoId: string;
  numero: string;
  data: string;
  pctAcumulado: number | null;
  pctAtual: number | null;
  servicos: { id: string; servico: string; acumulado: number; atual: number; avanco: number }[];
}

/**
 * Histórico de medições: uma por pagamento que guardou o retrato da medição.
 * Cada medição lista SÓ os serviços que avançaram naquela medição; medição
 * em que nenhum serviço avançou não aparece.
 */
export function montarHistoricoMedicoes(
  pagamentos: Pagamento[],
  rotuloServico: (item: { desc: string; eapId: string }) => string,
): MedicaoHistorica[] {
  return [...pagamentos]
    .filter((p) => !!p.medicaoSnapshot)
    .sort((a, b) => (a.dataSolicitacao || a.dataPagamento || '').localeCompare(b.dataSolicitacao || b.dataPagamento || ''))
    .map((p) => {
      const snapshot = p.medicaoSnapshot!;
      const { acumulado, atual } = medicaoPonderada(snapshot);
      return {
        pagamentoId: p.id,
        numero: p.numeroPagamento,
        data: p.dataSolicitacao || p.dataPagamento,
        pctAcumulado: acumulado,
        pctAtual: atual,
        servicos: (snapshot.itens ?? [])
          .map((item) => ({
            id: item.empreitaItemId,
            servico: rotuloServico(item),
            acumulado: Number(item.medicaoAcum) || 0,
            atual: Number(item.medicaoAtual) || 0,
            avanco: Math.max(0, (Number(item.medicaoAtual) || 0) - (Number(item.medicaoAcum) || 0)),
          }))
          .filter((servico) => servico.avanco > 0),
      };
    })
    .filter((medicao) => medicao.servicos.length > 0);
}

/**
 * Alternativa ao histórico quando os pagamentos não guardaram o retrato da
 * medição (pagamentos antigos): o que já está medido e fechado por serviço
 * (acumulado > 0), que é a soma das medições fechadas. Só serviços com medição.
 */
export function montarAcumuladoFechado(
  itens: ItemEmpreita[],
  linhas: LinhaEmpreitaEstendida[],
  rotulo: (indice: number) => string,
): { id: string; servico: string; acumulado: number }[] {
  const resultado: { id: string; servico: string; acumulado: number }[] = [];
  itens.forEach((item, i) => {
    if (linhas[i].acumulado > 0) resultado.push({ id: item.id, servico: rotulo(i), acumulado: linhas[i].acumulado });
  });
  return resultado;
}
