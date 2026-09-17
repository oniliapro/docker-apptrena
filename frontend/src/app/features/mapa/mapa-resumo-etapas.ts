import { computed, signal } from '@angular/core';

import { Alocacao, Fornecedor, ItemMapa, NotaFornecedor } from './mapa.models';
import { calcularBaseItem } from './mapa-engine';
import { obterRateiosDoItem, redistribuirPercentuaisPorEtapa } from './mapa-resumos';

/** Uma célula do cruzamento etapa × fornecedor. */
export interface CelulaEtapa {
  etapa: string;
  fornecedor: number;
  /** Valor dos itens daquela etapa comprados daquele fornecedor. */
  base: number;
  /** Percentual do frete da nota atribuído a esta etapa. */
  fretePct: number;
  /** Percentual do desconto da nota atribuído a esta etapa. */
  descPct: number;
  /** `fretePct` já convertido pra R$ — pra exibir/editar em valor em vez de percentual. */
  freteValor: number;
  /** `descPct` já convertido pra R$. */
  descValor: number;
  travada: boolean;
  /** Markup sobre (base + parte do frete − parte do desconto) — mesma taxa da nota do fornecedor. */
  markup: number;
  /** base + parte do frete − parte do desconto, com markup. */
  total: number;
}

export interface LinhaEtapa {
  etapa: string;
  celulas: CelulaEtapa[];
  base: number;
  total: number;
}

/**
 * Rateio dos resumos: cruza etapas da obra com fornecedores.
 *
 * Depois de decidir de quem comprar, resta dizer de qual etapa sai cada
 * real — inclusive as parcelas de frete e desconto, que são da nota
 * inteira e precisam ser divididas entre as etapas que ela atende.
 *
 * As travas ficam neste estado, e não persistidas: são um ajuste de
 * simulação, não um dado do mapa. Reabrir a tela recomeça com a divisão
 * proporcional, que é o padrão sensato.
 */
export class ResumoEtapas {
  /** Travas por "fornecedor|etapa". */
  private readonly travas = signal<Record<string, boolean>>({});

  /** Percentuais editados à mão, por "fornecedor|etapa". */
  private readonly freteManual = signal<Record<string, number>>({});
  private readonly descManual = signal<Record<string, number>>({});

  /**
   * Unidade de exibição/edição de cada célula — %, ou R$ (17/08/2026,
   * pedido do Lucas). Só muda como o número é mostrado e digitado: por
   * baixo o valor de verdade continua sendo o percentual (`fretePct`/
   * `descPct`), então trocar a unidade não perde o rateio já feito.
   */
  private readonly unidadeFrete = signal<Record<string, 'pct' | 'valor'>>({});
  private readonly unidadeDesconto = signal<Record<string, 'pct' | 'valor'>>({});

  readonly chave = (fornecedor: number, etapa: string) => `${fornecedor}|${etapa}`;

  unidadeFreteDe(fornecedor: number, etapa: string): 'pct' | 'valor' {
    return this.unidadeFrete()[this.chave(fornecedor, etapa)] ?? 'pct';
  }

  alternarUnidadeFrete(fornecedor: number, etapa: string): void {
    const chave = this.chave(fornecedor, etapa);
    const atual = this.unidadeFrete()[chave] ?? 'pct';
    this.unidadeFrete.update((m) => ({ ...m, [chave]: atual === 'pct' ? 'valor' : 'pct' }));
  }

  unidadeDescontoDe(fornecedor: number, etapa: string): 'pct' | 'valor' {
    return this.unidadeDesconto()[this.chave(fornecedor, etapa)] ?? 'pct';
  }

  alternarUnidadeDesconto(fornecedor: number, etapa: string): void {
    const chave = this.chave(fornecedor, etapa);
    const atual = this.unidadeDesconto()[chave] ?? 'pct';
    this.unidadeDesconto.update((m) => ({ ...m, [chave]: atual === 'pct' ? 'valor' : 'pct' }));
  }

  estaTravada(fornecedor: number, etapa: string): boolean {
    return Boolean(this.travas()[this.chave(fornecedor, etapa)]);
  }

  alternarTrava(fornecedor: number, etapa: string): void {
    const chave = this.chave(fornecedor, etapa);
    this.travas.update((atual) => ({ ...atual, [chave]: !atual[chave] }));
  }

  definirFrete(fornecedor: number, etapa: string, percentual: number): void {
    // Editar o valor trava a célula: seria contraintuitivo digitar um
    // número e vê-lo ser sobrescrito pela redistribuição em seguida.
    const chave = this.chave(fornecedor, etapa);
    this.freteManual.update((atual) => ({ ...atual, [chave]: percentual }));
    this.travas.update((atual) => ({ ...atual, [chave]: true }));
  }

