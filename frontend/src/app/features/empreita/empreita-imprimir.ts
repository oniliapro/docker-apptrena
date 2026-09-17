import { Component, OnInit, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PerfilEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatarData, formatarDataHora, formatarMoeda } from '../../core/utils/formato';
import { CabecalhoImpressao } from '../../shared/cabecalho-impressao/cabecalho-impressao';
import { ChaveTipo, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
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
  imports: [EmpreitaRelatorioPagamentos, CabecalhoImpressao],
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

  /** "Simplificar" (01/09/2026) — lido da query string, mesmo mecanismo de `token`/`apiUrl`. */
  protected readonly simplificado = signal(false);

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

  protected numDivergencia(indice: number): number {
    return this.linha(indice).jaPago.divergencia;
  }

  protected valorJaPagoDivergencia(indice: number): string {
    return this.moedaOuVazio(this.numDivergencia(indice));
  }

  protected valorJaPagoTotal(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).jaPago.total);
  }

  protected valorMedido(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).medido);
  }

  protected numMedido(indice: number): number {
    return this.linha(indice).medido;
  }

  protected valorPagamentoDraftExibido(indice: number, campo: 'pagamentoEmpDraft' | 'pagamentoReservaDraft'): string {
    return this.moedaOuVazio(this.linha(indice)[campo]);
  }

  protected valorPagamentoDraftTotal(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).pagamentoDraftTotal);
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

    this.simplificado.set(this.route.snapshot.queryParamMap.get('simplificado') === '1');
  }

  ngOnInit(): void {
    this.store.carregar(this.empreitaId(), this.obraId());
    this.api.obterPerfilEmpresa().subscribe({
      next: (perfil) => this.perfilEmpresa.set(perfil),
      error: () => {},
    });
  }
}
