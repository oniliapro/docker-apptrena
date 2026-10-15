import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { Obra, PlanejamentoCronograma } from '../../core/models/api.models';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { expandirItensPagamento, parsearBR } from '../pagamentos/pagamentos-calc';
import { EapStore } from '../eap/eap.store';
import { ehDescendente } from '../eap/eap-engine';
import { criarVazioPorTipo, itensOcultosPorColapso, recuoDoCodigoEap } from '../eap/eap-normalize';
import { ChaveTipo, ItemEap, PorTipo, TIPOS_CUSTO } from '../eap/eap.models';
import { ItemPagamentoCalculado, Pagamento } from '../pagamentos/pagamentos.models';
import { PagamentosStore } from '../pagamentos/pagamentos.store';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { FormulaCampo, FormulasContexto } from '../../shared/numero/formulas-guardadas';
import { nomeArquivoPdf } from '../../shared/pdf-nome-arquivo';
import { agoraDeParede } from '../../core/utils/fuso';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';
import { dataDentroDoIntervalo, valoresDistintos } from '../../shared/filtros/filtros';
import {
  Periodo,
  UNIDADES_PERIODO,
  UnidadePeriodo,
  gerarPeriodos,
  paraDataLocal,
  periodoContendo,
} from './cronograma-desembolso-engine';

interface LinhaCronograma {
  item: ItemEap;
  /** Orçado (com BDI) — mesmo valor que a EAP mostra, só referência aqui. */
  orcado: number;
  /** Valor desembolsado (pagamentos confirmados) em cada período, por chave (início ISO do período). */
  porPeriodoRealizado: Record<string, number>;
  /** Valor planejado em cada período — ver `cronograma_planejamentos` (24/08/2026, pedido do Lucas). */
  porPeriodoPlanejado: Record<string, number>;
  totalRealizado: number;
  totalPlanejado: number;
}

const CHAVES_TIPO = new Set(TIPOS_CUSTO.map((t) => t.chave));

/**
 * Cronograma de desembolso — matriz EAP × período (item 3 do roteiro
 * combinado com a Onilia, 04/08/2026; reformulado em 24/08/2026, pedido
 * do Lucas: "empilhar realizado com planejado" + unidade de período
 * configurável + prazo da obra).
 *
 * Os períodos agora são uma GRADE FIXA (data base da obra até data base +
 * prazo, fatiada na unidade escolhida — dia/semana/quinzena/mês/ano),
 * não mais só os meses que já tiveram pagamento: precisa cobrir período
 * futuro pra fazer sentido planejar desembolso neles. Cada célula
 * empilha o Realizado (pagamentos confirmados, calculado ao vivo, mesma
 * fonte de sempre) com o Planejado (um botão que abre um popup — valor
 * digitado à mão, gravado em `cronograma_planejamentos`).
 */
@Component({
  selector: 'app-cronograma-desembolso',
  imports: [RedimensionarColunas, FormulaCampo],
  providers: [EapStore, PagamentosStore, FormulasContexto],
  templateUrl: './cronograma-desembolso.html',
  styleUrl: './cronograma-desembolso.scss',
})
export class CronogramaDesembolso implements OnInit {
  protected readonly eap = inject(EapStore);
  /** Fórmulas guardadas dos campos de valor (ver `formulas-guardadas.ts`). */
  private readonly formulas = inject(FormulasContexto);
  protected readonly pagamentosStore = inject(PagamentosStore);
  private readonly api = inject(ApiService);
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;

  /** Estado do botão "Baixar PDF" (23/08/2026) — ver CronogramaPdfController. */
  protected readonly gerandoPdf = signal(false);
  protected readonly erroPdf = signal<string | null>(null);

  /**
   * Id da obra — vem do param `:id` da rota pai (/obras/:id), herdado via
   * `withRouterConfig({ paramsInheritanceStrategy: 'always' })`. Mesmo
   * mecanismo usado pela EAP, Empreita e Mapa.
   */
  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly carregando = computed(
    () => this.eap.carregando() || this.pagamentosStore.carregando(),
  );

  // ------------------------------------------------------------------
  // Obra (data base + prazo) — não vem do EapStore porque `prazo_meses`
  // não é dado de EAP, é campo próprio da obra.
  // ------------------------------------------------------------------
  protected readonly obra = signal<Obra | null>(null);
  protected readonly salvandoObra = signal(false);

