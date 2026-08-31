import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PerfilEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatarDataHora, formatarMoeda } from '../../core/utils/formato';
import { CabecalhoImpressao } from '../../shared/cabecalho-impressao/cabecalho-impressao';
import { expandirItensPagamento } from '../pagamentos/pagamentos-calc';
import { PagamentosStore } from '../pagamentos/pagamentos.store';
import { ehDescendente } from './eap-engine';
import { criarVazioPorTipo, recuoDoCodigoEap } from './eap-normalize';
import { EapStore } from './eap.store';
import { ChaveTipo, ItemEap, PorTipo, TIPOS_CUSTO } from './eap.models';

/**
 * Versão "para imprimir" da EAP — usada só pelo PDF gerado no backend
 * (EapPdfController, via Browsershot). Criada em 23/08/2026, mesmo padrão
 * de mapa-imprimir.ts (ver docs/GERAR-PDF.md): reaproveita o `EapStore`
 * inteiro (mesma injeção que `Eap`, a tela normal).
 *
 * O cálculo de "Realizado" (que cruza a EAP com `PagamentosStore`) vive no
 * COMPONENTE `Eap`, não no `EapStore` — por isso, como `CronogramaDesembolsoImprimir`,
 * este componente injeta seu próprio `PagamentosStore` e duplica esses
 * computeds. Fica de fora, por não fazer sentido numa folha impressa: o
 * modal "Pagamentos vinculados" (clique pra ver detalhe), recolher/
 * expandir grupo (sempre tudo expandido aqui) e a edição de BDI/custo
 * (só um resumo em texto do que está configurado).
 */
@Component({
  selector: 'app-eap-imprimir',
  imports: [CabecalhoImpressao],
  providers: [EapStore, PagamentosStore],
  templateUrl: './eap-imprimir.html',
  styleUrl: './eap-imprimir.scss',
})
export class EapImprimir implements OnInit {
  protected readonly store = inject(EapStore);
  protected readonly pagamentosStore = inject(PagamentosStore);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly tipos = TIPOS_CUSTO;
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarDataHora = formatarDataHora;
  protected readonly geradoEm = new Date().toISOString();
  protected readonly perfilEmpresa = signal<PerfilEmpresa | null>(null);

  protected readonly carregando = computed(
    () => this.store.carregando() || this.pagamentosStore.carregando(),
  );

