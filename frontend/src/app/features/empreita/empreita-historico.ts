/**
 * Histórico de medições de uma Empreita (26/09/2026, pedido do Lucas) — cada
 * "Realizar pagamento" gravou um Pagamento com o retrato da medição
 * (`medicaoSnapshot`) e os valores pagos por serviço (itens `empreiteiro`/`reserva`).
 * Este arquivo, sem Angular, faz duas coisas com essa cadeia de pagamentos:
 *
 *  1. `reconstruirMedicao`: remonta a linha da empreita COMO ESTAVA naquela medição
 *     (para mostrar a "empreita completa" do momento do pagamento);
 *  2. `recalcularHistorico`: editar ou apagar uma medição no meio da cadeia e
 *     recalcular as seguintes MANTENDO o avanço e os valores de pagamento de cada
 *     uma delas (só o acumulado/atual de cada medição posterior se desloca).
 */
import { Pagamento, ItemPagamento, ItemSnapshotMedicao, MedicaoSnapshotEmpreita } from '../pagamentos/pagamentos.models';
import { expandirItensPagamento } from '../pagamentos/pagamentos-calc';
import { calcularJaPagoPorLinha, calcularLinhaEmpreitaEstendida, limitarPercentual } from './empreita-engine';
import { ItemEmpreita, LinhaEmpreitaEstendida } from './empreita.models';

