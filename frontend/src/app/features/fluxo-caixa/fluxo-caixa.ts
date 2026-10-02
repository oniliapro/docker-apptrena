import { Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { Chart, ChartConfiguration } from 'chart.js/auto';

import { formatarMoeda } from '../../core/utils/formato';
import { PagamentosStore } from '../pagamentos/pagamentos.store';
import { RecebimentosStore } from '../recebimentos/recebimentos.store';
import {
  PontoFluxoCaixa,
  UNIDADES_PERIODO_CAIXA,
  UnidadePeriodoCaixa,
  calcularFluxoCaixa,
} from './fluxo-caixa-engine';

/**
 * Fluxo de Caixa da obra (01/10/2026, pedido do Lucas — Parte 3 das
 * pendências de outubro, adiantada na frente do Cronograma de obra).
 *
 * Saldo acumulado (recebimentos − pagamentos) numa linha do tempo, com o
 * período trocável (dia a ano — ver `fluxo-caixa-engine.ts`). Duas séries:
 * "Realizado" (só lançamentos confirmados) e "Projetado" (confirmados +
 * pendentes) — pra mostrar tanto o caixa real quanto a tendência se tudo
 * que já foi lançado (mas ainda não conferido) se confirmar. Sem conceito
 * de saldo inicial: o acumulado começa do zero no primeiro lançamento
 * encontrado — é uma TENDÊNCIA relativa, não o saldo bancário real (o
 * sistema não rastreia conta bancária).
 */
@Component({
  selector: 'app-fluxo-caixa',
  providers: [PagamentosStore, RecebimentosStore],
  templateUrl: './fluxo-caixa.html',
  styleUrl: './fluxo-caixa.scss',
})
export class FluxoCaixa implements OnInit, OnDestroy {
  protected readonly pagamentosStore = inject(PagamentosStore);
  protected readonly recebimentosStore = inject(RecebimentosStore);

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly unidades = UNIDADES_PERIODO_CAIXA;
  protected readonly unidade = signal<UnidadePeriodoCaixa>('mes');

  protected readonly carregando = computed(
    () => this.pagamentosStore.carregando() || this.recebimentosStore.carregando(),
  );

  protected readonly pontos = computed<PontoFluxoCaixa[]>(() =>
    calcularFluxoCaixa(this.pagamentosStore.pagamentos(), this.recebimentosStore.recebimentos(), this.unidade()),
  );

  protected readonly ultimoPonto = computed(() => this.pontos().at(-1) ?? null);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private grafico: Chart | null = null;

  constructor() {
    effect(() => {
      this.desenharGrafico(this.pontos());
    });
  }

  ngOnInit(): void {
    this.pagamentosStore.carregar(this.obraId());
    this.recebimentosStore.carregar(this.obraId());
  }

  ngOnDestroy(): void {
    this.grafico?.destroy();
  }

  protected mudarUnidade(evento: Event): void {
    this.unidade.set((evento.target as HTMLSelectElement).value as UnidadePeriodoCaixa);
  }

  /**
   * Lê as cores de verdade do tema (`_tokens.scss`) em vez de valores fixos
   * — o Canvas 2D não resolve `var(--x)` sozinho, por isso o
   * `getComputedStyle` aqui. Sem isso o gráfico fica com cores que não são
   * as da marca ComTrena (bug visto pelo Lucas, 01/10/2026 — a 1ª versão
   * usava verde/âmbar "de memória", da paleta antiga "ObraCerta", nunca
   * atualizados na reforma de identidade visual de 28/09/2026).
   */
  private cor(variavel: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(variavel).trim();
  }

  private desenharGrafico(pontos: PontoFluxoCaixa[]): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;

    this.grafico?.destroy();
    if (!pontos.length) {
      this.grafico = null;
      return;
    }

    const corPrimaria = this.cor('--cor-primaria');
    const corDestaque = this.cor('--cor-destaque');
    const corTexto = this.cor('--cor-texto');
    const corTextoSuave = this.cor('--cor-texto-suave');
    const corBorda = this.cor('--cor-borda');
    const corSuperficie = this.cor('--cor-superficie');
    const fonte = this.cor('--fonte') || 'Inter, sans-serif';

    Chart.defaults.font.family = fonte;
    Chart.defaults.color = corTextoSuave;

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: pontos.map((p) => p.periodo.rotulo),
        datasets: [
          {
            label: 'Realizado',
            data: pontos.map((p) => p.saldoRealizadoAcumulado),
            borderColor: corPrimaria,
            backgroundColor: corPrimaria,
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.15,
          },
          {
            label: 'Projetado (com pendentes)',
            data: pontos.map((p) => p.saldoProjetadoAcumulado),
            borderColor: corDestaque,
            backgroundColor: corDestaque,
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 2,
            tension: 0.15,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { color: corBorda },
            ticks: { color: corTextoSuave, font: { family: fonte } },
          },
          y: {
            grid: { color: corBorda },
            ticks: { callback: (valor) => formatarMoeda(Number(valor)), color: corTextoSuave, font: { family: fonte } },
          },
        },
        plugins: {
          legend: {
            labels: { color: corTexto, font: { family: fonte } },
          },
          tooltip: {
            backgroundColor: corSuperficie,
            titleColor: corTexto,
            bodyColor: corTexto,
            borderColor: corBorda,
            borderWidth: 1,
            titleFont: { family: fonte, weight: 'bold' },
            bodyFont: { family: fonte },
            padding: 10,
            callbacks: {
              title: (itens) => {
                const ponto = pontos[itens[0]?.dataIndex ?? 0];
                if (!ponto) return '';
                const inicio = ponto.periodo.inicio.toLocaleDateString('pt-BR');
                const fim = new Date(ponto.periodo.fim.getTime() - 86400000).toLocaleDateString('pt-BR');
                return `${inicio} – ${fim}`;
              },
              label: (item) => `${item.dataset.label}: ${formatarMoeda(Number(item.parsed.y))}`,
            },
          },
        },
      },
    };

    this.grafico = new Chart(canvas, config);
  }
}
