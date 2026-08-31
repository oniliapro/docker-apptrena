import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { Obra, PerfilEmpresa, PlanejamentoCronograma } from '../../core/models/api.models';
import { formatarDataHora, formatarMoeda } from '../../core/utils/formato';
import { CabecalhoImpressao } from '../../shared/cabecalho-impressao/cabecalho-impressao';
import { EapStore } from '../eap/eap.store';
import { ehDescendente } from '../eap/eap-engine';
import { recuoDoCodigoEap } from '../eap/eap-normalize';
import { ItemEap } from '../eap/eap.models';
import { expandirItensPagamento } from '../pagamentos/pagamentos-calc';
import { PagamentosStore } from '../pagamentos/pagamentos.store';
import { Periodo, gerarPeriodos, paraDataLocal, periodoContendo } from './cronograma-desembolso-engine';

interface LinhaCronograma {
  item: ItemEap;
  orcado: number;
  porPeriodoRealizado: Record<string, number>;
  porPeriodoPlanejado: Record<string, number>;
  totalRealizado: number;
  totalPlanejado: number;
}

/**
 * Versão "para imprimir" do Cronograma de Desembolso — usada só pelo PDF
 * gerado no backend (CronogramaPdfController, via Browsershot). Criada em
 * 23/08/2026, reformulada em 24/08/2026 junto com a tela normal (grade
 * fixa de período + planejado empilhado) — ver o comentário completo em
 * `cronograma-desembolso.ts`, duplicado aqui (mesmo precedente de
 * `RelatoriosImprimir`, sem store isolado pra reaproveitar).
 *
 * Recolher/expandir grupo e o popup de planejar não fazem sentido numa
 * folha impressa — aqui sempre mostra tudo expandido, e o planejado é só
 * leitura (sem botão).
 */
@Component({
  selector: 'app-cronograma-desembolso-imprimir',
  imports: [CabecalhoImpressao],
  providers: [EapStore, PagamentosStore],
  templateUrl: './cronograma-desembolso-imprimir.html',
  styleUrl: './cronograma-desembolso-imprimir.scss',
})
export class CronogramaDesembolsoImprimir implements OnInit {
  protected readonly eap = inject(EapStore);
  protected readonly pagamentosStore = inject(PagamentosStore);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarDataHora = formatarDataHora;
  protected readonly geradoEm = new Date().toISOString();

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly obra = signal<Obra | null>(null);
  protected readonly planejamentos = signal<PlanejamentoCronograma[]>([]);
  protected readonly perfilEmpresa = signal<PerfilEmpresa | null>(null);

  protected readonly carregando = computed(
    () => this.eap.carregando() || this.pagamentosStore.carregando(),
  );

  protected readonly periodos = computed<Periodo[]>(() => {
    const o = this.obra();
    if (!o?.data_base || !o?.prazo_meses) return [];
    return gerarPeriodos(paraDataLocal(o.data_base), o.prazo_meses, 'mes');
  });

  private readonly matrizRealizadoPorItemBase = computed(() => {
    const mapa = new Map<string, Record<string, number>>();
    const periodos = this.periodos();
    if (!periodos.length) return mapa;

    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      const bruto = pagamento.dataPagamento || pagamento.dataSolicitacao;
      if (!bruto) continue;
      const periodo = periodoContendo(periodos, paraDataLocal(bruto));
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

  /** Soma das 5 categorias por (item, período) — o planejado agora é gravado discriminado por categoria (24/08/2026), o PDF só mostra o total. */
  private readonly planejadoPorItemBase = computed(() => {
    const mapa = new Map<string, Record<string, number>>();
    for (const p of this.planejamentos()) {
      const atual = mapa.get(p.eapItemId) ?? {};
      atual[p.periodoInicio] = (atual[p.periodoInicio] ?? 0) + p.valor;
      mapa.set(p.eapItemId, atual);
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

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) this.auth.definirTokenParaImpressao(token);

    const apiUrl = this.route.snapshot.queryParamMap.get('apiUrl');
    if (apiUrl) this.api.definirBaseParaImpressao(apiUrl);
  }

  ngOnInit(): void {
    this.eap.carregar(this.obraId());
    this.pagamentosStore.carregar(this.obraId());
    this.api.obterObra(this.obraId()).subscribe({ next: (o) => this.obra.set(o), error: () => {} });
    this.api.listarPlanejamentosCronograma(this.obraId()).subscribe({
      next: (lista) => this.planejamentos.set(lista),
      error: () => {},
    });
    this.api.obterPerfilEmpresa().subscribe({
      next: (perfil) => this.perfilEmpresa.set(perfil),
      error: () => {},
    });
  }
}
