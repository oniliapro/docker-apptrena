import { computed, signal } from '@angular/core';

/** Quantos lançamentos cada bloco mostra de início e quantos "Ver mais" acrescenta (15/10/2026, pedido do Lucas). */
export const PASSO_BLOCO = 5;

export interface OpcaoFiltroBloco {
  valor: string;
  rotulo: string;
}

/**
 * Estado de UM bloco de lista do dashboard (15/10/2026, pedido do Lucas):
 * lista completa já ordenada (mais recente primeiro), no máximo dois
 * filtros — status e obra — e o "Ver mais", que mostra mais 5 lançamentos
 * dentro do MESMO espaço do bloco (o corpo rola por dentro, o bloco não
 * cresce). Mudar um filtro volta pra primeira página (5 itens).
 *
 * Genérico no tipo do lançamento: cada bloco entrega só como ler o status e a
 * obra de um item — o resto (como desenhar a linha) fica no template.
 */
export class BlocoLista<T> {
  readonly itens = signal<T[]>([]);
  readonly carregando = signal(true);
  readonly filtroStatus = signal('');
  readonly filtroObra = signal('');
  private readonly visiveis = signal(PASSO_BLOCO);

  constructor(
    /** Opções do filtro de status (além de "Todos"). Vazio = o bloco não tem filtro de status. */
    readonly opcoesStatus: readonly OpcaoFiltroBloco[],
    private readonly statusDe: (item: T) => string,
    private readonly obraDe: (item: T) => string,
    statusInicial = '',
  ) {
    this.filtroStatus.set(statusInicial);
  }

  /** Obras que aparecem nos lançamentos do bloco (sem repetir, em ordem alfabética). */
  readonly obras = computed(() =>
    [...new Set(this.itens().map((i) => this.obraDe(i).trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
    ),
  );

  readonly filtrados = computed(() => {
    const status = this.filtroStatus();
    const obra = this.filtroObra();
    return this.itens().filter(
      (i) => (!status || this.statusDe(i) === status) && (!obra || this.obraDe(i).trim() === obra),
    );
  });

  readonly exibidos = computed(() => this.filtrados().slice(0, this.visiveis()));
  readonly restantes = computed(() => Math.max(0, this.filtrados().length - this.visiveis()));
  /** Depois do primeiro "Ver mais" o corpo passa a rolar — o bloco continua do mesmo tamanho. */
  readonly expandido = computed(() => this.visiveis() > PASSO_BLOCO);
  readonly temFiltroAtivo = computed(() => !!this.filtroStatus() || !!this.filtroObra());

  verMais(): void {
    this.visiveis.update((v) => v + PASSO_BLOCO);
  }

  mudarStatus(valor: string): void {
    this.filtroStatus.set(valor);
    this.visiveis.set(PASSO_BLOCO);
  }

  mudarObra(valor: string): void {
    this.filtroObra.set(valor);
    this.visiveis.set(PASSO_BLOCO);
  }
}
