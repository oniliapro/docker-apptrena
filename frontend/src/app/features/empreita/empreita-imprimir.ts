import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PerfilEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatarData, formatarDataHora, formatarMoeda } from '../../core/utils/formato';
import { CabecalhoImpressao } from '../../shared/cabecalho-impressao/cabecalho-impressao';
import { RodapeImpressao } from '../../shared/rodape-impressao/rodape-impressao';
import { ChaveTipo, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
import {
  COLUNAS_PDF_EMPREITA_TODAS,
  ColunasPdfEmpreita,
  OPCOES_PDF_EMPREITA_TODAS,
  OpcoesPdfEmpreita,
  lerColunasPdfEmpreita,
  lerOpcoesPdfEmpreita,
} from './empreita-pdf-opcoes';
import { EmpreitaRelatorioPagamentos } from './empreita-relatorio-pagamentos';
import { EmpreitaStore } from './empreita.store';
import { ItemEmpreita, LinhaEmpreitaEstendida } from './empreita.models';

/**
 * Versão "para imprimir" da Empreita — usada só pelo PDF gerado no
 * backend (EmpreitaPdfController, via Browsershot). Criada em 23/08/2026,
 * mesmo padrão de mapa-imprimir.ts (ver docs/GERAR-PDF.md): reaproveita o
 * `EmpreitaStore` inteiro (mesma injeção que `Empreita`, a tela normal),
 * sem os inputs/selects/botões editáveis. Layout espelhado do redesenho
 * de 25/08/2026 (5 colunas de bloco, cada serviço com uma categoria só).
 */
@Component({
  selector: 'app-empreita-imprimir',
  imports: [EmpreitaRelatorioPagamentos, CabecalhoImpressao, RodapeImpressao],
  providers: [EmpreitaStore],
  templateUrl: './empreita-imprimir.html',
  styleUrl: './empreita-imprimir.scss',
})
export class EmpreitaImprimir implements OnInit {
  protected readonly store = inject(EmpreitaStore);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly obraId = input.required<string>({ alias: 'id' });
  readonly empreitaId = input.required<string>({ alias: 'empreitaId' });

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarDataHora = formatarDataHora;
  protected readonly formatarData = formatarData;
  protected readonly geradoEm = new Date().toISOString();
  protected readonly perfilEmpresa = signal<PerfilEmpresa | null>(null);

  /**
   * "O que mostrar" (25/09/2026, pedido do Lucas; antes só o "Simplificar" de
   * 01/09/2026) — lido da query string `?opcoes=`, mesmo mecanismo de
   * `token`/`apiUrl`. Vale pros serviços e pros pagamentos registrados.
   */
  protected readonly opcoes = signal<OpcoesPdfEmpreita>({ ...OPCOES_PDF_EMPREITA_TODAS });

  /** Colunas visíveis da tabela (25/09/2026) — `?colunas=`; ausente = todas. */
  protected readonly colunas = signal<ColunasPdfEmpreita>({ ...COLUNAS_PDF_EMPREITA_TODAS });

  /** Colunas fixas do começo da tabela: "#" e "Serviço" + Tipo e Etapa, se ligadas. */
  protected readonly colunasFixas = computed(() => 2 + (this.colunas().tipo ? 1 : 0) + (this.colunas().etapa ? 1 : 0));

  /** Total de colunas da tabela — usado no `colspan` da linha vazia. */
  protected readonly totalColunas = computed(() => {
    const c = this.colunas();
    const blocos = (c.contrato ? 1 : 0) + (c.medicao ? 1 : 0);
    const confirmados = this.store.travada() ? (c.jaPago ? 1 : 0) + (c.pagamento ? 1 : 0) + (c.saldoApos ? 1 : 0) : 0;
    return this.colunasFixas() + blocos + confirmados;
  });

  /** Valor "de verdade" — descarta o resíduo de ponto flutuante (0,00000001). */
  private tem(valor: number | null | undefined): boolean {
    return Math.abs(Number(valor) || 0) > 0.005;
  }

  /**
   * Índices dos serviços que entram no PDF. Com "Total" marcado (ou sem
   * nenhuma opção) entram todos; senão, o serviço só entra se tiver valor
   * em ALGUMA das opções marcadas — empreiteiro (contrato, já pago ou
   * pagamento) ou reserva (idem). Os números da coluna "#" continuam os da
   * tela (índice original + 1).
   */
  protected readonly linhasVisiveis = computed<number[]>(() => {
    const o = this.opcoes();
    const itens = this.store.itens();
    const todos = itens.map((_, i) => i);
    if (o.total || (!o.empreiteiro && !o.reserva)) return todos;

    const linhas = this.store.linhasEstendidas();
    return todos.filter((i) => {
      const item = itens[i];
      const linha = linhas[i];
      const temEmpreiteiro =
        this.tem(item.contratoEmp) || this.tem(linha?.jaPago.empreiteiro) || this.tem(linha?.pagamentoEmpDraft);
      const temReserva =
        this.tem(item.contratoReserva) || this.tem(linha?.jaPago.reserva) || this.tem(linha?.pagamentoReservaDraft);
      return (o.empreiteiro && temEmpreiteiro) || (o.reserva && temReserva);
    });
  });

  protected rotuloEap(itemEap: ItemEap): string {
    const eap = String(itemEap.eap ?? '').trim();
    const desc = String(itemEap.desc ?? '').trim();
    if (eap && desc) return `${eap} - ${desc}`;
    return eap || desc || '—';
  }

  protected linha(indice: number): LinhaEmpreitaEstendida {
    return this.store.linhasEstendidas()[indice];
  }

  protected rotuloEapDoItem(eapId: string): string {
    const opcao = this.store.opcoesEap().find((o) => o.id === eapId);
    return opcao ? this.rotuloEap(opcao) : '—';
  }

  protected rotuloTipo(chave: ChaveTipo): string {
    return TIPOS_CUSTO.find((t) => t.chave === chave)?.rotulo ?? chave;
  }

  protected percentualOuVazio(valor: number | null | undefined): string {
    if (valor === null || valor === undefined) return '';
    return valor ? String(valor).replace('.', ',') : '';
  }

  protected moedaOuVazio(valor: number): string {
    return valor ? formatarMoeda(valor) : '';
  }

  protected valorContrato(item: ItemEmpreita, campo: 'contratoEmp' | 'contratoReserva'): string {
    return this.moedaOuVazio(Number(item[campo]) || 0);
  }

  protected valorContratoTotal(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).contrato);
  }

  protected valorSaldoDisp(indice: number): number {
    return this.linha(indice).saldoDisp;
  }

  protected valorQtdeEap(item: ItemEmpreita): string {
    const valor = this.store.itensEap().find((i) => i.id === item.eapId)?.qtde;
    return this.percentualOuVazio(valor ?? null);
  }

  protected valorUnidEap(item: ItemEmpreita): string {
    return this.store.itensEap().find((i) => i.id === item.eapId)?.unid ?? '';
  }

  protected numQtdeDisp(indice: number): number {
    return this.linha(indice).qtdeDisp;
  }

  protected valorQtdeDisp(indice: number, item: ItemEmpreita): string {
    const valor = Number(this.numQtdeDisp(indice).toFixed(2));
    if (!valor) return '';
    const unid = this.store.itensEap().find((i) => i.id === item.eapId)?.unid;
    return `${String(valor).replace('.', ',')}${unid ? ` ${unid}` : ''}`;
  }

  protected valorMedicaoAtual(item: ItemEmpreita): string {
    return this.percentualOuVazio(item.medicaoAtual);
  }

  protected valorQtdeContratadaExibida(item: ItemEmpreita): string {
    const valor = item.qtdeContratada;
    if (valor === null || valor === undefined) return '';
    const itemEap = this.store.opcoesEap().find((o) => o.id === item.eapId);
    const unid = itemEap?.unid ? ` ${itemEap.unid}` : '';
    return `${String(valor).replace('.', ',')}${unid}`;
  }

  protected valorMedicaoAcumulada(item: ItemEmpreita): string {
    return this.percentualOuVazio(item.medicaoAcum);
  }

  protected valorAvanco(indice: number): string {
    return this.percentualOuVazio(this.linha(indice).avanco);
  }

  protected valorJaPagoEmpreiteiro(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).jaPago.empreiteiro);
  }

  protected valorJaPagoReserva(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).jaPago.reserva);
  }

  protected valorJaPagoTotal(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).jaPago.total);
  }

  /** Só "Total" marcado (sem Empreiteiro) = mesma regra da tela simplificada: Medido sobre o total do contrato. */
  protected medidoUsaTotalDoContrato(): boolean {
    return this.opcoes().total && !this.opcoes().empreiteiro;
  }

  protected valorMedido(indice: number): string {
    const linha = this.linha(indice);
    return this.moedaOuVazio(this.medidoUsaTotalDoContrato() ? linha.medidoContrato : linha.medido);
  }

  protected valorPagamentoDraftExibido(indice: number, campo: 'pagamentoEmpDraft' | 'pagamentoReservaDraft'): string {
    return this.moedaOuVazio(this.linha(indice)[campo]);
  }

  protected valorPagamentoDraftTotal(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).pagamentoDraftTotal);
  }

  protected numDisponivel(indice: number): number {
    const linha = this.linha(indice);
    return this.medidoUsaTotalDoContrato() ? linha.disponivelContrato : linha.disponivelEmp;
  }

  protected totalDisponivel(): number {
    const totais = this.store.totaisEstendidos();
    return this.medidoUsaTotalDoContrato() ? totais.disponivelContratoTotal : totais.disponivelEmpTotal;
  }

  protected numSaldoMedicao(indice: number): number {
    return this.linha(indice).saldoMedicao;
  }

  protected totalSaldoMedicao(): number {
    return this.store.totaisEstendidos().saldoMedicaoTotal;
  }

  protected valorSaldoAposPagamentoEtapa(indice: number): number {
    return this.linha(indice).saldoAposPagamentoEtapa;
  }

  protected valorSaldoAposPagamentoEmp(indice: number): number {
    return this.linha(indice).saldoAposPagamentoEmp;
  }

  protected valorSaldoAposPagamentoReserva(indice: number): number {
    return this.linha(indice).saldoAposPagamentoReserva;
  }

  protected valorSaldoAposPagamentoTotal(indice: number): number {
    return this.linha(indice).saldoAposPagamentoTotal;
  }

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) this.auth.definirTokenParaImpressao(token);

    const apiUrl = this.route.snapshot.queryParamMap.get('apiUrl');
    if (apiUrl) this.api.definirBaseParaImpressao(apiUrl);

    this.opcoes.set(lerOpcoesPdfEmpreita(this.route.snapshot.queryParamMap.get('opcoes')));
    this.colunas.set(lerColunasPdfEmpreita(this.route.snapshot.queryParamMap.get('colunas')));
  }

  ngOnInit(): void {
    this.store.carregar(this.empreitaId(), this.obraId());
    this.api.obterPerfilEmpresa().subscribe({
      next: (perfil) => this.perfilEmpresa.set(perfil),
      error: () => {},
    });
  }
}
