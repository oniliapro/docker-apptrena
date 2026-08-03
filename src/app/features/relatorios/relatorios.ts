import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { formatarMoeda } from '../../core/utils/formato';
import { calcularCacheOrcado } from '../eap/eap-engine';
import {
  aplicarNumeracaoAutomatica,
  cabecalhoVazio,
  normalizarCabecalho,
  normalizarItemEap,
} from '../eap/eap-normalize';
import { CabecalhoObra, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
import { calcularSomaItens, normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';

/**
 * Chave por obra dos Pagamentos — task "obra como contexto" (28/07/2026).
 * Pagamentos continua na ponte chave-valor por enquanto. Já a EAP é lida
 * pelo endpoint relacional `GET /obras/{id}/eap` (ver `carregar`),
 * migrado no mesmo dia junto com `EapStore` — ler a chave antiga
 * mostraria dado órfão, já que a EAP não grava mais lá.
 */
const chavePagamentos = (obraId: string) => `controleObra.pagamentos.v1.obra-${obraId}`;

/**
 * Relatórios — consolida o que já existe nos outros módulos.
 *
 * Não gera dado novo: cruza o orçado da EAP com o realizado dos
 * pagamentos, que é a pergunta que todo mundo faz sobre uma obra —
 * *estamos dentro do orçamento?*
 *
 * A comparação é feita por categoria de custo, e não só no total,
 * porque o total pode fechar escondendo um estouro em material
 * compensado por economia em mão de obra — situações bem diferentes de
 * uma obra realmente no prazo e no preço.
 */
@Component({
  selector: 'app-relatorios',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './relatorios.html',
  styleUrl: './relatorios.scss',
})
export class Relatorios implements OnInit {
  private readonly armazenamento = inject(ArmazenamentoService);
  private readonly api = inject(ApiService);

  /**
   * Id da obra — vem do param `:id` da rota pai (/obras/:id), herdado
   * via `withRouterConfig({ paramsInheritanceStrategy: 'always' })` em
   * app.config.ts. Mesmo mecanismo usado pela EAP.
   */
  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly tipos = TIPOS_CUSTO;
  protected readonly formatarMoeda = formatarMoeda;

  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  private readonly itensEap = signal<ItemEap[]>([]);
  private readonly cabecalhoEap = signal<CabecalhoObra>(cabecalhoVazio());
  private readonly pagamentos = signal<Pagamento[]>([]);

  /** Orçado total, com BDI, por categoria. */
  protected readonly orcado = computed(() => {
    const cache = calcularCacheOrcado(this.itensEap(), this.cabecalhoEap());
    return TIPOS_CUSTO.reduce<Record<string, number>>((acc, t) => {
      acc[t.chave] = cache.totalsDirectByType[t.chave] + cache.totalsBdiByType[t.chave];
      return acc;
    }, {});
  });

  protected readonly orcadoTotal = computed(() => {
    const cache = calcularCacheOrcado(this.itensEap(), this.cabecalhoEap());
    return cache.totalsWithBdi;
  });

  /**
   * Realizado por categoria, somando os itens dos pagamentos.
   *
   * As categorias dos pagamentos usam as chaves do formato antigo
   * (`maoDeObra`, `equipamento`…), as mesmas da EAP — por isso o
   * cruzamento é direto.
   *
   * Só entram pagamentos confirmados — um pagamento `pendente` ainda
   * pode ser editado ou cancelado no fluxo, então não é "realizado" de
   * fato ainda. Mesma regra já aplicada no Realizado da EAP.
   */
  protected readonly realizado = computed(() => {
    const totais = TIPOS_CUSTO.reduce<Record<string, number>>((acc, t) => {
      acc[t.chave] = 0;
      return acc;
    }, {});

    for (const pagamento of this.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      for (const item of pagamento.itens) {
        const valor =
          item.modoValor === 'percentual'
            ? pagamento.valorTotal * ((Number(item.valor) || 0) / 100)
            : Number(item.valor) || 0;

        if (item.tipo && item.tipo in totais) totais[item.tipo] += valor;
      }
    }

    return totais;
  });

  protected readonly realizadoTotal = computed(() =>
    this.pagamentos()
      .filter((p) => p.status !== 'pendente')
      .reduce((soma, p) => soma + calcularSomaItens(p), 0),
  );

  /** Quanto ainda cabe no orçamento. Negativo = estourou. */
  protected readonly saldoTotal = computed(() => this.orcadoTotal() - this.realizadoTotal());

  protected readonly temDados = computed(
    () => this.itensEap().length > 0 || this.pagamentos().length > 0,
  );

  ngOnInit(): void {
    this.carregar(this.obraId());
  }

  private carregar(obraId: string): void {
    this.carregando.set(true);

    this.api.obterEap(obraId).subscribe({
      next: (payload) => {
        const brutos = payload.eapItems;
        if (Array.isArray(brutos)) {
          this.itensEap.set(
            aplicarNumeracaoAutomatica(
              brutos.map((i) => normalizarItemEap(i as Record<string, unknown>)),
            ),
          );
        }
        this.cabecalhoEap.set(normalizarCabecalho(payload.header));
        this.carregarPagamentos(obraId);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os dados.');
        this.carregando.set(false);
      },
    });
  }

  private carregarPagamentos(obraId: string): void {
    this.armazenamento.ler(chavePagamentos(obraId)).subscribe({
      next: (value) => {
        const dados = this.interpretar(value);
        const lista = dados?.['pagamentos'];
        if (Array.isArray(lista)) {
          this.pagamentos.set(
            lista.map((p) => normalizarPagamento(p as Record<string, unknown>)),
          );
        }
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }

  // ------------------------------------------------------------------
  protected saldoDe(chave: string): number {
    return (this.orcado()[chave] ?? 0) - (this.realizado()[chave] ?? 0);
  }

  /** Percentual já consumido de uma categoria. */
  protected consumoDe(chave: string): number {
    const orcado = this.orcado()[chave] ?? 0;
    if (orcado <= 0) return 0;
    return ((this.realizado()[chave] ?? 0) / orcado) * 100;
  }

  protected consumoTotal(): number {
    const orcado = this.orcadoTotal();
    if (orcado <= 0) return 0;
    return (this.realizadoTotal() / orcado) * 100;
  }

  /** Barra limitada a 100% para não vazar do desenho quando estoura. */
  protected larguraBarra(percentual: number): number {
    return Math.min(100, Math.max(0, percentual));
  }

  protected estourou(chave: string): boolean {
    return this.saldoDe(chave) < 0;
  }

  private interpretar(bruto: string | null): Record<string, unknown> | null {
    if (!bruto) return null;
    try {
      const dados = JSON.parse(bruto);
      return typeof dados === 'object' && dados !== null ? (dados as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