/** Ordem de criação: pelo número do pagamento (PG-0047 → 47); sem número, pela data de solicitação. */
export function ordenarPagamentosDaEmpreita(pagamentos: readonly Pagamento[]): Pagamento[] {
  const numero = (p: Pagamento): number => {
    const digitos = /(\d+)\s*$/.exec(p.numeroPagamento ?? '');
    return digitos ? Number(digitos[1]) : Number.NaN;
  };
  return [...pagamentos].sort((a, b) => {
    const na = numero(a);
    const nb = numero(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return (a.dataSolicitacao || '').localeCompare(b.dataSolicitacao || '');
  });
}

/** Valores pagos por serviço neste pagamento. */
export function pagoPorServico(pagamento: Pagamento): Map<string, { emp: number; reserva: number }> {
  const mapa = new Map<string, { emp: number; reserva: number }>();
  for (const item of expandirItensPagamento(pagamento)) {
    if (!item.empreitaItemId) continue;
    const atual = mapa.get(item.empreitaItemId) ?? { emp: 0, reserva: 0 };
    if (item.parcela === 'reserva') atual.reserva += item.valorCalculado;
    else if (item.parcela === 'empreiteiro') atual.emp += item.valorCalculado;
    mapa.set(item.empreitaItemId, atual);
  }
  return mapa;
}

/** Uma medição remontada: as linhas (uma por serviço do retrato) já calculadas pela engine da tela. */
export interface MedicaoReconstruida {
  pagamento: Pagamento;
  itens: ItemEmpreita[];
  linhas: LinhaEmpreitaEstendida[];
}

/**
 * Empreita como estava na medição `indice` de `ordenados` (já ordenada). "Anterior" = tudo o que os
 * pagamentos ANTERIORES pagaram (pendentes inclusive — já eram compromisso naquele momento); o
 * pagamento da própria medição entra como o "a pagar" preenchido.
 */
export function reconstruirMedicao(ordenados: readonly Pagamento[], indice: number): MedicaoReconstruida | null {
  const pagamento = ordenados[indice];
  const snapshot = pagamento?.medicaoSnapshot;
  if (!pagamento || !snapshot) return null;

  const anteriores = calcularJaPagoPorLinha(ordenados.slice(0, indice));
  const pagos = pagoPorServico(pagamento);

  const itens: ItemEmpreita[] = snapshot.itens.map((s) => {
    const pago = pagos.get(s.empreitaItemId) ?? { emp: 0, reserva: 0 };
    return {
      id: s.empreitaItemId,
      desc: s.desc,
      eapId: s.eapId,
      tipo: s.tipo as ItemEmpreita['tipo'],
      qtdeContratada: null,
      contratoEmp: s.contratoEmp,
      contratoReserva: s.contratoReserva,
      medicaoAcum: s.medicaoAcum,
      medicaoAtual: s.medicaoAtual,
      pagamentoEmp: pago.emp,
      pagamentoReserva: pago.reserva,
    };
  });

  const vazio = new Map();
  const linhas = itens.map((item) => calcularLinhaEmpreitaEstendida(item, vazio, vazio, vazio, anteriores));
  return { pagamento, itens, linhas };
}

// ---------------------------------------------------------------------------
// Editar / apagar uma medição e recalcular as seguintes
// ---------------------------------------------------------------------------

/** O que o usuário mudou num serviço da medição editada. */
export interface EdicaoServico {
  /** Nova medição atual (% acumulado da medição), 0–100. */
  atual: number;
  /** Novos valores pagos neste pagamento. */
  emp: number;
  reserva: number;
}

export interface ResultadoHistorico {
  /** Pagamentos que mudaram (editado + posteriores com snapshot deslocado). O apagado não entra aqui. */
  atualizados: Pagamento[];
  /** Quanto o acumulado ATUAL de cada serviço da empreita se desloca (some em `medicaoAcum`/`medicaoAtual`). */
  deslocamentoPorServico: Map<string, number>;
  /** Avisos de preenchimento (ex.: medição menor que a anterior, ficou acima de 100%). */
  avisos: string[];
}

function arredondar(valor: number): number {
  return Math.round(valor * 1e6) / 1e6;
}

/**
 * `alvoId` é o pagamento editado (com `edicoes`) ou apagado (`edicoes` = null). Cada serviço segue uma
 * cadeia: medição k tem `acum_k` (onde começou) e `atual_k`; a "folga" `acum_k − atual_{k-1}` (períodos
 * fechados sem pagamento) e o avanço `atual_k − acum_k` são PRESERVADOS nas medições posteriores — só o
 * ponto de partida muda.
 */
export function recalcularHistorico(
  ordenados: readonly Pagamento[],
  alvoId: string,
  edicoes: Map<string, EdicaoServico> | null,
): ResultadoHistorico {
  const avisos: string[] = [];
  const atualizados: Pagamento[] = [];

  // por serviço: { novoAtualAnterior, antigoAtualAnterior } da última medição já processada
  const estado = new Map<string, { novo: number; antigo: number }>();

  for (const pagamento of ordenados) {
    const snapshot = pagamento.medicaoSnapshot;
    const ehAlvo = pagamento.id === alvoId;
    if (!snapshot) continue;

    const itensNovos: ItemSnapshotMedicao[] = [];
    for (const s of snapshot.itens) {
      const anterior = estado.get(s.empreitaItemId);
      const folga = anterior ? s.medicaoAcum - anterior.antigo : 0;
      const novoAcum = anterior ? anterior.novo + folga : s.medicaoAcum;

      if (ehAlvo && !edicoes) {
        // Apagada: o avanço dela some; a folga dela continua contando para a próxima medição.
        estado.set(s.empreitaItemId, { novo: novoAcum, antigo: s.medicaoAtual });
        continue;
      }

      let avanco = s.medicaoAtual - s.medicaoAcum;
      const edicao = ehAlvo ? edicoes?.get(s.empreitaItemId) : undefined;
      if (edicao) {
        avanco = edicao.atual - s.medicaoAcum;
        if (avanco < 0) {
          avisos.push(`"${s.desc || 'Serviço'}": a medição ficou menor que a acumulada anterior (${s.medicaoAcum}%).`);
          avanco = 0;
        }
      }
      let novoAtual = novoAcum + avanco;
      if (novoAtual > 100.0001) {
        avisos.push(`"${s.desc || 'Serviço'}" passou de 100% em ${pagamento.numeroPagamento || 'uma medição'}.`);
      }
      novoAtual = limitarPercentual(novoAtual);

      estado.set(s.empreitaItemId, { novo: novoAtual, antigo: s.medicaoAtual });
      itensNovos.push({ ...s, medicaoAcum: arredondar(novoAcum), medicaoAtual: arredondar(novoAtual) });
    }

    if (ehAlvo && !edicoes) continue;

    const mudouSnapshot = itensNovos.some((n, i) => {
      const s = snapshot.itens[i];
      return n.medicaoAcum !== s.medicaoAcum || n.medicaoAtual !== s.medicaoAtual;
    });

    if (ehAlvo && edicoes) {
      atualizados.push(aplicarEdicaoNoPagamento(pagamento, { ...snapshot, itens: itensNovos }, edicoes));
    } else if (mudouSnapshot) {
      atualizados.push({ ...pagamento, medicaoSnapshot: { ...snapshot, itens: itensNovos } });
    }
  }

  const deslocamentoPorServico = new Map<string, number>();
  for (const [id, e] of estado) deslocamentoPorServico.set(id, arredondar(e.novo - e.antigo));

  return { atualizados, deslocamentoPorServico, avisos };
}

/** Novo retrato + novos valores pagos por serviço no próprio pagamento editado. */
function aplicarEdicaoNoPagamento(
  pagamento: Pagamento,
  snapshot: MedicaoSnapshotEmpreita,
  edicoes: Map<string, EdicaoServico>,
): Pagamento {
  const restantes: ItemPagamento[] = pagamento.itens.filter(
    (item) => !(item.empreitaItemId && edicoes.has(item.empreitaItemId) && (item.parcela === 'empreiteiro' || item.parcela === 'reserva')),
  );

  const novos: ItemPagamento[] = [];
  for (const [empreitaItemId, edicao] of edicoes) {
    const modelo =
      pagamento.itens.find((i) => i.empreitaItemId === empreitaItemId) ??
      undefined;
    const retrato = snapshot.itens.find((s) => s.empreitaItemId === empreitaItemId);
    const base = {
      descricao: modelo?.descricao ?? retrato?.desc ?? 'Serviço',
      tipo: modelo?.tipo ?? retrato?.tipo ?? '',
      eapId: modelo?.eapId ?? retrato?.eapId ?? '',
      modoValor: 'valor' as const,
      empreitaItemId,
    };
    const id = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));
    if (edicao.emp > 0) {
      const anterior = pagamento.itens.find((i) => i.empreitaItemId === empreitaItemId && i.parcela === 'empreiteiro');
      novos.push({ ...base, id: anterior?.id ?? id(), valor: edicao.emp, parcela: 'empreiteiro', valorReferencia: edicao.emp });
    }
    if (edicao.reserva > 0) {
      const anterior = pagamento.itens.find((i) => i.empreitaItemId === empreitaItemId && i.parcela === 'reserva');
      novos.push({ ...base, id: anterior?.id ?? id(), valor: edicao.reserva, parcela: 'reserva', valorReferencia: edicao.reserva });
    }
  }

  const itens = [...restantes, ...novos];
  const valorTotal = itens.reduce((soma, i) => soma + (Number(i.valor) || 0), 0);
  return { ...pagamento, itens, valorTotal: arredondar(valorTotal), medicaoSnapshot: snapshot };
}
