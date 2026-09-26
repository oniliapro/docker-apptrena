import { Component, computed, input, output } from '@angular/core';

import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { expandirItensPagamento } from '../pagamentos/pagamentos-calc';
import { MedicaoSnapshotEmpreita, Pagamento, StatusPagamento } from '../pagamentos/pagamentos.models';
import { ordenarPagamentosDaEmpreita } from './empreita-historico';

/**
 * Uma barra de medição: `acum` = o que já estava medido/pago ANTES deste pagamento (barra azul) e
 * `atual` = a situação neste pagamento (o que passa do acumulado é o avanço, em amarelo, e o número
 * exibido é o `atual`).
 */
interface BarraMedicao {
  acum: number;
  atual: number;
}

/** Barras empilhadas de uma medição: por parcela do contrato e no total. `null` = sem dado. */
interface PercentuaisEmpilhados {
  emp: BarraMedicao | null;
  reserva: BarraMedicao | null;
  total: BarraMedicao | null;
}

interface LinhaRelatorioPagamento {
  id: string;
  pagamento: Pagamento;
  numeroPagamento: string;
  /** Quem recebeu ESTE pagamento — pode ser outra pessoa que não o profissional da empreita (muda ao longo da obra). */
  beneficiado: string;
  dataSolicitacao: string;
  dataPagamento: string;
  status: StatusPagamento;
  empreiteiro: number;
  reserva: number;
  total: number;
  saldoEmpreita: number;
  /** `null` pra pagamentos gerados antes desta feature existir (sem snapshot gravado). */
  snapshot: MedicaoSnapshotEmpreita | null;
  /** Valor do CONTRATO no momento deste pagamento — do snapshot quando existe, senão cai pro atual. */
  contratoTotalNoMomento: number;
  /** Medição física (%): a medição atual de cada serviço, ponderada pelo contrato da parcela. */
  fisica: PercentuaisEmpilhados;
  /** Medição financeira (%): quanto do contrato da parcela já foi pago até este pagamento, inclusive. */
  financeira: PercentuaisEmpilhados;
}

/**
 * "Pagamentos registrados" — a tabela das medições/pagamentos de uma empreita. Componente
 * standalone e SEM store própria (só `input()`s) de propósito: renderiza idêntico na lista de
 * empreitas da obra (onde agora mora, 26/09/2026) e no PDF (`empreita-imprimir.html`).
 *
 * Colunas (26/09/2026, pedido do Lucas): Nº · Beneficiado (o pagamento pode ir para outra pessoa
 * que não o profissional da empreita) · Datas empilhadas (solicitação/pagamento) · Medição física ·
 * Medição financeira · Valor pago · Ações (editar/confirmar/tornar pendente, só na tela).
 *
 * "Simplificar" = `mostrarEmpreiteiro`/`mostrarReserva` desligados e `mostrarTotal` ligado: as
 * medições e o valor pago mostram só o Total. Sem "Total" marcado, pagamentos sem valor nas
 * parcelas marcadas ficam de fora (opções do PDF, ver `empreita-pdf-opcoes.ts`).
 *
 * "Saldo empreita" é o saldo da empreita ESPECÍFICA: `Contrato Total − soma paga (Empreiteiro +
 * Reserva) até este pagamento, inclusive` — pendentes contam, porque já são dinheiro comprometido.
 */
@Component({
  selector: 'app-empreita-relatorio-pagamentos',
  templateUrl: './empreita-relatorio-pagamentos.html',
  styleUrl: './empreita-relatorio-pagamentos.scss',
})
export class EmpreitaRelatorioPagamentos {
  readonly pagamentos = input<Pagamento[]>([]);
  readonly contratoTotalEmpreita = input<number>(0);

  readonly mostrarEmpreiteiro = input(true);
  readonly mostrarReserva = input(true);
  readonly mostrarTotal = input(true);

  /** Coluna de ações (editar/confirmar/tornar pendente) e linha clicável — só na tela, nunca no PDF. */
  readonly interativo = input(false);

  /** Clique na linha: abre a "empreita completa" daquela medição. */
  readonly abrirMedicao = output<Pagamento>();
  readonly editarPagamento = output<Pagamento>();
  readonly confirmarPagamento = output<Pagamento>();
  readonly tornarPendente = output<Pagamento>();
  /** "Realizar medição": leva à empreita completa já com a medição aberta (ver `Empreita.realizarMedicaoAoAbrir`). */
  readonly realizarMedicao = output<void>();

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;

