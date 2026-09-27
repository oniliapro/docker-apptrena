import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { FormulaCampo, FormulasContexto } from '../../shared/numero/formulas-guardadas';
import { nomeArquivoPdf } from '../../shared/pdf-nome-arquivo';
import { ApiService } from '../../core/services/api.service';
import { formatarMoeda } from '../../core/utils/formato';
import { formatarPercentual, parsearBR } from '../pagamentos/pagamentos-calc';
import { itensOcultosPorColapso, recuoDoCodigoEap } from '../eap/eap-normalize';
import { EapStore } from '../eap/eap.store';
import { ChaveTipo, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
import { limitarPercentual, pctParaValor, valorParaPct } from './medicao-engine';
import { MedicaoStore } from './medicao.store';

/**
 * Grade de lançamento de uma medição (23/08/2026, pedido do Lucas) — uma
 * linha por item da EAP (mesma hierarquia/recuo da tela da EAP), uma
 * coluna por categoria de custo + "Medição total". O cálculo (média
 * ponderada dos grupos, acumulado anterior, %/R$) vive em
 * `MedicaoStore`/`medicao-engine.ts` — este componente só lê e traduz
 * pra tela.
 */
@Component({
  selector: 'app-medicao',
  imports: [DatePipe, RedimensionarColunas, FormulaCampo],
  providers: [EapStore, MedicaoStore, FormulasContexto],
  templateUrl: './medicao.html',
  styleUrl: './medicao.scss',
})
export class Medicao implements OnInit {
  protected readonly eap = inject(EapStore);
  protected readonly store = inject(MedicaoStore);
  /** Fórmulas guardadas dos campos de valor (ver `formulas-guardadas.ts`). */
  private readonly formulas = inject(FormulasContexto);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly obraId = input.required<string>({ alias: 'id' });
  readonly medicaoId = input.required<string>({ alias: 'medicaoId' });

  protected readonly tipos = TIPOS_CUSTO;
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarPercentual = formatarPercentual;
  protected readonly recuo = (item: ItemEap) => recuoDoCodigoEap(item.eap);

  /** Estado do botão "Baixar PDF" (24/08/2026) — ver MedicaoPdfController. */
  protected readonly gerandoPdf = signal(false);
  protected readonly erroPdf = signal<string | null>(null);

  ngOnInit(): void {
    this.store.carregar(this.obraId(), this.medicaoId());
    this.formulas.definir('medicao.' + this.medicaoId());
  }

  /** Mesmo padrão de `Mapa.baixarPdf()`/`Eap.baixarPdf()`. */
  protected baixarPdf(): void {
    this.erroPdf.set(null);
    this.gerandoPdf.set(true);

    this.api.baixarMedicaoPdf(this.medicaoId()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivoPdf(
          'Medicao',
          [this.eap.cabecalho().mapNumber, this.store.payload()?.sequencia],
          this.medicaoId(),
        );
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
   * Quais categorias aparecem na grade (pedido do Lucas, 24/08/2026) —
   * só filtro de exibição, estado de tela (como a unidade %/R$): esconder
   * uma categoria não muda a "Medição total" nem o cálculo, que sempre
   * considera as 5 categorias (`MedicaoStore.pctTotal`).
   */
  protected readonly tiposVisiveis = signal<Record<ChaveTipo, boolean>>(
    TIPOS_CUSTO.reduce(
      (acc, t) => ({ ...acc, [t.chave]: true }),
      {} as Record<ChaveTipo, boolean>,
    ),
  );

  protected readonly tiposParaExibir = computed(() =>
    this.tipos.filter((t) => this.tiposVisiveis()[t.chave]),
  );

  protected alternarTipoVisivel(chave: ChaveTipo): void {
    this.tiposVisiveis.update((atual) => ({ ...atual, [chave]: !atual[chave] }));
  }

  protected voltar(): void {
    void this.router.navigate(['/obras', this.obraId(), 'medicoes']);
  }

  /**
   * Gera um recebimento pendente a partir do avanço desta medição
   * (01/09/2026, pedido do Lucas) — mesmo padrão de confirmação de
   * `Empreita.fecharPeriodo()` antes de chamar o store.
   */
  protected gerarRecebimento(): void {
    if (
      !window.confirm(
        'Gerar um recebimento a partir do avanço desta medição? Cria um recebimento pendente, pra confirmar depois na aba Recebimentos.',
      )
    ) {
      return;
    }
    this.store.gerarRecebimento();
  }

  // ------------------------------------------------------------------
  // Alternância %/R$ por célula — não persiste, só conveniência de
  // digitação (mesmo padrão de `ResumoEtapas.unidadeFrete` no Mapa): o
  // valor gravado é sempre percentual, a unidade é só como mostrar/editar.
  // ------------------------------------------------------------------
  private readonly unidadePorCelula = signal<Record<string, 'pct' | 'valor'>>({});

  private chaveCelula(eapItemId: string, tipo: ChaveTipo): string {
    return `${eapItemId}:${tipo}`;
  }

  protected unidadeDe(eapItemId: string, tipo: ChaveTipo): 'pct' | 'valor' {
    return this.unidadePorCelula()[this.chaveCelula(eapItemId, tipo)] ?? 'pct';
  }

  protected alternarUnidade(eapItemId: string, tipo: ChaveTipo): void {
    const chave = this.chaveCelula(eapItemId, tipo);
    const atual = this.unidadePorCelula()[chave] ?? 'pct';
    this.unidadePorCelula.update((m) => ({ ...m, [chave]: atual === 'pct' ? 'valor' : 'pct' }));
  }

  // ------------------------------------------------------------------
  // Leitura/edição de célula — cada célula empilha o acumulado da
  // medição anterior (só leitura) e o input da nova medição, mesmo
  // padrão visual do bloco "Real./Orç." da EAP (pedido do Lucas,
  // 24/08/2026).
  // ------------------------------------------------------------------
  /** Orçado do item nesta categoria — sempre em R$, sem alternância (pedido do Lucas, 24/08/2026). */
  protected valorOrcado(item: ItemEap, tipo: ChaveTipo): string {
    return formatarMoeda(this.store.orcadoDoItem(item.id, tipo));
  }

  protected valorAcumulado(item: ItemEap, tipo: ChaveTipo): string {
    const pct = this.store.acumuladoAnterior(item.id, tipo);
    if (this.unidadeDe(item.id, tipo) === 'valor') {
      return formatarMoeda(pctParaValor(pct, this.store.orcadoDoItem(item.id, tipo)));
    }
    return pct.toFixed(2);
  }

  /** Avanço desta categoria — sempre em R$, sem alternância (pedido do Lucas, 24/08/2026). */
  protected valorAvanco(item: ItemEap, tipo: ChaveTipo): string {
    return formatarMoeda(this.store.avancoDoItemTipoRS(item.id, tipo));
  }

  protected valorCelula(item: ItemEap, tipo: ChaveTipo): string {
    const pct = this.store.pctEfetivo(item.id, tipo);
    if (this.unidadeDe(item.id, tipo) === 'valor') {
      return formatarMoeda(pctParaValor(pct, this.store.orcadoDoItem(item.id, tipo)));
    }
    return pct.toFixed(2);
  }

  /**
   * Uma medição nova nunca pode ficar abaixo do acumulado anterior nem
   * passar de 100% (pedido do Lucas, 24/08/2026: "o sistema não pode
   * permitir") — trava no próprio input, não só um aviso visual: o valor
   * digitado é sempre ajustado pro intervalo `[acumulado, 100]` antes de
   * gravar.
   */
  protected editarCelula(item: ItemEap, tipo: ChaveTipo, evento: Event): void {
    const bruto = parsearBR((evento.target as HTMLInputElement).value);
    const pctDigitado =
      this.unidadeDe(item.id, tipo) === 'valor'
        ? valorParaPct(bruto, this.store.orcadoDoItem(item.id, tipo))
        : bruto;

    const acumulado = this.store.acumuladoAnterior(item.id, tipo);
    const pct = Math.max(limitarPercentual(pctDigitado), acumulado);

    // Editar a célula de um grupo é o próprio ato de sobrescrever à mão
    // (`manual: true`) — numa folha o flag não muda o cálculo (ela nunca
    // "herda" de filhos), só existe pra manter o mesmo formato de célula.
    this.store.gravarCelula(item.id, tipo, pct, item.isGroup);
  }

  protected reverterAutomatico(item: ItemEap, tipo: ChaveTipo): void {
    this.store.reverterAutomatico(item.id, tipo);
  }

  protected larguraBarra(pct: number): number {
    return Math.min(100, Math.max(0, pct));
  }

  // ------------------------------------------------------------------
  // Recolher/expandir grupos — mesmo mecanismo da EAP (`eap.ts`, pedido
  // do Lucas 17/08/2026, agora replicado aqui a pedido dele 24/08/2026).
  // ------------------------------------------------------------------
  private readonly gruposColapsados = signal<Set<string>>(new Set());

  protected readonly itensOcultos = computed(() =>
    itensOcultosPorColapso(this.eap.itens(), this.gruposColapsados()),
  );

  protected estaColapsado(item: ItemEap): boolean {
    return this.gruposColapsados().has(item.id);
  }

  protected alternarColapso(item: ItemEap): void {
    this.gruposColapsados.update((atual) => {
      const novo = new Set(atual);
      if (novo.has(item.id)) novo.delete(item.id);
      else novo.add(item.id);
      return novo;
    });
  }

  protected readonly existeGrupoColapsado = computed(() => this.gruposColapsados().size > 0);

  protected alternarTodosOsColapsos(): void {
    if (this.existeGrupoColapsado()) {
      this.gruposColapsados.set(new Set());
      return;
    }
    const todosOsGrupos = this.eap.itens().filter((i) => i.isGroup).map((i) => i.id);
    this.gruposColapsados.set(new Set(todosOsGrupos));
  }
}
