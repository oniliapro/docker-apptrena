import { Component, computed, input, output, signal } from '@angular/core';

import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { ChaveTipo, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
import { expandirItensPagamento } from '../pagamentos/pagamentos-calc';
import { ItemSnapshotMedicao, MedicaoSnapshotEmpreita, Pagamento, StatusPagamento } from '../pagamentos/pagamentos.models';

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
  /** `null` pra pagamentos gerados antes desta feature existir (sem snapshot gravado). */
  snapshot: MedicaoSnapshotEmpreita | null;
  /** Valor do CONTRATO no momento deste pagamento — do snapshot quando existe, senão cai pro atual. */
  contratoTotalNoMomento: number;
  /** "Medição %" — acumulado/atual ponderados por `contratoEmp`, `null` sem snapshot (mesma regra do "Físico" da lista de Empreitas). */
  pctMedicaoAcumulado: number | null;
  pctMedicaoAtual: number | null;
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

  /**
   * Botão "Realizar medição" (03/09/2026, pedido do Lucas — nome trocado
   * no mesmo dia; era "Realizar pagamento") — mostrado só quando o pai
   * deixa (`empreita.html`, empreita confirmada); `false` por padrão pra
   * não aparecer sozinho na versão de impressão
   * (`empreita-imprimir.html`), que não passa esse input.
   *
   * Fica visível pra sempre (não some depois do primeiro clique, como
   * antes) — quem controla se ele pode ser CLICADO agora é
   * `medicaoHabilitada`, o par alternado com "Realizar pagamento" lá em
   * `empreita.ts` (`podeRealizarMedicao`).
   */
  readonly mostrarBotaoMedicao = input<boolean>(false);
  readonly medicaoHabilitada = input<boolean>(true);
  readonly realizarMedicao = output<void>();

  /** Itens ATUAIS da EAP (03/09/2026) — só pra rotular a etapa de cada serviço na popup de retrato. */
  readonly itensEap = input<ItemEap[]>([]);

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;
  protected readonly tiposCusto = TIPOS_CUSTO;

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

      const snapshot = pagamento.medicaoSnapshot ?? null;
      const { acumulado: pctMedicaoAcumulado, atual: pctMedicaoAtual } = this.medicaoPonderada(snapshot);

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
        snapshot,
        // "Contrato" no momento deste pagamento (03/09/2026, pedido do
        // Lucas: "uma empreita pode crescer ou diminuir ao longo do
        // tempo") — do snapshot quando existe; pagamentos gerados antes
        // desta feature caem pro total ATUAL, única referência possível.
        contratoTotalNoMomento: snapshot ? snapshot.contratoTotalEmpreita : contratoTotal,
        pctMedicaoAcumulado,
        pctMedicaoAtual,
      };
    });
  });

  /**
   * "Medição %" — acumulado/atual ponderados por `contratoEmp`, mesma
   * fórmula de "Físico" na lista de Empreitas (`empreitas-obra.ts`).
   * `null` quando não há snapshot (pagamento antigo) ou nenhum item do
   * snapshot tem contrato lançado.
   */
  private medicaoPonderada(
    snapshot: MedicaoSnapshotEmpreita | null,
  ): { acumulado: number | null; atual: number | null } {
    if (!snapshot) return { acumulado: null, atual: null };

    let somaPonderadaAcum = 0;
    let somaPonderadaAtual = 0;
    let somaContrato = 0;
    for (const item of snapshot.itens) {
      const contrato = item.contratoEmp || 0;
      if (contrato <= 0) continue;
      somaPonderadaAcum += item.medicaoAcum * contrato;
      somaPonderadaAtual += item.medicaoAtual * contrato;
      somaContrato += contrato;
    }

    return somaContrato > 0
      ? { acumulado: somaPonderadaAcum / somaContrato, atual: somaPonderadaAtual / somaContrato }
      : { acumulado: null, atual: null };
  }

  protected larguraBarra(pct: number): number {
    return Math.min(100, Math.max(0, pct));
  }

  protected formatarPercentualBarra(pct: number): string {
    return `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  // ------------------------------------------------------------------
  // Popup — "retrato" da empreita no momento do pagamento (03/09/2026)
  // ------------------------------------------------------------------
  protected readonly linhaDetalhada = signal<LinhaRelatorioPagamento | null>(null);

  protected abrirDetalhe(linha: LinhaRelatorioPagamento): void {
    if (!linha.snapshot) return;
    this.linhaDetalhada.set(linha);
  }

  protected fecharDetalhe(): void {
    this.linhaDetalhada.set(null);
  }

  protected rotuloTipo(chave: ChaveTipo | string): string {
    return this.tiposCusto.find((t) => t.chave === chave)?.rotulo ?? String(chave);
  }

  protected rotuloEtapaSnapshot(item: ItemSnapshotMedicao): string {
    if (!item.eapId) return '—';
    const itemEap = this.itensEap().find((i) => i.id === item.eapId);
    if (!itemEap) return '—';
    const eap = String(itemEap.eap ?? '').trim();
    const desc = String(itemEap.desc ?? '').trim();
    if (eap && desc) return `${eap} - ${desc}`;
    return eap || desc || '—';
  }

  protected readonly totalEmpreiteiro = computed(() => this.linhas().reduce((s, l) => s + l.empreiteiro, 0));
  protected readonly totalReserva = computed(() => this.linhas().reduce((s, l) => s + l.reserva, 0));
  protected readonly totalPago = computed(() => this.linhas().reduce((s, l) => s + l.total, 0));

  /** Rodapé: o saldo da ÚLTIMA linha, não a soma — somar um saldo corrido não tem significado. */
  protected readonly saldoEmpreitaFinal = computed(() => {
    const linhas = this.linhas();
    return linhas.length ? linhas[linhas.length - 1].saldoEmpreita : this.contratoTotalEmpreita();
  });
}
