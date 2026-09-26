import { Component, computed, input, output, signal } from '@angular/core';

import { formatarMoeda } from '../../core/utils/formato';
import { ChaveTipo, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
import { parsearBR } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { calcularJaPagoPorLinha, calcularLinhaEmpreitaEstendida, classificarSituacaoMedicao, limitarPercentual, SituacaoMedicaoLinha } from './empreita-engine';
import { EdicaoServico, reconstruirMedicao } from './empreita-historico';
import { ItemEmpreita, LinhaEmpreitaEstendida } from './empreita.models';

export interface EventoSalvarMedicao {
  pagamentoId: string;
  edicoes: Map<string, EdicaoServico>;
}

/**
 * Popup "empreita completa" de UMA medição (26/09/2026, pedido do Lucas): mostra a tabela da empreita
 * como estava no momento do pagamento — inputs exatamente como foram preenchidos — e permite editar
 * ou apagar a medição. Quem persiste (pagamento vinculado + recálculo das medições seguintes, com
 * confirmação) é o host, `EmpreitaPagamentosPopup`; aqui só se monta a tela e se devolve o que mudou.
 */
@Component({
  selector: 'app-empreita-medicao-detalhe',
  templateUrl: './empreita-medicao-detalhe.html',
  styleUrl: './empreita-medicao-detalhe.scss',
})
export class EmpreitaMedicaoDetalhe {
  /** Todos os pagamentos da empreita, já em ordem de criação. */
  readonly ordenados = input.required<Pagamento[]>();
  /** Posição da medição aberta em `ordenados`. */
  readonly indice = input.required<number>();
  readonly itensEap = input<ItemEap[]>([]);
  /** Serviços ATUAIS da empreita: o retrato não guarda a quantidade contratada, então vem daqui (26/09/2026). */
  readonly itensAtuais = input<ItemEmpreita[]>([]);
  /** Saldo disp. (coluna Contrato) de cada serviço, hoje — do cálculo da própria empreita. */
  readonly saldoDispPorServico = input<Map<string, number>>(new Map());

  readonly fechar = output<void>();
  readonly salvar = output<EventoSalvarMedicao>();
  readonly apagar = output<string>();

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly tiposCusto = TIPOS_CUSTO;

  protected readonly editando = signal(false);
  /** Rascunho da edição: por serviço, medição atual (%) e valores a pagar (texto, como digitado). */
  protected readonly rascunho = signal<Map<string, { atual: string; emp: string; reserva: string }>>(new Map());

  protected readonly medicao = computed(() => reconstruirMedicao(this.ordenados(), this.indice()));
  protected readonly pagamento = computed(() => this.ordenados()[this.indice()] ?? null);

  private readonly anteriores = computed(() => calcularJaPagoPorLinha(this.ordenados().slice(0, this.indice())));

  /** Itens com o rascunho aplicado (só muda algo em modo edição). */
  protected readonly itens = computed<ItemEmpreita[]>(() => {
    const base = this.medicao()?.itens ?? [];
    if (!this.editando()) return base;
    const rascunho = this.rascunho();
    return base.map((item) => {
      const r = rascunho.get(item.id);
      if (!r) return item;
      return {
        ...item,
        medicaoAtual: limitarPercentual(parsearBR(r.atual)),
        pagamentoEmp: parsearBR(r.emp),
        pagamentoReserva: parsearBR(r.reserva),
      };
    });
  });

  protected readonly linhas = computed<LinhaEmpreitaEstendida[]>(() => {
    const vazio = new Map();
    const anteriores = this.anteriores();
    return this.itens().map((item) => calcularLinhaEmpreitaEstendida(item, vazio, vazio, vazio, anteriores));
  });

  protected readonly totais = computed(() => {
    const linhas = this.linhas();
    const soma = (f: (l: LinhaEmpreitaEstendida) => number) => linhas.reduce((s, l) => s + f(l), 0);
    return {
      contratoEmp: soma((l) => l.valorEmp),
      contratoReserva: soma((l) => l.valorReserva),
      contratoTotal: soma((l) => l.valorTotal),
      medido: soma((l) => l.medido),
      pagoEmp: soma((l) => l.jaPago.empreiteiro),
      pagoReserva: soma((l) => l.jaPago.reserva),
      pagoTotal: soma((l) => l.jaPago.total),
      disponivel: soma((l) => l.disponivelEmp),
      pagarEmp: soma((l) => l.pagamentoEmpDraft),
      pagarReserva: soma((l) => l.pagamentoReservaDraft),
      pagarTotal: soma((l) => l.pagamentoDraftTotal),
      saldoMedicao: soma((l) => l.saldoMedicao),
      saldoEmp: soma((l) => l.saldoAposPagamentoEmp),
      saldoReserva: soma((l) => l.saldoAposPagamentoReserva),
      saldoTotal: soma((l) => l.saldoAposPagamentoTotal),
    };
  });

  /** "Qtde. contrat." — número na unidade da EAP, igual à coluna Medição de contrato da tela da empreita. */
  protected qtdeContratada(item: ItemEmpreita): string {
    const atual = this.itensAtuais().find((i) => i.id === item.id);
    const valor = atual?.qtdeContratada;
    if (valor === null || valor === undefined) return '—';
    const unid = this.itensEap().find((e) => e.id === (atual?.eapId || item.eapId))?.unid;
    return `${String(valor).replace('.', ',')}${unid ? ' ' + unid : ''}`;
  }

  protected saldoDisp(item: ItemEmpreita): number | null {
    return this.saldoDispPorServico().get(item.id) ?? null;
  }

  /** Mesma regra de cores da tela da empreita: azul (com pagamento), verde (100%), amarelo (em andamento). */
  protected situacao(linha: LinhaEmpreitaEstendida): SituacaoMedicaoLinha {
    return classificarSituacaoMedicao(linha);
  }

  protected rotuloTipo(chave: ChaveTipo | string): string {
    return this.tiposCusto.find((t) => t.chave === chave)?.rotulo ?? String(chave);
  }

  protected rotuloEtapa(item: ItemEmpreita): string {
    if (!item.eapId) return '—';
    const itemEap = this.itensEap().find((i) => i.id === item.eapId);
    if (!itemEap) return '—';
    const eap = String(itemEap.eap ?? '').trim();
    const desc = String(itemEap.desc ?? '').trim();
    return eap && desc ? `${eap} - ${desc}` : eap || desc || '—';
  }

  protected percentual(valor: number): string {
    return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
  }

  protected numeroTexto(valor: number): string {
    return String(Math.round(valor * 100) / 100).replace('.', ',');
  }

  // ---- edição ----
  protected iniciarEdicao(): void {
    const mapa = new Map<string, { atual: string; emp: string; reserva: string }>();
    for (const [i, item] of (this.medicao()?.itens ?? []).entries()) {
      const linha = this.medicao()!.linhas[i];
      mapa.set(item.id, {
        atual: this.numeroTexto(linha.atual),
        emp: this.numeroTexto(linha.pagamentoEmpDraft),
        reserva: this.numeroTexto(linha.pagamentoReservaDraft),
      });
    }
    this.rascunho.set(mapa);
    this.editando.set(true);
  }

  protected cancelarEdicao(): void {
    this.editando.set(false);
  }

  protected valorRascunho(id: string, campo: 'atual' | 'emp' | 'reserva'): string {
    return this.rascunho().get(id)?.[campo] ?? '';
  }

  /**
   * Mudou a medição atual: refaz o pré-preenchimento do pagamento (mesma regra da tela da empreita —
   * (acumulado + avanço) × contrato da parcela − já pago, nunca negativo).
   */
  protected editarAtual(indiceItem: number, evento: Event): void {
    const item = this.medicao()?.itens[indiceItem];
    const linhaBase = this.medicao()?.linhas[indiceItem];
    if (!item || !linhaBase) return;

    const atual = limitarPercentual(parsearBR((evento.target as HTMLInputElement).value));
    const ate = Math.max(atual, linhaBase.acumulado) / 100;
    const emp = Math.max(0, ate * (item.contratoEmp || 0) - linhaBase.jaPago.empreiteiro);
    const reserva = Math.max(0, ate * (item.contratoReserva || 0) - linhaBase.jaPago.reserva);

    this.rascunho.update((mapa) => {
      const novo = new Map(mapa);
      novo.set(item.id, { atual: this.numeroTexto(atual), emp: this.numeroTexto(emp), reserva: this.numeroTexto(reserva) });
      return novo;
    });
  }

  protected editarValor(id: string, campo: 'emp' | 'reserva', evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.rascunho.update((mapa) => {
      const atual = mapa.get(id);
      if (!atual) return mapa;
      const novo = new Map(mapa);
      novo.set(id, { ...atual, [campo]: valor });
      return novo;
    });
  }

  protected salvarEdicao(): void {
    const pagamento = this.pagamento();
    if (!pagamento) return;
    const edicoes = new Map<string, EdicaoServico>();
    for (const [id, r] of this.rascunho()) {
      edicoes.set(id, { atual: limitarPercentual(parsearBR(r.atual)), emp: parsearBR(r.emp), reserva: parsearBR(r.reserva) });
    }
    this.salvar.emit({ pagamentoId: pagamento.id, edicoes });
  }

  protected pedirApagar(): void {
    const pagamento = this.pagamento();
    if (pagamento) this.apagar.emit(pagamento.id);
  }
}
