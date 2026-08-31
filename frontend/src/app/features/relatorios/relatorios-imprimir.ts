import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PerfilEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { CabecalhoImpressao } from '../../shared/cabecalho-impressao/cabecalho-impressao';
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
 * Versão "para imprimir" do relatório Orçado x Realizado — usada só pelo
 * PDF gerado no backend (RelatorioPdfController::relatorioObra, via
 * Browsershot/Chromium headless). Criada em 22/08/2026, ver
 * docs/GERAR-PDF.md.
 *
 * Propositalmente DUPLICA a orquestração de carregar + computar de
 * `Relatorios` (features/relatorios/relatorios.ts, a tela normal) em vez
 * de importar aquele componente — mas reaproveita as MESMAS funções de
 * cálculo (`calcularCacheOrcado`, `calcularSomaItens`, etc., de
 * eap-engine.ts/pagamentos-calc.ts), que são as únicas que decidem os
 * números de verdade. Isso garante que o PDF bate com a tela sem
 * arriscar a tela normal (que nem é tocada) e sem reimplementar cálculo
 * de orçamento em outro lugar (ex.: em PHP, no backend) — o que
 * arriscaria os dois lados divergirem com o tempo.
 *
 * Fica fora do `AppShell` (rota própria em app.routes.ts, sem menu
 * lateral/cabeçalho) e não passa pelo `authGuard`: a autenticação vem de
 * um token Sanctum de vida curta na query string (`?token=...`), gerado
 * pelo backend só para esta renderização — ver
 * `AuthService.definirTokenParaImpressao`.
 */
@Component({
  selector: 'app-relatorios-imprimir',
  imports: [DecimalPipe, CabecalhoImpressao],
  templateUrl: './relatorios-imprimir.html',
  styleUrl: './relatorios-imprimir.scss',
})
export class RelatoriosImprimir implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  /** Vem direto do `:id` desta rota (sem herança de rota pai — esta rota
   * não é filha de /obras/:id). */
  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly tipos = TIPOS_CUSTO;
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;
  protected readonly geradoEm = new Date().toISOString();
  protected readonly perfilEmpresa = signal<PerfilEmpresa | null>(null);

  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  private readonly itensEap = signal<ItemEap[]>([]);
  private readonly cabecalhoEap = signal<CabecalhoObra>(cabecalhoVazio());
  private readonly pagamentos = signal<Pagamento[]>([]);

  protected readonly cabecalho = this.cabecalhoEap.asReadonly();

  protected readonly orcado = computed(() => {
    const cache = calcularCacheOrcado(this.itensEap(), this.cabecalhoEap());
    return TIPOS_CUSTO.reduce<Record<string, number>>((acc, t) => {
      acc[t.chave] = cache.totalsDirectByType[t.chave] + cache.totalsBdiByType[t.chave];
      return acc;
    }, {});
  });

  protected readonly orcadoTotal = computed(
    () => calcularCacheOrcado(this.itensEap(), this.cabecalhoEap()).totalsWithBdi,
  );

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

  protected readonly saldoTotal = computed(() => this.orcadoTotal() - this.realizadoTotal());

  protected readonly temDados = computed(
    () => this.itensEap().length > 0 || this.pagamentos().length > 0,
  );

  constructor() {
    // Precisa acontecer antes de qualquer chamada à API — ver
    // AuthService.definirTokenParaImpressao e
    // ApiService.definirBaseParaImpressao. O construtor roda antes do
    // ngOnInit (onde a primeira chamada é disparada), então a ordem é
    // segura mesmo sendo os dois síncronos.
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) this.auth.definirTokenParaImpressao(token);

    const apiUrl = this.route.snapshot.queryParamMap.get('apiUrl');
    if (apiUrl) this.api.definirBaseParaImpressao(apiUrl);
  }

  ngOnInit(): void {
    this.carregar(this.obraId());
    this.api.obterPerfilEmpresa().subscribe({
      next: (perfil) => this.perfilEmpresa.set(perfil),
      error: () => {},
    });
  }

  private carregar(obraId: string): void {
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
    this.api.listarPagamentos({ obraId }).subscribe({
      next: (lista) => {
        this.pagamentos.set(lista.map((p) => normalizarPagamento(p as Record<string, unknown>)));
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }

  protected saldoDe(chave: string): number {
    return (this.orcado()[chave] ?? 0) - (this.realizado()[chave] ?? 0);
  }

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

  protected estourou(chave: string): boolean {
    return this.saldoDe(chave) < 0;
  }

  /** Barra limitada a 100% para não vazar do desenho quando estoura — mesmo método de `Relatorios`. */
  protected larguraBarra(percentual: number): number {
    return Math.min(100, Math.max(0, percentual));
  }
}
