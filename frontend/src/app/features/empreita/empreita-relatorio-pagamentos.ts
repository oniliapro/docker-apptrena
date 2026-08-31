import { Component, computed, input } from '@angular/core';

import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { expandirItensPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento, StatusPagamento } from '../pagamentos/pagamentos.models';

interface LinhaRelatorioPagamento {
  id: string;
  numeroPagamento: string;
  dataSolicitacao: string;
  dataPagamento: string;
  status: StatusPagamento;
  empreiteiro: number;
  reserva: number;
  total: number;
  saldoEmpreita: number;
}

/**
 * "Pagamentos registrados" — relatório fixo no canto inferior direito da
 * tela de Empreita, pedido do Lucas em 24-25/08/2026. Componente novo,
 * standalone e SEM store própria (só `input()`s) de propósito: precisa
 * renderizar idêntico na tela normal (`empreita.html`) e na versão de
 * impressão (`empreita-imprimir.html`), sem duplicar a lógica de cálculo
 * nos dois lugares.
 *
 * `pagamentos` agora recebe TODOS os pagamentos desta empreita, pendentes
 * inclusive (25/08/2026, pedido do Lucas: "ao lançar um pagamento... o
 * mesmo já deve aparecer nos pagamentos registrados, exibindo que a data
 * de pagamento ainda está em aberto") — antes só mostrava confirmados, e
 * um pagamento recém-gerado (sempre nasce pendente) só aparecia aqui
 * depois de alguém confirmá-lo manualmente na aba Pagamentos. A data de
 * pagamento em branco mostra "Em aberto" em vez de "—".
 *
 * "Saldo empreita" (confirmado com o Lucas, 24/08/2026) é o saldo da
 * empreita ESPECÍFICA, não da obra toda: `Contrato Total desta empreita
 * − soma paga (Empreiteiro+Reserva) até este pagamento, inclusive` — soma
 * pendentes e confirmados igual, porque um pagamento pendente já
 * representa dinheiro comprometido, mesmo antes de confirmado. Uma linha
 * vinda de um pagamento gerado pelo código antigo (antes de `parcela`
 * existir) aparece com Empreiteiro/Reserva zerados — não dá pra saber
 * retroativamente qual lado do contrato aquele valor era (ver nota de
 * migração no plano) —, mas a data continua visível.
 */
@Component({
  selector: 'app-empreita-relatorio-pagamentos',
  templateUrl: './empreita-relatorio-pagamentos.html',
  styleUrl: './empreita-relatorio-pagamentos.scss',
})
export class EmpreitaRelatorioPagamentos {
  readonly pagamentos = input<Pagamento[]>([]);
  readonly contratoTotalEmpreita = input<number>(0);

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;

  protected readonly linhas = computed<LinhaRelatorioPagamento[]>(() => {
    const contratoTotal = this.contratoTotalEmpreita();
    const ordenados = [...this.pagamentos()].sort((a, b) => {
      const dataA = a.dataPagamento || a.dataSolicitacao || '';
      const dataB = b.dataPagamento || b.dataSolicitacao || '';
      return dataA.localeCompare(dataB);
    });

    let acumuladoPago = 0;
    return ordenados.map((pagamento) => {
      let empreiteiro = 0;
      let reserva = 0;
      for (const item of expandirItensPagamento(pagamento)) {
        if (item.parcela === 'reserva') reserva += item.valorCalculado;
        else if (item.parcela === 'empreiteiro') empreiteiro += item.valorCalculado;
      }
      const total = empreiteiro + reserva;
      acumuladoPago += total;

      return {
        id: pagamento.id,
        numeroPagamento: pagamento.numeroPagamento,
        dataSolicitacao: pagamento.dataSolicitacao,
        dataPagamento: pagamento.dataPagamento,
        status: pagamento.status,
        empreiteiro,
        reserva,
        total,
        saldoEmpreita: contratoTotal - acumuladoPago,
      };
    });
  });

  protected readonly totalEmpreiteiro = computed(() => this.linhas().reduce((s, l) => s + l.empreiteiro, 0));
  protected readonly totalReserva = computed(() => this.linhas().reduce((s, l) => s + l.reserva, 0));
  protected readonly totalPago = computed(() => this.linhas().reduce((s, l) => s + l.total, 0));

  /** Rodapé: o saldo da ÚLTIMA linha, não a soma — somar um saldo corrido não tem significado. */
  protected readonly saldoEmpreitaFinal = computed(() => {
    const linhas = this.linhas();
    return linhas.length ? linhas[linhas.length - 1].saldoEmpreita : this.contratoTotalEmpreita();
  });
}