  protected readonly unidadePeriodo = signal<UnidadePeriodo>('mes');
  protected readonly unidadesPeriodo = UNIDADES_PERIODO;

  ngOnInit(): void {
    this.eap.carregar(this.obraId());
    this.formulas.definir('cronograma.' + this.obraId());
    this.pagamentosStore.carregar(this.obraId());
    this.carregarObra();
    this.carregarPlanejamentos();
  }

  private carregarObra(): void {
    this.api.obterObra(this.obraId()).subscribe({
      next: (obra) => this.obra.set(obra),
      error: () => {},
    });
  }

  protected mudarUnidadePeriodo(evento: Event): void {
    this.unidadePeriodo.set((evento.target as HTMLSelectElement).value as UnidadePeriodo);
  }

  /** "AAAA-MM-DD" pro `<input type="date">` — `obra.data_base` volta da API como ISO completo ("AAAA-MM-DDTHH:mm:ss..."). */
  protected dataBaseParaInput(): string {
    return this.obra()?.data_base?.slice(0, 10) ?? '';
  }

  protected salvarDataBase(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value || null;

    this.salvandoObra.set(true);
    this.api.atualizarObra(this.obraId(), { data_base: valor }).subscribe({
      next: (obraAtualizada) => {
        this.obra.set(obraAtualizada);
        this.salvandoObra.set(false);
      },
      error: () => this.salvandoObra.set(false),
    });
  }

  protected salvarPrazo(evento: Event): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    const prazoMeses = bruto ? Math.max(1, Math.round(Number(bruto))) : null;

