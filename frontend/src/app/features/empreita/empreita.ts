import { Component, HostListener, OnInit, computed, inject, input, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { formatarMoeda } from '../../core/utils/formato';
import { NavegacaoTabela } from '../../shared/navegacao-tabela/navegacao-tabela';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { ChaveTipo, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
import { parsearBR } from '../pagamentos/pagamentos-calc';
import {
  limitarPercentual,
  pctParaQtde,
  pctParaValorContrato,
  qtdeParaPct,
  valorContratoParaPct,
} from './empreita-engine';
import { exportarEmpreitaXlsx, LinhaExportEmpreita } from './empreita-exportar';
import { EmpreitaRelatorioPagamentos } from './empreita-relatorio-pagamentos';
import { EmpreitaStore } from './empreita.store';
import { CabecalhoEmpreita, ItemEmpreita, LinhaEmpreitaEstendida, UnidadeMedicao } from './empreita.models';

/**
 * Empreita — serviços contratados e suas medições.
 *
 * Cada serviço aponta para um item da EAP (usado só como referência de
 * orçado, para comparação) e pertence a UMA categoria de custo só
 * (`item.tipo` — 25/08/2026, pedido do Lucas: "cada item da lista só vai
 * ter um tipo"; se precisar de duas categorias no mesmo item da EAP,
 * lança dois serviços). O contrato — empreita e reserva — é lançado pelo
 * usuário (task #45, 28/07/2026): o sistema não distribui esse valor
 * automaticamente. A medição é em percentual, e o que se paga é o avanço
 * em relação ao acumulado.
 *
 * Layout redesenhado em 25/08/2026 (pedido do Lucas): além de
 * Contrato/Medição, a tabela mostra Já pago (acumulado dos pagamentos
 * confirmados), o rascunho editável de Pagamento do período, e o Saldo
 * após pagamento — cada bloco é UMA coluna só, com os campos que antes
 * eram colunas próprias empilhados dentro da célula (`.subcampo`), tudo
 * colorido azul/vermelho conforme positivo/negativo. O "Saldo disp." do
 * Contrato considera as OUTRAS empreitas da mesma obra
 * (`EmpreitaStore.saldoDispPorEap` → `calcularSaldoDisponivelPorEap` na
 * engine) — uma empreita nunca é bloqueada por falta de saldo, só fica
 * vermelha.
 */
@Component({
  selector: 'app-empreita',
  imports: [NavegacaoTabela, RedimensionarColunas, EmpreitaRelatorioPagamentos],
  providers: [EmpreitaStore],
  templateUrl: './empreita.html',
  styleUrl: './empreita.scss',
})
export class Empreita implements OnInit {
  protected readonly store = inject(EmpreitaStore);
  private readonly api = inject(ApiService);
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly tiposCusto = TIPOS_CUSTO;

  /** Estado do botão "Baixar PDF" (23/08/2026) — ver EmpreitaPdfController. */
  protected readonly gerandoPdf = signal(false);
  protected readonly erroPdf = signal<string | null>(null);

  /**
   * "Simplificar" (01/09/2026, pedido do Lucas) — esconde as colunas
   * Empreiteiro/Reserva de todos os blocos (Contrato, Já pago, Pagamento,
   * Saldo após pagamento) e mostra só o Total, tanto na tela ao vivo
   * quanto no PDF gerado (`baixarPdf()` repassa como query param). Não
   * persiste nada — vale só pra esta visita/geração.
   */
  protected readonly simplificado = signal(false);

  protected alternarSimplificado(): void {
    this.simplificado.update((v) => !v);
  }

  /**
   * Id da obra — vem do param `:id` da rota avó (/obras/:id), herdado
   * via `withRouterConfig({ paramsInheritanceStrategy: 'always' })` em
   * app.config.ts. Mesmo mecanismo usado pela EAP. Usado aqui só para
   * buscar a EAP de referência — a própria empreita é identificada por
   * `empreitaId`.
   */
  readonly obraId = input.required<string>({ alias: 'id' });

  /** Id da empreita — vem do param `:empreitaId` da própria rota. */
  readonly empreitaId = input.required<string>({ alias: 'empreitaId' });

  /**
   * Colunas fixas da tabela — 25/08/2026, pedido do Lucas: enquanto em
   * edição (`!store.travada()`), só #/Serviço/Tipo/Etapa/Contrato/
   * Quantidades/Ações (7); confirmada, Quantidades some e entram Medição/
   * Já pago/Pagamento/Saldo após pagamento no lugar (10).
   */
  protected readonly totalColunas = computed(() => (this.store.travada() ? 10 : 7));

  ngOnInit(): void {
    this.store.carregar(this.empreitaId(), this.obraId());
  }

  /**
   * Avisa antes de fechar/recarregar a aba com gravações pendentes — mesmo
   * motivo de `Mapa.aoTentarFecharAba` (31/08/2026): editar vários itens em
   * sequência enfileira uma gravação por edição, e fechar a aba antes da
   * fila esvaziar cancela as que ainda não saíram.
   */
  @HostListener('window:beforeunload', ['$event'])
  protected aoTentarFecharAba(evento: BeforeUnloadEvent): void {
    if (!this.store.salvando()) return;
    evento.preventDefault();
  }

  // ------------------------------------------------------------------
  protected editarCabecalho(campo: keyof CabecalhoEmpreita, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.store.atualizarCabecalho(campo, valor as never);
  }

  protected editarTexto(item: ItemEmpreita, evento: Event): void {
    this.store.atualizarItem(item.id, { desc: (evento.target as HTMLInputElement).value });
  }

  protected editarEap(item: ItemEmpreita, evento: Event): void {
    this.store.atualizarItem(item.id, { eapId: (evento.target as HTMLSelectElement).value });
  }

  protected editarTipo(item: ItemEmpreita, evento: Event): void {
    this.store.atualizarItem(item.id, { tipo: (evento.target as HTMLSelectElement).value as ChaveTipo });
  }

  /** Lança o contrato (empreita ou reserva), digitado pelo usuário. */
  protected editarContrato(item: ItemEmpreita, campo: 'contratoEmp' | 'contratoReserva', evento: Event): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    this.store.atualizarContrato(item.id, campo, bruto === '' ? null : parsearBR(bruto));
  }

  /** Shift + `+`: novo serviço ao final da lista. */
  protected inserirLinha(): void {
    this.store.adicionarItem();
  }

  /** Shift + `-`: remove a linha atual, sem confirmar. */
  protected removerPorIndice(indiceLinha: number): void {
    const item = this.store.itens()[indiceLinha];
    if (item) this.store.removerItem(item.id);
  }

  protected remover(item: ItemEmpreita): void {
    if (!window.confirm('Remover este serviço da empreita?')) return;
    this.store.removerItem(item.id);
  }

  /**
   * Baixa o PDF da Empreita (23/08/2026) — ver EmpreitaPdfController/
   * empreita-imprimir.ts. Mesmo padrão de `Mapa.baixarPdf()`.
   */
  protected baixarPdf(): void {
    this.erroPdf.set(null);
    this.gerandoPdf.set(true);

    this.api.baixarEmpreitaPdf(this.empreitaId(), this.simplificado()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `empreita-${this.empreitaId()}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
        this.gerandoPdf.set(false);
      },
      error: () => {
        this.erroPdf.set('Não foi possível gerar o PDF. Tente novamente em alguns segundos.');
        this.gerandoPdf.set(false);
      },
    });
  }

  /**
   * Fecha o período e já gera o pagamento pendente deste ciclo em seguida
   * (25/08/2026, pedido do Lucas: "apagar o botão gerar pagamento, o
   * pagamento deve ser gerado automaticamente ao finalizar um período") —
   * ver `EmpreitaStore.fecharPeriodo`, que absorveu a lógica que antes vivia
   * num método `gerarPagamento()` separado.
   */
  protected fecharPeriodo(): void {
    const totais = this.store.totais();

    if (this.store.temMedicaoInvalida()) {
      window.alert('Há medições menores que o acumulado. Corrija antes de fechar o período.');
      return;
    }
    if (totais.totalPeriodo <= 0) {
      window.alert('Nenhum avanço medido neste período.');
      return;
    }

    const mensagem =
      `Fechar o período?\n\n` +
      `A pagar: ${formatarMoeda(totais.pagarEmp)}\n` +
      `Reserva: ${formatarMoeda(totais.reservarPgto)}\n` +
      `Total: ${formatarMoeda(totais.totalPeriodo)}\n\n` +
      `As medições atuais passam a ser o acumulado e um pagamento pendente é gerado automaticamente ` +
      `(confirme depois na aba Pagamentos).`;

    if (!window.confirm(mensagem)) return;
    this.store.fecharPeriodo();
  }

  /**
   * "Resetar" (31/08/2026, pedido do Lucas): zera o % acumulado de todos
   * os serviços — útil pra recomeçar a medição de uma empreita (ex.:
   * contrato remedido do zero). Não desfaz pagamentos já gerados na aba
   * Pagamentos, só a contagem de % medido daqui pra frente — por isso o
   * aviso explícito antes de confirmar.
   */
  protected resetarAcumulado(): void {
    if (
      !window.confirm(
        'Zerar o % acumulado de TODOS os serviços desta empreita?\n\n' +
          'A medição volta a começar do zero. Pagamentos já gerados na aba Pagamentos não são desfeitos.',
      )
    ) {
      return;
    }
    this.store.resetarAcumulado();
  }

  /**
   * Exporta os serviços e os totais calculados pra planilha Excel
   * (31/08/2026, pedido do Lucas) — ver `empreita-exportar.ts`. Usa a
   * MESMA fonte que a tela (`store.linhasEstendidas()`), então a
   * planilha bate exatamente com o que está sendo exibido.
   */
  protected readonly exportandoXlsx = signal(false);

  protected async exportarXlsx(): Promise<void> {
    this.exportandoXlsx.set(true);
    try {
      const linhas: LinhaExportEmpreita[] = this.store.itens().map((item, i) => {
        const linha = this.store.linhasEstendidas()[i];
        const itemEap = this.itemEapDoServico(item);
        return {
          desc: item.desc,
          tipo: this.tiposCusto.find((t) => t.chave === item.tipo)?.rotulo ?? '',
          etapa: itemEap ? this.rotuloEap(itemEap) : '',
          qtdeContratada: item.qtdeContratada,
          contratoEmp: item.contratoEmp,
          contratoReserva: item.contratoReserva,
          orcado: linha.orcado,
          acumulado: linha.acumulado,
          atual: linha.atual,
          avanco: linha.avanco,
          pagar: linha.pagar,
          reservar: linha.reservar,
          jaPagoEmpreiteiro: linha.jaPago.empreiteiro,
          jaPagoReserva: linha.jaPago.reserva,
          jaPagoDivergencia: linha.jaPago.divergencia,
          medido: linha.medido,
        };
      });
      await exportarEmpreitaXlsx(linhas, this.store.totaisEstendidos(), this.empreitaId());
    } catch {
      window.alert('Não foi possível gerar a planilha.');
    } finally {
      this.exportandoXlsx.set(false);
    }
  }

  // ------------------------------------------------------------------
  protected rotuloEap(itemEap: ItemEap): string {
    const eap = String(itemEap.eap ?? '').trim();
    const desc = String(itemEap.desc ?? '').trim();
    if (eap && desc) return `${eap} - ${desc}`;
    return eap || desc || '—';
  }

  protected linha(indice: number): LinhaEmpreitaEstendida {
    return this.store.linhasEstendidas()[indice];
  }

  private itemEapDoServico(item: ItemEmpreita): ItemEap | undefined {
    return this.store.itensEap().find((i) => i.id === item.eapId);
  }

  protected rotuloTipo(chave: ChaveTipo): string {
    return this.tiposCusto.find((t) => t.chave === chave)?.rotulo ?? chave;
  }

  protected percentualOuVazio(valor: number | null | undefined): string {
    if (valor === null || valor === undefined) return '';
    return valor ? String(valor).replace('.', ',') : '';
  }

  protected moedaOuVazio(valor: number): string {
    return valor ? formatarMoeda(valor) : '';
  }

  protected valorContrato(item: ItemEmpreita, campo: 'contratoEmp' | 'contratoReserva'): string {
    return this.moedaOuVazio(Number(item[campo]) || 0);
  }

  protected valorContratoTotal(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).contrato);
  }

  // ---- Saldo disp. (Contrato) ----
  protected valorSaldoDisp(indice: number): number {
    return this.linha(indice).saldoDisp;
  }

  // ---- Quantidades (só em edição — 25/08/2026, pedido do Lucas) ----
  protected valorQtdeEap(item: ItemEmpreita): string {
    const valor = this.itemEapDoServico(item)?.qtde;
    return this.percentualOuVazio(valor ?? null);
  }

  protected valorUnidEap(item: ItemEmpreita): string {
    return this.itemEapDoServico(item)?.unid ?? '';
  }

  protected numQtdeDisp(indice: number): number {
    return this.linha(indice).qtdeDisp;
  }

  protected valorQtdeDisp(indice: number, item: ItemEmpreita): string {
    const valor = Number(this.numQtdeDisp(indice).toFixed(2));
    if (!valor) return '';
    const unid = this.itemEapDoServico(item)?.unid ? ` ${this.itemEapDoServico(item)?.unid}` : '';
    return `${String(valor).replace('.', ',')}${unid}`;
  }

  // ---- Medição de contrato: toggle R$ ⇄ % ⇄ Qtde ----
  protected readonly unidadeMedicaoPorItem = signal<Record<string, UnidadeMedicao>>({});

  protected unidadeMedicaoDe(itemId: string): UnidadeMedicao {
    return this.unidadeMedicaoPorItem()[itemId] ?? 'pct';
  }

  private static readonly CICLO_UNIDADE: Record<UnidadeMedicao, UnidadeMedicao> = {
    pct: 'valor',
    valor: 'qtde',
    qtde: 'pct',
  };

  protected alternarUnidadeMedicao(itemId: string): void {
    this.unidadeMedicaoPorItem.update((m) => ({ ...m, [itemId]: Empreita.CICLO_UNIDADE[this.unidadeMedicaoDe(itemId)] }));
  }

  protected rotuloUnidadeMedicao(unidade: UnidadeMedicao): string {
    return unidade === 'pct' ? '%' : unidade === 'valor' ? 'R$' : 'Qtde';
  }

  private exibirMedicao(indice: number, item: ItemEmpreita, pct: number | null | undefined): string {
    if (pct === null || pct === undefined) return '';
    const unidade = this.unidadeMedicaoDe(item.id);

    if (unidade === 'pct') return this.percentualOuVazio(pct);

    if (unidade === 'valor') {
      const contratoTotal = this.linha(indice).contrato;
      return this.moedaOuVazio(pctParaValorContrato(pct, contratoTotal));
    }

    // qtde — referência é a Quantidade contratada DESTE serviço, não a
    // quantidade total do item da EAP (25/08/2026, pedido do Lucas: o
    // contrato pode cobrir só uma parte do item).
    const qtdeTotal = Number(item.qtdeContratada) || 0;
    const qtde = Number(pctParaQtde(pct, qtdeTotal).toFixed(2));
    if (!qtde) return '';
    const itemEap = this.itemEapDoServico(item);
    const unid = itemEap?.unid ? ` ${itemEap.unid}` : '';
    return `${String(qtde).replace('.', ',')}${unid}`;
  }

  protected valorMedicaoAcumuladaExibida(indice: number, item: ItemEmpreita): string {
    return this.exibirMedicao(indice, item, item.medicaoAcum);
  }

  protected valorMedicaoAtualExibida(indice: number, item: ItemEmpreita): string {
    return this.exibirMedicao(indice, item, item.medicaoAtual);
  }

  protected valorAvanco(indice: number): string {
    return this.percentualOuVazio(this.linha(indice).avanco);
  }

  /**
   * Converte o texto digitado (na unidade ativa da linha) de volta pra
   * percentual, antes de gravar. Só "Atual" — o "Acumulado" não é mais
   * editável pelo usuário (25/08/2026, pedido do Lucas: "o sistema que
   * preenche automaticamente" — vira o novo acumulado sozinho quando o
   * período é fechado, ver `EmpreitaStore.avancarPeriodo`).
   */
  protected editarMedicao(indice: number, item: ItemEmpreita, campo: 'medicaoAtual', evento: Event): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    if (bruto === '') {
      this.store.atualizarMedicao(item.id, campo, null);
      return;
    }

    const numero = parsearBR(bruto);
    const unidade = this.unidadeMedicaoDe(item.id);
    let pct = numero;
    if (unidade === 'valor') {
      const contratoTotal = this.linha(indice).contrato;
      pct = valorContratoParaPct(numero, contratoTotal);
    } else if (unidade === 'qtde') {
      const qtdeTotal = Number(item.qtdeContratada) || 0;
      pct = qtdeParaPct(numero, qtdeTotal);
    }

    this.store.atualizarMedicao(item.id, campo, limitarPercentual(pct));
  }

  // ---- Quantidade contratada (referência do toggle Qtde) ----
  protected valorQtdeContratadaExibida(item: ItemEmpreita): string {
    const valor = item.qtdeContratada;
    if (valor === null || valor === undefined) return '';
    const itemEap = this.itemEapDoServico(item);
    const unid = itemEap?.unid ? ` ${itemEap.unid}` : '';
    return `${String(valor).replace('.', ',')}${unid}`;
  }

  protected editarQtdeContratada(item: ItemEmpreita, evento: Event): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    this.store.atualizarQtdeContratada(item.id, bruto === '' ? null : parsearBR(bruto));
  }

  // ---- Já pago (acumulado dos pagamentos confirmados) ----
  protected valorJaPagoEmpreiteiro(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).jaPago.empreiteiro);
  }

  protected valorJaPagoReserva(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).jaPago.reserva);
  }

  protected valorJaPagoDivergencia(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).jaPago.divergencia);
  }

  protected numDivergencia(indice: number): number {
    return this.linha(indice).jaPago.divergencia;
  }

  protected valorJaPagoTotal(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).jaPago.total);
  }

  // ---- Pagamento (rascunho do período, editável) ----
  protected valorMedido(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).medido);
  }

  protected numMedido(indice: number): number {
    return this.linha(indice).medido;
  }

  protected valorPagamentoDraftExibido(indice: number, campo: 'pagamentoEmpDraft' | 'pagamentoReservaDraft'): string {
    return this.moedaOuVazio(this.linha(indice)[campo]);
  }

  protected valorPagamentoDraftTotal(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).pagamentoDraftTotal);
  }

  protected editarPagamentoDraft(item: ItemEmpreita, campo: 'pagamentoEmp' | 'pagamentoReserva', evento: Event): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    this.store.atualizarPagamentoDraft(item.id, campo, bruto === '' ? null : parsearBR(bruto));
  }

  // ---- Saldo após pagamento ----
  protected valorSaldoAposPagamentoEtapa(indice: number): number {
    return this.linha(indice).saldoAposPagamentoEtapa;
  }

  protected valorSaldoAposPagamentoEmp(indice: number): number {
    return this.linha(indice).saldoAposPagamentoEmp;
  }

  protected valorSaldoAposPagamentoReserva(indice: number): number {
    return this.linha(indice).saldoAposPagamentoReserva;
  }

  protected valorSaldoAposPagamentoTotal(indice: number): number {
    return this.linha(indice).saldoAposPagamentoTotal;
  }
}