  // ------------------------------------------------------------------
  // Orçado x Realizado — mesma lógica de eap.ts (duplicada aqui, ver
  // comentário da classe: o cálculo vive no componente, não no store).
  // ------------------------------------------------------------------
  protected readonly realizadoPorItem = computed(() => {
    const mapa = new Map<string, number>();
    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      for (const item of expandirItensPagamento(pagamento)) {
        if (!item.eapId) continue;
        mapa.set(item.eapId, (mapa.get(item.eapId) ?? 0) + item.valorCalculado);
      }
    }
    return mapa;
  });

  protected readonly realizadoPorItemPorTipo = computed(() => {
    const mapa = new Map<string, PorTipo>();
    const chaves = new Set(TIPOS_CUSTO.map((t) => t.chave));

    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      for (const item of expandirItensPagamento(pagamento)) {
        if (!item.eapId) continue;
        const tipo = item.tipo as ChaveTipo;
        if (!chaves.has(tipo)) continue;

        const atual = mapa.get(item.eapId) ?? criarVazioPorTipo();
        atual[tipo] += item.valorCalculado;
        mapa.set(item.eapId, atual);
      }
    }
    return mapa;
  });

  protected readonly realizadoPorItemSemCategoria = computed(() => {
    const mapa = new Map<string, number>();
    const chaves = new Set(TIPOS_CUSTO.map((t) => t.chave));

    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      for (const item of expandirItensPagamento(pagamento)) {
        if (!item.eapId) continue;
        if (chaves.has(item.tipo as ChaveTipo)) continue;
        mapa.set(item.eapId, (mapa.get(item.eapId) ?? 0) + item.valorCalculado);
      }
    }
    return mapa;
  });

  protected readonly totalRealizado = computed(() => {
    const mapa = this.realizadoPorItem();
    return this.store.itens().reduce((soma, item) => soma + (mapa.get(item.id) ?? 0), 0);
  });

  protected readonly realizadoSemDefinicaoPorTipo = computed(() => {
    const totais = criarVazioPorTipo();
    const chaves = new Set(TIPOS_CUSTO.map((t) => t.chave));

    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      for (const item of expandirItensPagamento(pagamento)) {
        if (item.eapId) continue;
        const tipo = item.tipo as ChaveTipo;
        if (!chaves.has(tipo)) continue;
        totais[tipo] += item.valorCalculado;
      }
    }
    return totais;
  });

  protected readonly realizadoSemDefinicaoSemCategoria = computed(() => {
    const chaves = new Set(TIPOS_CUSTO.map((t) => t.chave));
    let soma = 0;
    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      for (const item of expandirItensPagamento(pagamento)) {
        if (item.eapId) continue;
        if (chaves.has(item.tipo as ChaveTipo)) continue;
        soma += item.valorCalculado;
      }
    }
    return soma;
  });

  protected readonly totalRealizadoSemDefinicao = computed(() => {
    const porTipo = this.realizadoSemDefinicaoPorTipo();
    const semCategoria = this.realizadoSemDefinicaoSemCategoria();
    return TIPOS_CUSTO.reduce((soma, t) => soma + porTipo[t.chave], semCategoria);
  });

  protected readonly totalRealizadoPorTipo = computed(() => {
    const mapa = this.realizadoPorItemPorTipo();
    const totais = criarVazioPorTipo();
    for (const item of this.store.itens()) {
      const porTipo = mapa.get(item.id);
      if (!porTipo) continue;
      for (const tipo of TIPOS_CUSTO) totais[tipo.chave] += porTipo[tipo.chave] ?? 0;
    }
    return totais;
  });

  protected readonly totalRealizadoSemCategoria = computed(() => {
    const mapa = this.realizadoPorItemSemCategoria();
    return this.store.itens().reduce((soma, item) => soma + (mapa.get(item.id) ?? 0), 0);
  });

  protected readonly totalRealizadoPorTipoGeral = computed(() => {
    const porEtapa = this.totalRealizadoPorTipo();
    const semDefinicao = this.realizadoSemDefinicaoPorTipo();
    const totais = criarVazioPorTipo();
    for (const tipo of TIPOS_CUSTO) totais[tipo.chave] = porEtapa[tipo.chave] + semDefinicao[tipo.chave];
    return totais;
  });

  protected readonly totalRealizadoSemCategoriaGeral = computed(
    () => this.totalRealizadoSemCategoria() + this.realizadoSemDefinicaoSemCategoria(),
  );

  protected readonly totalRealizadoGeral = computed(
    () => this.totalRealizado() + this.totalRealizadoSemDefinicao(),
  );

  private idsRealizadoDoItem(item: ItemEap): string[] {
    if (!item.isGroup) return [item.id];

    const eapGrupo = String(item.eap ?? '').trim();
    if (!eapGrupo) return [item.id];

    const ids = [item.id];
    for (const filho of this.store.itens()) {
      if (!filho.isGroup && ehDescendente(eapGrupo, filho.eap)) ids.push(filho.id);
    }
    return ids;
  }

  protected realizadoDoItem(item: ItemEap): number {
    const mapa = this.realizadoPorItem();
    return this.idsRealizadoDoItem(item).reduce((soma, id) => soma + (mapa.get(id) ?? 0), 0);
  }

  protected realizadoDoItemTipo(item: ItemEap, tipo: ChaveTipo): number {
    const mapa = this.realizadoPorItemPorTipo();
    return this.idsRealizadoDoItem(item).reduce((soma, id) => soma + (mapa.get(id)?.[tipo] ?? 0), 0);
  }

  protected realizadoSemCategoria(item: ItemEap): number {
    const mapa = this.realizadoPorItemSemCategoria();
    return this.idsRealizadoDoItem(item).reduce((soma, id) => soma + (mapa.get(id) ?? 0), 0);
  }

  protected orcadoDoItem(indice: number, item: ItemEap): number {
    if (item.orcadoCongelado) {
      return TIPOS_CUSTO.reduce((soma, t) => soma + (item.orcadoCongelado![t.chave] ?? 0), 0);
    }
    return this.totalComBdi(indice, item);
  }

  protected orcadoDoItemTipo(indice: number, item: ItemEap, tipo: ChaveTipo): number {
    if (item.orcadoCongelado) return item.orcadoCongelado[tipo] ?? 0;

    if (item.isGroup) {
      const totais = this.store.totaisDoGrupo(indice);
      return (totais.directByType[tipo] ?? 0) + (totais.bdiByType[tipo] ?? 0);
    }
    const cache = this.store.cache();
    return (cache.directByType[indice]?.[tipo] ?? 0) + (cache.bdiByType[indice]?.[tipo] ?? 0);
  }

  protected readonly totalOrcado = computed(() => {
    let soma = 0;
    this.store.itens().forEach((item, i) => {
      if (item.isGroup) return;
      soma += this.orcadoDoItem(i, item);
    });
    return soma;
  });

  protected readonly totalOrcadoPorTipo = computed(() => {
    const totais = criarVazioPorTipo();
    this.store.itens().forEach((item, i) => {
      if (item.isGroup) return;
      for (const tipo of TIPOS_CUSTO) totais[tipo.chave] += this.orcadoDoItemTipo(i, item, tipo.chave);
    });
    return totais;
  });

  // ------------------------------------------------------------------
  // Custo direto / BDI (EAP não confirmada) — mesma lógica de eap.ts.
  // ------------------------------------------------------------------
  protected custoDireto(indice: number, item: ItemEap): number {
    return item.isGroup
      ? this.store.totaisDoGrupo(indice).directTotal
      : this.store.cache().directTotal[indice];
  }

  protected custoDiretoTipo(indice: number, item: ItemEap, tipo: ChaveTipo): number {
    return item.isGroup
      ? this.store.totaisDoGrupo(indice).directByType[tipo]
      : this.store.cache().directByType[indice][tipo];
  }

  protected bdi(indice: number, item: ItemEap): number {
    return item.isGroup
      ? this.store.totaisDoGrupo(indice).bdiApplied
      : this.store.cache().bdiApplied[indice];
  }

  protected bdiPercentual(indice: number, item: ItemEap): number {
    return item.isGroup
      ? this.store.totaisDoGrupo(indice).bdiPctApplied
      : this.store.cache().bdiPctApplied[indice];
  }

  protected totalComBdi(indice: number, item: ItemEap): number {
    return item.isGroup
      ? this.store.totaisDoGrupo(indice).totalWithBdi
      : this.store.cache().totalWithBdi[indice];
  }

  // ------------------------------------------------------------------
  protected recuo(item: ItemEap): number {
    return recuoDoCodigoEap(item.eap);
  }

  protected numeroOuVazio(valor: number): string {
    return valor ? String(valor).replace('.', ',') : '';
  }

  protected moedaOuVazio(valor: number): string {
    return valor ? formatarMoeda(valor) : '';
  }

  /** Resumo em texto do BDI configurado — a tela normal tem botões pra trocar o escopo, aqui é só leitura. */
  protected resumoBdi(): string {
    const cabecalho = this.store.cabecalho();
    const rotuloEscopo =
      cabecalho.bdiScope === 'global' ? 'Global' : cabecalho.bdiScope === 'category' ? 'Por categoria' : 'Por item';

    if (cabecalho.bdiScope !== 'global') return rotuloEscopo;

    const valor = cabecalho.bdiMode === 'pct' ? `${String(cabecalho.bdiPercent).replace('.', ',')}%` : formatarMoeda(cabecalho.bdiValue);
    return `${rotuloEscopo} — ${valor}`;
  }

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) this.auth.definirTokenParaImpressao(token);

    const apiUrl = this.route.snapshot.queryParamMap.get('apiUrl');
    if (apiUrl) this.api.definirBaseParaImpressao(apiUrl);
  }

  ngOnInit(): void {
    this.store.carregar(this.obraId());
    this.pagamentosStore.carregar(this.obraId());
    this.api.obterPerfilEmpresa().subscribe({
      next: (perfil) => this.perfilEmpresa.set(perfil),
      error: () => {},
    });
  }
}