  definirDesconto(fornecedor: number, etapa: string, percentual: number): void {
    const chave = this.chave(fornecedor, etapa);
    this.descManual.update((atual) => ({ ...atual, [chave]: percentual }));
    this.travas.update((atual) => ({ ...atual, [chave]: true }));
  }

  limparTravas(): void {
    this.travas.set({});
    this.freteManual.set({});
    this.descManual.set({});
  }

  /**
   * Monta o cruzamento etapa × fornecedor a partir das alocações.
   *
   * Cada item contribui com sua base para as etapas que atende, na
   * proporção do rateio do próprio item. Depois, o frete e o desconto de
   * cada nota se dividem entre as etapas daquele fornecedor.
   */
  calcular(
    alocacoes: Alocacao[],
    itens: ItemMapa[],
    fornecedores: Fornecedor[],
    notas: NotaFornecedor[],
  ): LinhaEtapa[] {
    // 1) Base por etapa e por fornecedor
    const basePorEtapaFornecedor = new Map<string, Map<number, number>>();

    for (const alocacao of alocacoes) {
      const item = itens[alocacao.itemIndex];
      if (!item) continue;

      const si = alocacao.supplierIndex;
      const base = calcularBaseItem(item, si);
      if (base <= 0) continue;

      for (const rateio of obterRateiosDoItem(item)) {
        if (!basePorEtapaFornecedor.has(rateio.etapaKey)) {
          basePorEtapaFornecedor.set(rateio.etapaKey, new Map());
        }
        const porFornecedor = basePorEtapaFornecedor.get(rateio.etapaKey)!;
        porFornecedor.set(si, (porFornecedor.get(si) ?? 0) + base * rateio.fator);
      }
    }

    const etapas = Array.from(basePorEtapaFornecedor.keys()).sort();
    const usados = Array.from(new Set(alocacoes.map((a) => a.supplierIndex))).sort((a, b) => a - b);

    // 2) Percentuais de frete e desconto, por fornecedor
    const fretePorFornecedor = new Map<number, Record<string, number>>();
    const descPorFornecedor = new Map<number, Record<string, number>>();

    for (const si of usados) {
      const basePorEtapa = new Map<string, number>();
      for (const etapa of etapas) {
        basePorEtapa.set(etapa, basePorEtapaFornecedor.get(etapa)?.get(si) ?? 0);
      }

      const travadas: Record<string, boolean> = {};
      const atuaisFrete: Record<string, number> = {};
      const atuaisDesc: Record<string, number> = {};

      for (const etapa of etapas) {
        const chave = this.chave(si, etapa);
        travadas[etapa] = Boolean(this.travas()[chave]);
        atuaisFrete[etapa] = Number(this.freteManual()[chave]) || 0;
        atuaisDesc[etapa] = Number(this.descManual()[chave]) || 0;
      }

      fretePorFornecedor.set(
        si,
        redistribuirPercentuaisPorEtapa(etapas, basePorEtapa, atuaisFrete, travadas),
      );
      descPorFornecedor.set(
        si,
        redistribuirPercentuaisPorEtapa(etapas, basePorEtapa, atuaisDesc, travadas),
      );
    }

    // 3) Monta as linhas
    return etapas.map((etapa) => {
      const celulas: CelulaEtapa[] = usados.map((si) => {
        const base = basePorEtapaFornecedor.get(etapa)?.get(si) ?? 0;
        const nota = notas[si];
        const fretePct = Number(fretePorFornecedor.get(si)?.[etapa]) || 0;
        const descPct = Number(descPorFornecedor.get(si)?.[etapa]) || 0;

        const parcelaFrete = (Number(nota?.frete) || 0) * (fretePct / 100);
        const parcelaDesconto = (Number(nota?.desconto) || 0) * (descPct / 100);
        const taxa = (Number(fornecedores[si]?.imposto) || 0) / 100;

        // Markup incide sobre base + frete − desconto, igual à nota.
        const baseTributavel = base + parcelaFrete - parcelaDesconto;
        const markup = baseTributavel * taxa;

        return {
          etapa,
          fornecedor: si,
          base,
          fretePct,
          descPct,
          freteValor: parcelaFrete,
          descValor: parcelaDesconto,
          travada: this.estaTravada(si, etapa),
          markup,
          total: baseTributavel + markup,
        };
      });

      return {
        etapa,
        celulas,
        base: celulas.reduce((soma, c) => soma + c.base, 0),
        total: celulas.reduce((soma, c) => soma + c.total, 0),
      };
    });
  }
}
