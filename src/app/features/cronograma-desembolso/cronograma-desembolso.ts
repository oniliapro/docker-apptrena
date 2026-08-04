import { Component, OnInit, computed, inject, input } from '@angular/core';

import { formatarMoeda } from '../../core/utils/formato';
import { EapStore } from '../eap/eap.store';
import { ehDescendente } from '../eap/eap-engine';
import { ItemEap } from '../eap/eap.models';
import { expandirItensPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { PagamentosStore } from '../pagamentos/pagamentos.store';

interface ColunaPeriodo {
  /** Chave "AAAA-MM", usada para indexar a matriz e ordenar as colunas. */
  chave: string;
  rotulo: string;
}

interface LinhaCronograma {
  item: ItemEap;
  /** Orçado (com BDI) — mesmo valor que a EAP mostra, só referência aqui. */
  orcado: number;
  /** Valor desembolsado (pagamentos confirmados) em cada período, por chave "AAAA-MM". */
  porPeriodo: Record<string, number>;
  totalRealizado: number;
}

const NOMES_MES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/**
 * Cronograma de desembolso — matriz EAP × período (item 3 do roteiro
 * combinado com a Onilia, 04/08/2026).
 *
 * Cruza os itens da EAP com os pagamentos já lançados na obra (mesma
 * fonte de dado do "Orçado x Realizado" da própria EAP — task
 * 28/07/2026), agrupando o valor desembolsado por mês de cada pagamento.
 * Só pagamentos confirmados contam (mesmo critério do "Realizado" da
 * EAP: pendente ainda não foi conferido).
 *
 * Decisão de escopo (sem spec original disponível — a validar com o
 * Lucas): a coluna "Orçado" é o total do item na EAP, só como
 * referência — o cronograma em si mostra é o desembolso REALIZADO por
 * mês, não uma previsão futura (não há, hoje, nenhum dado de "quando eu
 * pretendo pagar cada item" pra alimentar uma coluna de previsto).
 */
@Component({
  selector: 'app-cronograma-desembolso',
  providers: [EapStore, PagamentosStore],
  templateUrl: './cronograma-desembolso.html',
  styleUrl: './cronograma-desembolso.scss',
})
export class CronogramaDesembolso implements OnInit {
  private readonly eap = inject(EapStore);
  protected readonly pagamentosStore = inject(PagamentosStore);
  protected readonly formatarMoeda = formatarMoeda;

  /**
   * Id da obra — vem do param `:id` da rota pai (/obras/:id), herdado via
   * `withRouterConfig({ paramsInheritanceStrategy: 'always' })`. Mesmo
   * mecanismo usado pela EAP, Empreita e Mapa.
   */
  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly carregando = computed(
    () => this.eap.carregando() || this.pagamentosStore.carregando(),
  );

  ngOnInit(): void {
    this.eap.carregar(this.obraId());
    this.pagamentosStore.carregar(this.obraId());
  }

  // ------------------------------------------------------------------
  // Períodos (colunas)
  // ------------------------------------------------------------------
  /** Meses com pelo menos um pagamento confirmado, em ordem cronológica. */
  protected readonly periodos = computed<ColunaPeriodo[]>(() => {
    const chaves = new Set<string>();
    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      const chave = this.periodoDoPagamento(pagamento);
      if (chave) chaves.add(chave);
    }
    return [...chaves].sort().map((chave) => ({ chave, rotulo: this.rotuloPeriodo(chave) }));
  });

  /**
   * Mês do pagamento: usa a data de pagamento quando existe (desembolso
   * de fato), senão cai pra data de solicitação (pagamento confirmado
   * lançado à mão, sem data de pagamento preenchida).
   */
  private periodoDoPagamento(pagamento: Pagamento): string {
    const data = pagamento.dataPagamento || pagamento.dataSolicitacao;
    return data && data.length >= 7 ? data.slice(0, 7) : '';
  }

  private rotuloPeriodo(chave: string): string {
    const [ano, mes] = chave.split('-');
    const indice = Number(mes) - 1;
    return `${NOMES_MES[indice] ?? mes}/${ano.slice(2)}`;
  }

  // ------------------------------------------------------------------
  // Matriz (linhas × períodos)
  // ------------------------------------------------------------------
  /** eapId do item-base → { período: valor desembolsado naquele mês }. */
  private readonly matrizPorItemBase = computed(() => {
    const mapa = new Map<string, Record<string, number>>();

    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      const periodo = this.periodoDoPagamento(pagamento);
      if (!periodo) continue;

      for (const item of expandirItensPagamento(pagamento)) {
        if (!item.eapId) continue;
        const atual = mapa.get(item.eapId) ?? {};
        atual[periodo] = (atual[periodo] ?? 0) + item.valorCalculado;
        mapa.set(item.eapId, atual);
      }
    }
    return mapa;
  });

  protected readonly linhas = computed<LinhaCronograma[]>(() => {
    const itens = this.eap.itens();
    const cache = this.eap.cache();
    const matriz = this.matrizPorItemBase();
    const periodos = this.periodos();

    return itens.map((item, indice) => {
      const orcado = item.isGroup
        ? this.eap.totaisDoGrupo(indice).totalWithBdi
        : (cache.totalWithBdi[indice] ?? 0);

      const porPeriodo: Record<string, number> = {};
      let totalRealizado = 0;

      for (const periodo of periodos) {
        const valor = item.isGroup
          ? this.somaDescendentesNoPeriodo(item, itens, matriz, periodo.chave)
          : (matriz.get(item.id)?.[periodo.chave] ?? 0);
        porPeriodo[periodo.chave] = valor;
        totalRealizado += valor;
      }

      return { item, orcado, porPeriodo, totalRealizado };
    });
  });

  private somaDescendentesNoPeriodo(
    grupo: ItemEap,
    itens: ItemEap[],
    matriz: Map<string, Record<string, number>>,
    periodo: string,
  ): number {
    const eapGrupo = String(grupo.eap ?? '').trim();
    if (!eapGrupo) return 0;

    let soma = 0;
    for (const filho of itens) {
      if (filho.isGroup || !ehDescendente(eapGrupo, filho.eap)) continue;
      soma += matriz.get(filho.id)?.[periodo] ?? 0;
    }
    return soma;
  }

  // ------------------------------------------------------------------
  // Totais (rodapé) — só itens-base, pra não contar em dobro com os grupos.
  // ------------------------------------------------------------------
  protected readonly totalOrcado = computed(() =>
    this.linhas()
      .filter((l) => !l.item.isGroup)
      .reduce((soma, l) => soma + l.orcado, 0),
  );

  protected readonly totalRealizadoGeral = computed(() =>
    this.linhas()
      .filter((l) => !l.item.isGroup)
      .reduce((soma, l) => soma + l.totalRealizado, 0),
  );

  protected totalDoPeriodo(chave: string): number {
    return this.linhas()
      .filter((l) => !l.item.isGroup)
      .reduce((soma, l) => soma + (l.porPeriodo[chave] ?? 0), 0);
  }

  // ------------------------------------------------------------------
  protected rotuloEap(item: ItemEap): string {
    const eap = String(item.eap ?? '').trim();
    const desc = String(item.desc ?? '').trim();
    if (eap && desc) return `${eap} — ${desc}`;
    return eap || desc || '—';
  }

  protected valorOuTraco(valor: number): string {
    return valor ? formatarMoeda(valor) : '—';
  }
}