    this.salvandoObra.set(true);
    this.api.atualizarObra(this.obraId(), { prazo_meses: prazoMeses }).subscribe({
      next: (obraAtualizada) => {
        this.obra.set(obraAtualizada);
        this.salvandoObra.set(false);
      },
      error: () => this.salvandoObra.set(false),
    });
  }

  /**
   * Baixa o PDF do cronograma (23/08/2026) — ver CronogramaPdfController/
   * cronograma-desembolso-imprimir.ts. Mesmo padrão de `Mapa.baixarPdf()`.
   */
  protected baixarPdf(): void {
    this.erroPdf.set(null);
    this.gerandoPdf.set(true);

    this.api.baixarCronogramaPdf(this.obraId()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivoPdf('Cronograma', [this.obra()?.map_number, this.obra()?.obra_nome], this.obraId());
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

  // ------------------------------------------------------------------
  // Períodos (colunas) — grade fixa entre data base e data base + prazo,
  // na unidade escolhida (24/08/2026). Vazia enquanto faltar data base
  // ou prazo — a tela pede os dois nesse caso.
  // ------------------------------------------------------------------
  protected readonly periodos = computed<Periodo[]>(() => {
    const o = this.obra();
    if (!o?.data_base || !o?.prazo_meses) return [];
    return gerarPeriodos(paraDataLocal(o.data_base), o.prazo_meses, this.unidadePeriodo());
  });

  private dataDoPagamento(pagamento: Pagamento): Date | null {
    const bruto = pagamento.dataPagamento || pagamento.dataSolicitacao;
    return bruto ? paraDataLocal(bruto) : null;
  }

  /** Soma de pagamentos confirmados cuja data cai FORA da grade (antes da data base, ou depois do prazo) — aviso, pra não "sumir" dinheiro em silêncio. */
  protected readonly realizadoForaDoPrazo = computed(() => {
    const periodos = this.periodos();
    if (!periodos.length) return 0;

    let soma = 0;
    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      const data = this.dataDoPagamento(pagamento);
      if (!data || periodoContendo(periodos, data)) continue;
      for (const item of expandirItensPagamento(pagamento)) soma += item.valorCalculado;
    }
    return soma;
  });

  // ------------------------------------------------------------------
  // Matriz (linhas × períodos)
  // ------------------------------------------------------------------
  /** eapId do item-base → { período: valor desembolsado naquele período }. */
  private readonly matrizRealizadoPorItemBase = computed(() => {
    const mapa = new Map<string, Record<string, number>>();
    const periodos = this.periodos();
    if (!periodos.length) return mapa;

    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      const data = this.dataDoPagamento(pagamento);
      if (!data) continue;
      const periodo = periodoContendo(periodos, data);
      if (!periodo) continue;

      for (const item of expandirItensPagamento(pagamento)) {
        if (!item.eapId) continue;
        const atual = mapa.get(item.eapId) ?? {};
        atual[periodo.chave] = (atual[periodo.chave] ?? 0) + item.valorCalculado;
        mapa.set(item.eapId, atual);
      }
    }
    return mapa;
  });

  /**
   * eapId do item-base → { período → { categoria → valor } } — granularidade
   * real de gravação (24/08/2026, pedido do Lucas: "o input do valor
   * planejado tem que ser discriminado por categoria").
   */
  private readonly planejadoPorItemPeriodoTipo = computed(() => {
    const mapa = new Map<string, Record<string, PorTipo>>();
    for (const p of this.planejamentos()) {
      const porPeriodo = mapa.get(p.eapItemId) ?? {};
      const porTipo = porPeriodo[p.periodoInicio] ?? criarVazioPorTipo();
      porTipo[p.tipo] = p.valor;
      porPeriodo[p.periodoInicio] = porTipo;
      mapa.set(p.eapItemId, porPeriodo);
    }
    return mapa;
  });

  /**
   * eapId do item-base → { período → valor total planejado (soma das 5
   * categorias) } — a grade principal mostra um número só por célula
   * (a quebra por categoria só aparece no popup); o rollup de grupo
   * também soma este total, não categoria por categoria.
   */
  private readonly planejadoPorItemBase = computed(() => {
    const mapa = new Map<string, Record<string, number>>();
    for (const [eapItemId, porPeriodo] of this.planejadoPorItemPeriodoTipo()) {
      const atual: Record<string, number> = {};
      for (const [periodoChave, porTipo] of Object.entries(porPeriodo)) {
        atual[periodoChave] = TIPOS_CUSTO.reduce((soma, t) => soma + (porTipo[t.chave] ?? 0), 0);
      }
      mapa.set(eapItemId, atual);
    }
    return mapa;
  });

  protected readonly linhas = computed<LinhaCronograma[]>(() => {
    const itens = this.eap.itens();
    const cache = this.eap.cache();
    const matrizRealizado = this.matrizRealizadoPorItemBase();
    const matrizPlanejado = this.planejadoPorItemBase();
    const periodos = this.periodos();

    return itens.map((item, indice) => {
      const orcado = item.isGroup
        ? this.eap.totaisDoGrupo(indice).totalWithBdi
        : (cache.totalWithBdi[indice] ?? 0);

      const porPeriodoRealizado: Record<string, number> = {};
      const porPeriodoPlanejado: Record<string, number> = {};
      let totalRealizado = 0;
      let totalPlanejado = 0;

      for (const periodo of periodos) {
        const realizado = item.isGroup
          ? this.somaDescendentesNoPeriodo(item, itens, matrizRealizado, periodo.chave)
          : (matrizRealizado.get(item.id)?.[periodo.chave] ?? 0);
        const planejado = item.isGroup
          ? this.somaDescendentesNoPeriodo(item, itens, matrizPlanejado, periodo.chave)
          : (matrizPlanejado.get(item.id)?.[periodo.chave] ?? 0);

        porPeriodoRealizado[periodo.chave] = realizado;
        porPeriodoPlanejado[periodo.chave] = planejado;
        totalRealizado += realizado;
        totalPlanejado += planejado;
      }

      return { item, orcado, porPeriodoRealizado, porPeriodoPlanejado, totalRealizado, totalPlanejado };
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

  protected readonly totalPlanejadoGeral = computed(() =>
    this.linhas()
      .filter((l) => !l.item.isGroup)
      .reduce((soma, l) => soma + l.totalPlanejado, 0),
  );

  protected totalRealizadoDoPeriodo(chave: string): number {
    return this.linhas()
      .filter((l) => !l.item.isGroup)
      .reduce((soma, l) => soma + (l.porPeriodoRealizado[chave] ?? 0), 0);
  }

  protected totalPlanejadoDoPeriodo(chave: string): number {
    return this.linhas()
      .filter((l) => !l.item.isGroup)
      .reduce((soma, l) => soma + (l.porPeriodoPlanejado[chave] ?? 0), 0);
  }

  // ------------------------------------------------------------------
  // Planejamento (24/08/2026, pedido do Lucas) — popup com o saldo
  // remanescente de cada categoria (orçado − realizado, referência de
  // apoio) e o valor planejado daquele item×período (um número só, sem
  // quebra por categoria). Só faz sentido em item-folha — um grupo já
  // mostra a soma dos filhos, sem lançamento próprio (mesma regra do
  // custo unitário da EAP).
  // ------------------------------------------------------------------
  protected readonly planejamentos = signal<PlanejamentoCronograma[]>([]);
  protected readonly carregandoPlanejamentos = signal(true);
  protected readonly salvandoPlanejamento = signal(false);
  protected readonly popupAberto = signal<{ item: ItemEap; periodo: Periodo } | null>(null);

  private carregarPlanejamentos(): void {
    this.carregandoPlanejamentos.set(true);
    this.api.listarPlanejamentosCronograma(this.obraId()).subscribe({
      next: (lista) => {
        this.planejamentos.set(lista);
        this.carregandoPlanejamentos.set(false);
      },
      error: () => this.carregandoPlanejamentos.set(false),
    });
  }

  protected abrirPopupPlanejamento(item: ItemEap, periodo: Periodo): void {
    if (item.isGroup) return;
    this.popupAberto.set({ item, periodo });
  }

  protected fecharPopupPlanejamento(): void {
    this.popupAberto.set(null);
  }

  protected valorPlanejadoPorTipo(tipo: ChaveTipo): number {
    const aberto = this.popupAberto();
    if (!aberto) return 0;
    return this.planejadoPorItemPeriodoTipo().get(aberto.item.id)?.[aberto.periodo.chave]?.[tipo] ?? 0;
  }

  /** Orçado (com BDI) de uma categoria — item-folha, mesma regra de congelamento da EAP. */
  private orcadoDoItemTipo(item: ItemEap, tipo: ChaveTipo): number {
    const indice = this.eap.itens().findIndex((i) => i.id === item.id);
    if (indice < 0) return 0;

    const cache = this.eap.cache();
    return item.orcadoCongelado
      ? (item.orcadoCongelado[tipo] ?? 0)
      : (cache.directByType[indice]?.[tipo] ?? 0) + (cache.bdiByType[indice]?.[tipo] ?? 0);
  }

  /** Realizado desta categoria, item-folha, TODOS os períodos somados — pro saldo remanescente do popup. */
  private readonly realizadoPorItemPorTipo = computed(() => {
    const mapa = new Map<string, PorTipo>();
    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      for (const item of expandirItensPagamento(pagamento)) {
        if (!item.eapId) continue;
        const tipo = item.tipo as ChaveTipo;
        if (!CHAVES_TIPO.has(tipo)) continue;
        const atual = mapa.get(item.eapId) ?? criarVazioPorTipo();
        atual[tipo] += item.valorCalculado;
        mapa.set(item.eapId, atual);
      }
    }
    return mapa;
  });

  /** Realizado desta categoria, item-folha, POR período — usado só por "Usar valores reais no planejamento". */
  private readonly realizadoPorItemPeriodoTipo = computed(() => {
    const mapa = new Map<string, Record<string, PorTipo>>();
    const periodos = this.periodos();
    if (!periodos.length) return mapa;

    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      const data = this.dataDoPagamento(pagamento);
      if (!data) continue;
      const periodo = periodoContendo(periodos, data);
      if (!periodo) continue;

      for (const item of expandirItensPagamento(pagamento)) {
        if (!item.eapId) continue;
        const tipo = item.tipo as ChaveTipo;
        if (!CHAVES_TIPO.has(tipo)) continue;
        const porPeriodo = mapa.get(item.eapId) ?? {};
        const porTipo = porPeriodo[periodo.chave] ?? criarVazioPorTipo();
        porTipo[tipo] += item.valorCalculado;
        porPeriodo[periodo.chave] = porTipo;
        mapa.set(item.eapId, porPeriodo);
      }
    }
    return mapa;
  });

  /** Soma do planejado desta categoria em TODOS os períodos, EXCETO o informado — pra não descontar do saldo o próprio valor que está sendo editado. */
  private planejadoEmOutrosPeriodos(item: ItemEap, periodoAtual: Periodo, tipo: ChaveTipo): number {
    const porPeriodo = this.planejadoPorItemPeriodoTipo().get(item.id) ?? {};
    let soma = 0;
    for (const [periodoChave, porTipo] of Object.entries(porPeriodo)) {
      if (periodoChave === periodoAtual.chave) continue;
      soma += porTipo[tipo] ?? 0;
    }
    return soma;
  }

  /**
   * Saldo remanescente de uma categoria — orçado menos o que já foi
   * realizado E menos o que já foi planejado em OUTROS períodos (bug
   * corrigido 24/08/2026, achado pelo Lucas: planejar R$ 3.000 numa
   * semana e olhar o saldo de outra semana continuava mostrando o
   * orçado inteiro, porque só descontava o realizado — o "quanto ainda
   * dá pra planejar" precisa considerar o que já foi reservado em outros
   * períodos também, senão a mesma verba pode ser planejada mais de uma
   * vez sem o Lucas perceber). Só referência — não afeta o valor
   * gravado ao salvar.
   */
  protected saldoRemanescentePorCategoria(item: ItemEap, periodoAtual: Periodo, tipo: ChaveTipo): number {
    const orcado = this.orcadoDoItemTipo(item, tipo);
    const realizado = this.realizadoPorItemPorTipo().get(item.id)?.[tipo] ?? 0;
    const planejadoOutros = this.planejadoEmOutrosPeriodos(item, periodoAtual, tipo);
    return orcado - realizado - planejadoOutros;
  }

  // ------------------------------------------------------------------
  // Alternância %/R$ no input do popup (24/08/2026, pedido do Lucas) —
  // mesmo padrão de `MedicaoStore`/`ResumoEtapas`: o valor gravado
  // continua sempre em R$, a unidade é só conveniência de digitação, por
  // categoria (não persiste, reseta ao fechar o popup).
  // ------------------------------------------------------------------
  protected readonly unidadePlanejamentoPorTipo = signal<Record<string, 'pct' | 'valor'>>({});

  protected unidadePlanejamento(tipo: ChaveTipo): 'pct' | 'valor' {
    return this.unidadePlanejamentoPorTipo()[tipo] ?? 'valor';
  }

  protected alternarUnidadePlanejamento(tipo: ChaveTipo): void {
    const atual = this.unidadePlanejamento(tipo);
    this.unidadePlanejamentoPorTipo.update((m) => ({ ...m, [tipo]: atual === 'valor' ? 'pct' : 'valor' }));
  }

  protected valorPlanejadoExibido(item: ItemEap, tipo: ChaveTipo): string {
    const valorRS = this.valorPlanejadoPorTipo(tipo);
    if (this.unidadePlanejamento(tipo) === 'pct') {
      const orcado = this.orcadoDoItemTipo(item, tipo);
      return (orcado > 0 ? (valorRS / orcado) * 100 : 0).toFixed(2) + ' %';
    }
    return formatarMoeda(valorRS);
  }

  protected salvarPlanejamentoPorTipo(item: ItemEap, tipo: ChaveTipo, evento: Event): void {
    const aberto = this.popupAberto();
    if (!aberto) return;

    const bruto = Math.max(0, parsearBR((evento.target as HTMLInputElement).value));
    const valor =
      this.unidadePlanejamento(tipo) === 'pct'
        ? (bruto / 100) * this.orcadoDoItemTipo(item, tipo)
        : bruto;

    const payload: PlanejamentoCronograma = {
      eapItemId: aberto.item.id,
      periodoInicio: aberto.periodo.chave,
      tipo,
      valor,
    };

    this.salvandoPlanejamento.set(true);
    this.api.salvarPlanejamentoCronograma(this.obraId(), payload).subscribe({
      next: () => {
        this.planejamentos.update((lista) => [
          ...lista.filter(
            (p) =>
              !(
                p.eapItemId === payload.eapItemId &&
                p.periodoInicio === payload.periodoInicio &&
                p.tipo === payload.tipo
              ),
          ),
          payload,
        ]);
        this.salvandoPlanejamento.set(false);
      },
      error: () => {
        this.salvandoPlanejamento.set(false);
        window.alert('Não foi possível salvar o valor planejado.');
      },
    });
  }

  /**
   * Zera todo o planejamento da obra (24/08/2026, pedido do Lucas:
   * "função para resetar os inputs de valores planejados") — ação
   * destrutiva com confirmação, útil antes de um replanejamento do zero.
   */
  protected readonly zerandoPlanejamento = signal(false);

  protected zerarPlanejamento(): void {
    if (!this.planejamentos().length) return;
    if (
      !window.confirm(
        'Isso apaga TODOS os valores planejados desta obra, em todos os itens e períodos. Não afeta o realizado. Continuar?',
      )
    ) {
      return;
    }

    this.zerandoPlanejamento.set(true);
    this.api.zerarPlanejamentosCronograma(this.obraId()).subscribe({
      next: () => {
        this.planejamentos.set([]);
        this.zerandoPlanejamento.set(false);
      },
      error: () => {
        this.zerandoPlanejamento.set(false);
        window.alert('Não foi possível zerar o planejamento.');
      },
    });
  }

  /**
   * Replanejamento (24/08/2026, pedido do Lucas): copia o Realizado pro
   * Planejado, categoria a categoria, em todo período que já começou —
   * "pra igualar o ponto atual com o que foi realizado de fato, pra daí
   * sim fazer o cronograma do período restante". Períodos futuros (que
   * ainda nem começaram) ficam de fora — são eles que sobram pra
   * planejar de verdade depois desta sincronização.
   */
  protected readonly aplicandoValoresReais = signal(false);

  protected usarValoresReaisNoPlanejamento(): void {
    const hoje = agoraDeParede();
    hoje.setHours(0, 0, 0, 0);
    const periodosPassados = this.periodos().filter((p) => p.inicio <= hoje);
    if (!periodosPassados.length) {
      window.alert('Nenhum período já começou ainda — não há o que sincronizar.');
      return;
    }

    if (
      !window.confirm(
        `Isso substitui o planejado de todos os itens/categorias nos ${periodosPassados.length} período(s) já iniciados pelo valor realmente realizado neles. Períodos futuros não são afetados. Continuar?`,
      )
    ) {
      return;
    }

    const realizado = this.realizadoPorItemPeriodoTipo();
    const atualizacoes: PlanejamentoCronograma[] = [];

    for (const item of this.eap.itens()) {
      if (item.isGroup) continue;
      const porPeriodo = realizado.get(item.id);
      if (!porPeriodo) continue;

      for (const periodo of periodosPassados) {
        const porTipo = porPeriodo[periodo.chave];
        if (!porTipo) continue;

        for (const tipo of TIPOS_CUSTO) {
          const valor = porTipo[tipo.chave] ?? 0;
          if (!valor) continue;
          atualizacoes.push({ eapItemId: item.id, periodoInicio: periodo.chave, tipo: tipo.chave, valor });
        }
      }
    }

    if (!atualizacoes.length) {
      window.alert('Nenhum valor realizado encontrado nos períodos já iniciados.');
      return;
    }

    this.aplicandoValoresReais.set(true);
    forkJoin(
      atualizacoes.map((payload) => this.api.salvarPlanejamentoCronograma(this.obraId(), payload)),
    ).subscribe({
      next: () => {
        this.planejamentos.update((lista) => {
          const chave = (p: { eapItemId: string; periodoInicio: string; tipo: string }) =>
            `${p.eapItemId}|${p.periodoInicio}|${p.tipo}`;
          const chavesAtualizadas = new Set(atualizacoes.map(chave));
          return [...lista.filter((p) => !chavesAtualizadas.has(chave(p))), ...atualizacoes];
        });
        this.aplicandoValoresReais.set(false);
      },
      error: () => {
        this.aplicandoValoresReais.set(false);
        window.alert('Não foi possível aplicar os valores reais ao planejamento.');
      },
    });
  }

  // ------------------------------------------------------------------
  // Modal de pagamentos vinculados (24/08/2026, pedido do Lucas: "a mesma
  // função dos pagamentos na EAP... exatamente como ocorre na EAP") — ao
  // clicar no Realizado de uma célula, abre a lista de pagamentos que
  // caem naquele item (e descendentes, se for grupo) DENTRO do período
  // daquela coluna. Mesmo desenho por predicado de `eap.ts`
  // (`filtroPagamentosAberto`/`listaPagamentosBase`), só que aqui o
  // filtro tem uma segunda dimensão que a EAP não tem — a data do
  // pagamento precisa cair dentro do período clicado, não só bater o
  // item/categoria.
  // ------------------------------------------------------------------
  protected readonly filtroPagamentosAberto = signal<FiltroPagamentosAberto | null>(null);

  private idsRealizadoDoItem(item: ItemEap): string[] {
    if (!item.isGroup) return [item.id];

    const eapGrupo = String(item.eap ?? '').trim();
    if (!eapGrupo) return [item.id];

    const ids = [item.id];
    for (const filho of this.eap.itens()) {
      if (!filho.isGroup && ehDescendente(eapGrupo, filho.eap)) ids.push(filho.id);
    }
    return ids;
  }

  protected abrirPagamentosDoPeriodo(item: ItemEap, periodo: Periodo): void {
    const ids = new Set(this.idsRealizadoDoItem(item));
    this.filtroPagamentosAberto.set({
      titulo: `${this.rotuloEap(item)} · ${periodo.rotulo}`,
      corresponde: (ip) => ids.has(ip.eapId ?? ''),
      periodo,
    });
  }

  /** "Total realizado" da linha — mesmo item, mas sem restringir a um período específico. */
  protected abrirPagamentosDoItem(item: ItemEap): void {
    const ids = new Set(this.idsRealizadoDoItem(item));
    this.filtroPagamentosAberto.set({
      titulo: this.rotuloEap(item),
      corresponde: (ip) => ids.has(ip.eapId ?? ''),
    });
  }

  /** Rodapé — total de um período, todos os itens (mesmo padrão de `Eap.abrirPagamentosTotais`). */
  protected abrirPagamentosTotaisDoPeriodo(periodo: Periodo): void {
    const idsValidos = new Set(this.eap.itens().map((i) => i.id));
    this.filtroPagamentosAberto.set({
      titulo: `Total geral · ${periodo.rotulo}`,
      corresponde: (ip) => !!ip.eapId && idsValidos.has(ip.eapId),
      periodo,
    });
  }

  /** Rodapé — "Total realizado" geral, sem restringir a um período específico. */
  protected abrirPagamentosTotais(): void {
    const idsValidos = new Set(this.eap.itens().map((i) => i.id));
    this.filtroPagamentosAberto.set({
      titulo: 'Total geral',
      corresponde: (ip) => !!ip.eapId && idsValidos.has(ip.eapId),
    });
  }

  protected fecharModalPagamentos(): void {
    this.filtroPagamentosAberto.set(null);
    this.filtroPopupBeneficiado.set('');
    this.filtroPopupDataDe.set('');
    this.filtroPopupDataAte.set('');
  }

  protected rotuloTipo(tipo: string): string {
    return TIPOS_CUSTO.find((t) => t.chave === tipo)?.rotulo ?? tipo;
  }

  /** Mesmo mecanismo de `Eap.ajustarPosicaoHover` — abre pra cima quando não cabe até o fim do modal. */
  protected ajustarPosicaoHover(evento: MouseEvent, quantidadeItens: number): void {
    const gatilho = evento.currentTarget as HTMLElement;
    const corpoModal = gatilho.closest('.modal-corpo') as HTMLElement | null;
    const limiteInferior = corpoModal?.getBoundingClientRect().bottom ?? window.innerHeight;
    const alturaEstimada = 40 + quantidadeItens * 22 + 16;
    const cabeAbaixo = gatilho.getBoundingClientRect().top + alturaEstimada <= limiteInferior;
    gatilho.classList.toggle('abrir-para-cima', !cabeAbaixo);
  }

  protected readonly ordenacaoPagamentos = signal<EstadoOrdenacao<ColunaPagamentoVinculado>>({
    coluna: 'numeroPagamento',
    direcao: 'asc',
  });
  protected readonly setaOrdenacao = setaOrdenacao;

  protected alternarOrdenacaoPagamentos(coluna: ColunaPagamentoVinculado): void {
    this.ordenacaoPagamentos.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected readonly filtroPopupBeneficiado = signal('');
  protected readonly filtroPopupDataDe = signal('');
  protected readonly filtroPopupDataAte = signal('');

  protected mudarFiltroPopupBeneficiado(evento: Event): void {
    this.filtroPopupBeneficiado.set((evento.target as HTMLSelectElement).value);
  }

  protected mudarFiltroPopupDataDe(evento: Event): void {
    this.filtroPopupDataDe.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroPopupDataAte(evento: Event): void {
    this.filtroPopupDataAte.set((evento.target as HTMLInputElement).value);
  }

  private readonly listaPagamentosBase = computed(() => {
    const filtro = this.filtroPagamentosAberto();
    if (!filtro) return [] as PagamentoVinculado[];

    const rotuloPorId = new Map(this.eap.itens().map((i) => [i.id, i.eap]));
    const lista: PagamentoVinculado[] = [];

    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (filtro.periodo) {
        const data = this.dataDoPagamento(pagamento);
        if (!data || data < filtro.periodo.inicio || data >= filtro.periodo.fim) continue;
      }

      const itensDirecionados = expandirItensPagamento(pagamento)
        .filter(filtro.corresponde)
        .map((itemPag) => ({
          descricao: itemPag.descricao || 's/ descrição',
          tipo: itemPag.tipo,
          etapa: itemPag.eapId ? (rotuloPorId.get(itemPag.eapId) ?? '') : 's/ etapa',
          valor: itemPag.valorCalculado,
        }));

      if (!itensDirecionados.length) continue;

      lista.push({
        numeroPagamento: pagamento.numeroPagamento,
        fornecedor: pagamento.fornecedor,
        dataSolicitacao: pagamento.dataSolicitacao,
        dataPagamento: pagamento.dataPagamento,
        descricao: pagamento.descricao,
        valorTotal: pagamento.valorTotal,
        valorDirecionado: itensDirecionados.reduce((soma, i) => soma + i.valor, 0),
        pendente: pagamento.status === 'pendente',
        itensDirecionados,
      });
    }

    return lista;
  });

  protected readonly beneficiariosPopupDisponiveis = computed(() =>
    valoresDistintos(this.listaPagamentosBase(), (p) => p.fornecedor),
  );

  private readonly listaPagamentosFiltrada = computed(() => {
    const beneficiado = this.filtroPopupBeneficiado();
    const de = this.filtroPopupDataDe();
    const ate = this.filtroPopupDataAte();

    return this.listaPagamentosBase().filter((p) => {
      if (beneficiado && p.fornecedor !== beneficiado) return false;
      return dataDentroDoIntervalo(p.dataSolicitacao, de, ate);
    });
  });

  protected readonly totalValorPagamentosPopup = computed(() =>
    this.listaPagamentosFiltrada().reduce((soma, p) => soma + p.valorTotal, 0),
  );

  protected readonly totalValorDirecionadoPopup = computed(() =>
    this.listaPagamentosFiltrada().reduce((soma, p) => soma + p.valorDirecionado, 0),
  );

  protected readonly pagamentosVinculados = computed(() =>
    ordenarPor(this.listaPagamentosFiltrada(), this.ordenacaoPagamentos(), (p, coluna) => p[coluna]),
  );

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

  protected recuo(item: ItemEap): number {
    return recuoDoCodigoEap(item.eap);
  }

  // ------------------------------------------------------------------
  // Recolher/expandir grupos (17/08/2026, pedido do Lucas — mesmo padrão da EAP)
  // ------------------------------------------------------------------
  private readonly gruposColapsados = signal<Set<string>>(new Set());

  protected readonly itensOcultos = computed(() =>
    itensOcultosPorColapso(
      this.linhas().map((l) => l.item),
      this.gruposColapsados(),
    ),
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

  /** Se algum grupo está recolhido — decide o rótulo do botão "expandir/recolher tudo". */
  protected readonly existeGrupoColapsado = computed(() => this.gruposColapsados().size > 0);

  /**
   * Um botão só, alternando entre os dois extremos (19/08/2026, pedido do
   * Lucas, mesmo padrão da EAP): se algum grupo estiver recolhido,
   * expande todos; senão, recolhe todos.
   */
  protected alternarTodosOsColapsos(): void {
    if (this.existeGrupoColapsado()) {
      this.gruposColapsados.set(new Set());
      return;
    }
    const todosOsGrupos = this.linhas().map((l) => l.item).filter((i) => i.isGroup).map((i) => i.id);
    this.gruposColapsados.set(new Set(todosOsGrupos));
  }
}

type ColunaPagamentoVinculado =
  | 'numeroPagamento'
  | 'fornecedor'
  | 'dataSolicitacao'
  | 'dataPagamento'
  | 'descricao'
  | 'valorTotal'
  | 'valorDirecionado';

interface PagamentoVinculado {
  numeroPagamento: string;
  fornecedor: string;
  dataSolicitacao: string;
  dataPagamento: string;
  descricao: string;
  valorTotal: number;
  valorDirecionado: number;
  pendente: boolean;
  itensDirecionados: Array<{ descricao: string; tipo: string; etapa: string; valor: number }>;
}

interface FiltroPagamentosAberto {
  titulo: string;
  corresponde: (itemPagamento: ItemPagamentoCalculado) => boolean;
  /** Se definido, só entram pagamentos cuja data caia dentro deste período (mesmo motivo de `linhas` bucketar por período). */
  periodo?: Periodo;
}
