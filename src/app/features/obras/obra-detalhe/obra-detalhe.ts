import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { Obra } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';

/** Abas da obra, na ordem do protótipo (obracontrol.html). */
const ABAS = [
  { caminho: 'eap', rotulo: 'EAP' },
  { caminho: 'cronograma', rotulo: 'Cronograma' },
  { caminho: 'desembolso', rotulo: 'Cronograma de desembolso' },
  { caminho: 'medicoes', rotulo: 'Medições de Obra' },
  { caminho: 'empreitas', rotulo: 'Empreitas' },
  { caminho: 'mapas', rotulo: 'Mapas' },
  { caminho: 'compras', rotulo: 'Compras' },
  { caminho: 'pagamentos', rotulo: 'Pagamentos' },
  { caminho: 'diarios', rotulo: 'Diários de Obra' },
  { caminho: 'relatorios', rotulo: 'Relatórios' },
  { caminho: 'arquivos', rotulo: 'Arquivos Anexados' },
] as const;

/**
 * Página de uma obra — estrutura vinda do protótipo do Lucas.
 *
 * Esta é a mudança de arquitetura mais relevante da migração: no app
 * vanilla, EAP, Mapa, Empreita e Pagamentos eram páginas soltas, sem
 * uma obra como contexto. Aqui a obra passa a ser a entidade central e
 * cada módulo vira uma aba dentro dela.
 *
 * As abas são rotas filhas, então cada uma tem URL própria
 * (/obras/:id/eap) — dá para favoritar e compartilhar.
 */
@Component({
  selector: 'app-obra-detalhe',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './obra-detalhe.html',
  styleUrl: './obra-detalhe.scss',
})
export class ObraDetalhe implements OnInit {
  private readonly api = inject(ApiService);

  /** Vem da rota via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly abas = ABAS;
  protected readonly obra = signal<Obra | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  ngOnInit(): void {
    this.api.obterObra(this.id()).subscribe({
      next: (obra) => {
        this.obra.set(obra);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os dados da obra.');
        this.carregando.set(false);
      },
    });
  }
}
