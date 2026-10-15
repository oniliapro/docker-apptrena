import { Component, OnInit, inject, signal } from '@angular/core';

import { Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { ListaRelatorios } from './lista-relatorios/lista-relatorios';

/**
 * Relatórios — todas as obras (15/10/2026, pedido do Lucas). É a página do item
 * "Relatórios" do menu lateral e o destino do "Ver todos →" do card do dashboard.
 *
 * Mesma lista do card (`ListaRelatorios`), mas com TODAS as obras — o card só
 * mostra as primeiras em aberto. O relatório completo de uma obra (Orçado x
 * Realizado detalhado, PDF) continua em `/obras/:id/relatorios`: clicar numa
 * linha leva até lá.
 */
@Component({
  selector: 'app-relatorios-geral',
  imports: [ListaRelatorios],
  template: `
    <div class="cabecalho">
      <h1>Relatórios</h1>
      <div class="atenuado">Orçado x Realizado x Medido — todas as obras</div>
    </div>

    @if (erro()) {
      <p class="atenuado">{{ erro() }}</p>
    } @else {
      <app-lista-relatorios
        [obras]="obras()"
        [carregandoObras]="carregando()"
        tituloVazio="Nenhuma obra cadastrada." />
    }
  `,
  styles: [
    `
      :host { display: block; }
      .cabecalho { margin-bottom: 20px; }
      .cabecalho h1 { margin: 0 0 2px; font-size: 23px; }
    `,
  ],
})
export class RelatoriosGeral implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly obras = signal<Obra[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  ngOnInit(): void {
    this.api.listarObras().subscribe({
      next: (obras) => {
        // Número da obra primeiro (é como o Lucas as reconhece), nome como desempate.
        const ordenadas = [...obras].sort(
          (a, b) =>
            String(a.map_number ?? '').localeCompare(String(b.map_number ?? ''), 'pt-BR', { numeric: true }) ||
            String(a.obra_nome ?? '').localeCompare(String(b.obra_nome ?? ''), 'pt-BR', { sensitivity: 'base' }),
        );
        this.obras.set(ordenadas);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as obras.');
        this.carregando.set(false);
      },
    });
  }
}
