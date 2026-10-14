import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PerfilEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatarDataHora, formatarMoeda } from '../../core/utils/formato';
import { CabecalhoImpressao } from '../../shared/cabecalho-impressao/cabecalho-impressao';
import { RodapeImpressao } from '../../shared/rodape-impressao/rodape-impressao';
import { TIPOS_CUSTO } from '../eap/eap.models';
import { formatarPercentual } from '../pagamentos/pagamentos-calc';
import {
  calcularBaseItem,
  calcularTotalItem,
  obterVencedorEfetivo,
  ratearFreteiro,
  rotuloFornecedor,
} from './mapa-engine';
import { Fornecedor, ItemMapa } from './mapa.models';
import { CelulaEtapa, LinhaEtapa, ResumoEtapas } from './mapa-resumo-etapas';
import { MapaStore } from './mapa.store';

/**
 * Versão "para imprimir" do Mapa de Fornecedores — usada só pelo PDF
 * gerado no backend (MapaPdfController, via Browsershot/Chromium
 * headless). Criada em 22/08/2026, ver docs/GERAR-PDF.md.
 *
 * Reaproveita o `MapaStore` INTEIRO (mesma injeção que `Mapa`, a tela
 * normal) — diferente de `RelatoriosImprimir`, que duplicava a
 * orquestração porque `Relatorios` não tinha um store isolado pra
 * injetar de novo. Aqui o store já expõe todos os computeds prontos
 * (`notas`, `fracionado`, `integral`, `cenarios`, `saldoPorEtapa`…), então
 * reusar é mais seguro que duplicar: qualquer ajuste de cálculo no mapa
 * feito no store vale automaticamente pros dois lados, sem risco de
 * divergência.
 *
 * `ResumoEtapas` (o cruzamento etapa × fornecedor) é instanciado do zero
 * aqui, como na tela normal — nasce sem nenhuma trava de percentual
 * aplicada, então o PDF sempre mostra a divisão proporcional "padrão"
 * (não herda travas que o usuário tenha ajustado manualmente na tela,
 * porque essas travas são só estado de simulação em memória do
 * componente, nunca gravadas no mapa).
 *
 * Fica fora do AppShell e do authGuard — autenticação por token Sanctum
 * de vida curta na query string, igual RelatoriosImprimir.
 */
@Component({
  selector: 'app-mapa-imprimir',
  imports: [CabecalhoImpressao, RodapeImpressao],
  providers: [MapaStore],
  templateUrl: './mapa-imprimir.html',
  styleUrl: './mapa-imprimir.scss',
})
export class MapaImprimir implements OnInit {
  protected readonly store = inject(MapaStore);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly obraId = input.required<string>({ alias: 'id' });
  readonly mapaId = input.required<string>({ alias: 'mapaId' });

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarDataHora = formatarDataHora;
  protected readonly formatarPercentual = formatarPercentual;
  protected readonly geradoEm = new Date().toISOString();
  protected readonly perfilEmpresa = signal<PerfilEmpresa | null>(null);

  private readonly rotuloPorChaveTipo = new Map(TIPOS_CUSTO.map((t) => [t.chave, t.rotulo]));

  protected rotuloTipo(chave: ItemMapa['tipo']): string {
    return (chave && this.rotuloPorChaveTipo.get(chave)) || '—';
  }

  private readonly resumo = new ResumoEtapas();

  protected readonly linhasEtapa = computed(() =>
    this.resumo.calcular(
      this.store.alocacoes(),
      this.store.itens(),
      this.store.fornecedores(),
      this.store.notas().bySupplier,
    ),
  );

  /**
   * TODOS os fornecedores do mapa (23/08/2026, pedido do Lucas) — a
   * tabela "Rateio por etapa" antes só listava quem tinha pelo menos uma
   * alocação (`ResumoEtapas.calcular` monta `linha.celulas` só a partir
   * das alocações, sem entrada nenhuma pros fornecedores nunca
   * escolhidos). No PDF ele quer o inverso: mostrar a coluna de todo
   * fornecedor cadastrado, com "—" nas células de quem não comprou nada
   * naquela etapa (ou em etapa nenhuma) — daí `celulaDoFornecedor` abaixo,
   * que preenche uma célula zerada quando `ResumoEtapas` não tem uma pra
   * aquele fornecedor.
   */
  protected readonly todosFornecedores = computed(() =>
    this.store.fornecedores().map((_, indice) => indice),
  );

  protected celulaDoFornecedor(linha: LinhaEtapa, indice: number): CelulaEtapa {
    return (
      linha.celulas.find((c) => c.fornecedor === indice) ?? {
        etapa: linha.etapa,
        fornecedor: indice,
        base: 0,
        fretePct: 0,
        descPct: 0,
        freteValor: 0,
        descValor: 0,
        travada: false,
        markup: 0,
        total: 0,
      }
    );
  }