  protected readonly linhas = computed<LinhaRelatorioPagamento[]>(() => {
    const contratoTotal = this.contratoTotalEmpreita();
    const ordenados = ordenarPagamentosDaEmpreita(this.pagamentos());

    let acumuladoEmp = 0;
    let acumuladoReserva = 0;
    return ordenados.map((pagamento) => {
      const empAntes = acumuladoEmp;
      const reservaAntes = acumuladoReserva;
      let empreiteiro = 0;
      let reserva = 0;
      for (const item of expandirItensPagamento(pagamento)) {
        if (item.parcela === 'reserva') reserva += item.valorCalculado;
        else if (item.parcela === 'empreiteiro') empreiteiro += item.valorCalculado;
      }
      const total = empreiteiro + reserva;
      acumuladoEmp += empreiteiro;
      acumuladoReserva += reserva;

      const snapshot = pagamento.medicaoSnapshot ?? null;
      const contratoEmp = snapshot ? snapshot.itens.reduce((s, i) => s + (i.contratoEmp || 0), 0) : 0;
      const contratoReserva = snapshot ? snapshot.itens.reduce((s, i) => s + (i.contratoReserva || 0), 0) : 0;

      return {
        id: pagamento.id,
        pagamento,
        numeroPagamento: pagamento.numeroPagamento,
        beneficiado: pagamento.fornecedor,
        dataSolicitacao: pagamento.dataSolicitacao,
        dataPagamento: pagamento.dataPagamento,
        status: pagamento.status,
        empreiteiro,
        reserva,
        total,
        saldoEmpreita: contratoTotal - (acumuladoEmp + acumuladoReserva),
        snapshot,
        contratoTotalNoMomento: snapshot ? snapshot.contratoTotalEmpreita : contratoTotal,
        fisica: this.medicaoFisica(snapshot),
        // Financeira: azul = pago ANTES deste pagamento; o pedaço amarelo = o que este pagamento acrescenta.
        financeira: {
          emp: contratoEmp > 0 ? { acum: (empAntes / contratoEmp) * 100, atual: (acumuladoEmp / contratoEmp) * 100 } : null,
          reserva:
            contratoReserva > 0
              ? { acum: (reservaAntes / contratoReserva) * 100, atual: (acumuladoReserva / contratoReserva) * 100 }
              : null,
          total:
            contratoEmp + contratoReserva > 0
              ? {
                  acum: ((empAntes + reservaAntes) / (contratoEmp + contratoReserva)) * 100,
                  atual: ((acumuladoEmp + acumuladoReserva) / (contratoEmp + contratoReserva)) * 100,
                }
              : null,
        },
      };
    });
  });

  /** Linhas que aparecem na tabela: com "Total" (ou sem nenhuma opção) todas; senão, só as com valor nas parcelas marcadas. */
  protected readonly linhasExibidas = computed<LinhaRelatorioPagamento[]>(() => {
    const todas = this.linhas();
    if (this.mostrarTotal() || (!this.mostrarEmpreiteiro() && !this.mostrarReserva())) return todas;
    return todas.filter(
      (l) => (this.mostrarEmpreiteiro() && Math.abs(l.empreiteiro) > 0.005) || (this.mostrarReserva() && Math.abs(l.reserva) > 0.005),
    );
  });

  /**
   * Medição física por parcela: média da medição atual de cada serviço ponderada pelo contrato da
   * parcela (empreiteiro pelo valor do empreiteiro, reserva pela reserva, total pela soma) — mesma
   * ideia da coluna "Medição física" da lista de empreitas.
   */
  private medicaoFisica(snapshot: MedicaoSnapshotEmpreita | null): PercentuaisEmpilhados {
    if (!snapshot) return { emp: null, reserva: null, total: null };

    let atualEmp = 0, acumEmp = 0, pesoEmp = 0;
    let atualReserva = 0, acumReserva = 0, pesoReserva = 0;
    let atualTotal = 0, acumTotal = 0, pesoTotal = 0;
    for (const item of snapshot.itens) {
      const emp = item.contratoEmp || 0;
      const reserva = item.contratoReserva || 0;
      atualEmp += item.medicaoAtual * emp;
      acumEmp += item.medicaoAcum * emp;
      pesoEmp += emp;
      atualReserva += item.medicaoAtual * reserva;
      acumReserva += item.medicaoAcum * reserva;
      pesoReserva += reserva;
      atualTotal += item.medicaoAtual * (emp + reserva);
      acumTotal += item.medicaoAcum * (emp + reserva);
      pesoTotal += emp + reserva;
    }
    return {
      emp: pesoEmp > 0 ? { acum: acumEmp / pesoEmp, atual: atualEmp / pesoEmp } : null,
      reserva: pesoReserva > 0 ? { acum: acumReserva / pesoReserva, atual: atualReserva / pesoReserva } : null,
      total: pesoTotal > 0 ? { acum: acumTotal / pesoTotal, atual: atualTotal / pesoTotal } : null,
    };
  }

  protected percentual(valor: number): string {
    return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  protected larguraBarra(valor: number): number {
    return Math.min(100, Math.max(0, valor));
  }

  protected readonly totalEmpreiteiro = computed(() => this.linhas().reduce((s, l) => s + l.empreiteiro, 0));
  protected readonly totalReserva = computed(() => this.linhas().reduce((s, l) => s + l.reserva, 0));
  protected readonly totalPago = computed(() => this.linhas().reduce((s, l) => s + l.total, 0));

  /** Rodapé: o saldo da ÚLTIMA linha, não a soma — somar um saldo corrido não tem significado. */
  protected readonly saldoEmpreitaFinal = computed(() => {
    const linhas = this.linhas();
    return linhas.length ? linhas[linhas.length - 1].saldoEmpreita : this.contratoTotalEmpreita();
  });

  protected aoClicarLinha(linha: LinhaRelatorioPagamento): void {
    if (this.interativo() && linha.snapshot) this.abrirMedicao.emit(linha.pagamento);
  }
}
