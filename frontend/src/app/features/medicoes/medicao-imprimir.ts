import { Component, OnInit, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PerfilEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatarDataHora, formatarMoeda } from '../../core/utils/formato';
import { CabecalhoImpressao } from '../../shared/cabecalho-impressao/cabecalho-impressao';
import { formatarPercentual } from '../pagamentos/pagamentos-calc';
import { recuoDoCodigoEap } from '../eap/eap-normalize';
import { EapStore } from '../eap/eap.store';
import { ChaveTipo, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
import { MedicaoStore } from './medicao.store';

/**
 * Versão "para imprimir" de uma Medição — usada só pelo PDF gerado no
 * backend (MedicaoPdfController, via Browsershot/Chromium headless).
 * Criada em 24/08/2026, mesmo mecanismo das outras telas — ver
 * docs/GERAR-PDF.md.
 *
 * Reaproveita `EapStore`/`MedicaoStore` inteiros (mesma injeção da tela
 * normal), mas sem nada interativo: sempre mostra as 5 categorias (a
 * tela normal deixa esconder por caixa de seleção — esse filtro é só
 * estado local do componente, não dá pra saber daqui), sempre expandido
 * (sem recolher grupos) e sempre em percentual (sem alternância %/R$ —
 * o Orçado/Avanço já são sempre R$, então só falta fixar Acum./Nova).
 */
@Component({
  selector: 'app-medicao-imprimir',
  imports: [CabecalhoImpressao],
  providers: [EapStore, MedicaoStore],
  templateUrl: './medicao-imprimir.html',
  styleUrl: './medicao-imprimir.scss',
})
export class MedicaoImprimir implements OnInit {
  protected readonly eap = inject(EapStore);
  protected readonly store = inject(MedicaoStore);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly obraId = input.required<string>({ alias: 'id' });
  readonly medicaoId = input.required<string>({ alias: 'medicaoId' });

  protected readonly tipos = TIPOS_CUSTO;
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarPercentual = formatarPercentual;
  protected readonly formatarDataHora = formatarDataHora;
  protected readonly recuo = (item: ItemEap) => recuoDoCodigoEap(item.eap);
  protected readonly geradoEm = new Date().toISOString();
  protected readonly perfilEmpresa = signal<PerfilEmpresa | null>(null);

  protected valorOrcado(item: ItemEap, tipo: ChaveTipo): string {
    return formatarMoeda(this.store.orcadoDoItem(item.id, tipo));
  }

  protected valorAcumulado(item: ItemEap, tipo: ChaveTipo): string {
    return formatarPercentual(this.store.acumuladoAnterior(item.id, tipo));
  }

  protected valorNova(item: ItemEap, tipo: ChaveTipo): string {
    return formatarPercentual(this.store.pctEfetivo(item.id, tipo));
  }

  protected valorAvanco(item: ItemEap, tipo: ChaveTipo): string {
    return formatarMoeda(this.store.avancoDoItemTipoRS(item.id, tipo));
  }

  protected larguraBarra(pct: number): number {
    return Math.min(100, Math.max(0, pct));
  }

  constructor() {
    // Ver AuthService.definirTokenParaImpressao / ApiService.definirBaseParaImpressao
    // — precisa acontecer antes de qualquer chamada à API, e o construtor
    // roda antes do ngOnInit (onde MedicaoStore.carregar dispara a primeira).
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) this.auth.definirTokenParaImpressao(token);

    const apiUrl = this.route.snapshot.queryParamMap.get('apiUrl');
    if (apiUrl) this.api.definirBaseParaImpressao(apiUrl);
  }

  ngOnInit(): void {
    this.store.carregar(this.obraId(), this.medicaoId());
    this.api.obterPerfilEmpresa().subscribe({
      next: (perfil) => this.perfilEmpresa.set(perfil),
      error: () => {},
    });
  }
}
