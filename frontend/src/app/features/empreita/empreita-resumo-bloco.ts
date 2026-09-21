import { Component, OnInit, computed, inject, input } from '@angular/core';

import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { ItemEap } from '../eap/eap.models';
import {
  LadosResumo,
  OpcoesResumo,
  ladosDoResumo,
  montarHistoricoMedicoes,
  montarLinhasPagamentos,
  montarAcumuladoFechado,
  montarLinhasServicos,
  montarMedicaoAtual,
  pctFisicoPonderado,
  totalizarServicos,
} from './empreita-resumo-engine';
import { EmpreitaStore } from './empreita.store';

/**
 * Um bloco do PDF "Resumo para o profissional": uma empreita. Cada bloco tem
 * o PRÓPRIO `EmpreitaStore` (mesma engine da tela normal, sem duplicar
 * cálculo), então a tela de impressão pode empilhar várias empreitas.
 * Só leitura — e sem orçado/saldo disponível da EAP (dados internos): o
 * template apenas usa o que `empreita-resumo-engine.ts` devolve.
 */
@Component({
  selector: 'app-empreita-resumo-bloco',
  providers: [EmpreitaStore],
  templateUrl: './empreita-resumo-bloco.html',
  styleUrl: './empreita-resumo-bloco.scss',
})
export class EmpreitaResumoBloco implements OnInit {
  protected readonly store = inject(EmpreitaStore);

  readonly obraId = input.required<string>();
  readonly empreitaId = input.required<string>();
  readonly opcoes = input.required<OpcoesResumo>();

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;

  protected readonly lados = computed<LadosResumo>(() => ladosDoResumo(this.opcoes()));

  private rotuloEtapa(eapId: string): string {
    const itemEap = this.store.itensEap().find((i: ItemEap) => i.id === eapId);
    if (!itemEap) return '';
    const eap = String(itemEap.eap ?? '').trim();
    const desc = String(itemEap.desc ?? '').trim();
    if (eap && desc) return `${eap} - ${desc}`;
    return eap || desc;
  }

  protected readonly servicos = computed(() =>
    montarLinhasServicos(
      this.store.itens(),
      this.store.linhasEstendidas(),
      (eapId) => this.rotuloEtapa(eapId),
      this.lados(),
    ),
  );

  protected readonly totais = computed(() => totalizarServicos(this.servicos()));

  protected readonly pctFisico = computed(() => pctFisicoPonderado(this.store.linhasEstendidas()));

  protected readonly pagamentos = computed(() => montarLinhasPagamentos(this.store.pagamentosDaEmpreita(), this.lados()));

  protected readonly totalPagamentos = computed(() => this.pagamentos().reduce((soma, p) => soma + p.total, 0));

  protected readonly medicaoAtual = computed(() =>
    montarMedicaoAtual(
      this.store.itens(),
      this.store.linhasEstendidas(),
      (i) => this.servicos()[i]?.servico ?? '—',
      this.lados(),
    ),
  );

  protected readonly totalMedicaoAtual = computed(() => this.medicaoAtual().reduce((soma, l) => soma + l.total, 0));

  protected readonly historico = computed(() =>
    montarHistoricoMedicoes(this.store.pagamentosDaEmpreita(), (item) => {
      // `desc` pode vir nulo no retrato guardado (serviço sem descrição).
      const desc = (item.desc ?? '').trim();
      return desc || (item.eapId ? this.rotuloEtapa(item.eapId) : '') || '—';
    }),
  );

  /** Só usado quando nenhum pagamento guardou o retrato da medição. */
  protected readonly acumuladoFechado = computed(() =>
    montarAcumuladoFechado(this.store.itens(), this.store.linhasEstendidas(), (i) => this.servicos()[i]?.servico ?? '—'),
  );

  protected percentual(valor: number | null): string {
    if (valor === null) return '—';
    return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
  }

  protected rotuloStatus(status: string): string {
    return status === 'pendente' ? 'Pendente' : 'Confirmado';
  }

  ngOnInit(): void {
    this.store.carregar(this.empreitaId(), this.obraId());
  }
}