  protected readonly rateioFreteiro = computed(() => {
    if (!this.store.freteParticularVencedor()) return new Map<string, number>();
    return ratearFreteiro(
      this.store.itens(),
      this.store.fornecedores(),
      this.store.alocacoes(),
      Number(this.store.cabecalho().freteParticular) || 0,
    );
  });

  protected freteiroDaEtapa(etapa: string): number {
    return this.rateioFreteiro().get(etapa) ?? 0;
  }

  protected readonly tiposUsados = computed(() => {
    const presentes = new Set(this.store.itens().map((i) => i.tipo).filter(Boolean));
    return TIPOS_CUSTO.filter((t) => presentes.has(t.chave));
  });

  protected saldoDaEtapa(etapa: string, tipo: (typeof TIPOS_CUSTO)[number]['chave']): number {
    return this.store.saldoPorEtapa().get(etapa)?.[tipo] ?? 0;
  }

  protected readonly cenarios = this.store.cenarios;
  protected readonly freteParticularVantajoso = this.store.freteParticularVencedor;
  protected readonly cenarioVencedorIntegral = this.store.cenarioVencedorIntegral;

  protected ehVencedorIntegral(indice: number): boolean {
    if (!this.cenarioVencedorIntegral()) return false;
    const melhor = this.store.melhorIntegral();
    return melhor > 0 && this.store.integral()[indice] === melhor;
  }

  protected rotuloItensReferencia(): string {
    return this.store.cabecalho().modoManual ? 'Itens marcados' : 'Itens mais baratos';
  }

  protected rotuloItensReferenciaComFrete(): string {
    return this.store.cabecalho().modoManual ? 'MARCADOS + FRETE' : 'MAIS BARATOS + FRETE';
  }

  protected nomeFornecedor(indice: number): string {
    return rotuloFornecedor(this.store.fornecedores(), indice);
  }

  protected telefoneDoContato(fornecedor: Fornecedor): string {
    return this.store.telefoneDoContato(fornecedor.nome, fornecedor.contato);
  }

  /**
   * Mesmo destaque verde da tela normal (`mapa.ts#estaMarcado`) — não é
   * só "o mais barato" (`ehVencedorAutomatico`): no modo manual é a
   * escolha do usuário (`item.choice`), e em qualquer modo um fornecedor
   * desativado (`fornecedor.ativo === false`) nunca fica destacado.
   */
  protected estaMarcado(item: ItemMapa, indice: number): boolean {
    if (this.store.cabecalho().modoManual) return item.choice === indice;
    const vencedor = obterVencedorEfetivo(item, this.store.fornecedores(), false);
    return vencedor?.indice === indice && Boolean(this.store.fornecedores()[indice]?.ativo);
  }

  // Mesmos métodos de formatação de `mapa.ts` — string vazia (não "—") pra
  // uma célula sem preço/valor ficar em branco, igual a tela normal.
  protected precoUnitario(item: ItemMapa, indice: number): string {
    const valor = Number(item.unit?.[indice]) || 0;
    return valor ? formatarMoeda(valor) : '';
  }

  protected totalDoItem(item: ItemMapa, indice: number): string {
    if (!(Number(item.unit?.[indice]) > 0)) return '';
    return formatarMoeda(calcularTotalItem(item, indice, this.store.fornecedores()));
  }

  protected baseDoItem(item: ItemMapa, indice: number): number {
    return calcularBaseItem(item, indice);
  }

  protected numeroOuVazio(valor: number): string {
    return valor ? String(valor).replace('.', ',') : '';
  }

  protected valorMoedaOuVazio(valor: number): string {
    return valor ? formatarMoeda(valor) : '';
  }

  protected valorPercentualOuVazio(valor: number): string {
    return valor ? formatarPercentual(valor) : '';
  }

  protected freteFinalComBdi(fornecedor: { frete: number; imposto: number }): number {
    return (Number(fornecedor.frete) || 0) * (1 + (Number(fornecedor.imposto) || 0) / 100);
  }

  protected descontoFinalComBdi(fornecedor: { desconto: number; imposto: number }): number {
    return (Number(fornecedor.desconto) || 0) * (1 + (Number(fornecedor.imposto) || 0) / 100);
  }

  constructor() {
    // Ver AuthService.definirTokenParaImpressao / ApiService.definirBaseParaImpressao
    // — precisa acontecer antes de qualquer chamada à API, e o construtor
    // roda antes do ngOnInit (onde MapaStore.carregar dispara a primeira).
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) this.auth.definirTokenParaImpressao(token);

    const apiUrl = this.route.snapshot.queryParamMap.get('apiUrl');
    if (apiUrl) this.api.definirBaseParaImpressao(apiUrl);
  }

  ngOnInit(): void {
    this.store.carregar(this.mapaId(), this.obraId());
    this.api.obterPerfilEmpresa().subscribe({
      next: (perfil) => this.perfilEmpresa.set(perfil),
      error: () => {},
    });
  }
}
