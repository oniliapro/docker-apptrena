import { Component, OnInit, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PerfilEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CabecalhoImpressao } from '../../shared/cabecalho-impressao/cabecalho-impressao';
import { OpcoesResumo, lerOpcoesResumo } from './empreita-resumo-engine';
import { EmpreitaResumoBloco } from './empreita-resumo-bloco';

/**
 * Versão "para imprimir" do Resumo para o profissional (19/09/2026) — aberta
 * só pelo Chromium headless do backend (`EmpreitaPdfController::
 * resumoProfissional`), no mesmo padrão das outras rotas `imprimir/…`:
 * `token`/`apiUrl` na query string, sem login. `ids` são as empreitas
 * (separadas por vírgula) e `opcoes` o que exportar.
 */
@Component({
  selector: 'app-empreita-resumo-profissional-imprimir',
  imports: [CabecalhoImpressao, EmpreitaResumoBloco],
  templateUrl: './empreita-resumo-profissional-imprimir.html',
  styleUrl: './empreita-resumo-profissional-imprimir.scss',
})
export class EmpreitaResumoProfissionalImprimir implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly geradoEm = new Date().toISOString();
  protected readonly perfilEmpresa = signal<PerfilEmpresa | null>(null);
  protected readonly empreitaIds = signal<string[]>([]);
  protected readonly opcoes = signal<OpcoesResumo>(lerOpcoesResumo(null));

  constructor() {
    const consulta = this.route.snapshot.queryParamMap;

    const token = consulta.get('token');
    if (token) this.auth.definirTokenParaImpressao(token);

    const apiUrl = consulta.get('apiUrl');
    if (apiUrl) this.api.definirBaseParaImpressao(apiUrl);

    this.empreitaIds.set((consulta.get('ids') ?? '').split(',').map((id) => id.trim()).filter(Boolean));
    this.opcoes.set(lerOpcoesResumo(consulta.get('opcoes')));
  }

  ngOnInit(): void {
    this.api.obterPerfilEmpresa().subscribe({
      next: (perfil) => this.perfilEmpresa.set(perfil),
      error: () => {},
    });
  }
}
