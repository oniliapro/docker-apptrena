import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData } from '../../core/utils/formato';

type FiltroStatus = 'todos' | 'confirmada' | 'aberta';

/**
 * Lista de Obras — tela nova, vinda do protótipo do Lucas.
 *
 * É o ponto de entrada para a página de obra: cada linha leva às abas
 * (EAP, medições, pagamentos…). No app vanilla não existia equivalente
 * — os módulos eram páginas soltas, sem uma obra como contexto.
 */
@Component({
  selector: 'app-obras',
  templateUrl: './obras.html',
  styleUrl: './obras.scss',
})
export class Obras implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly obras = signal<Obra[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly filtro = signal<FiltroStatus>('todos');
  protected readonly busca = signal('');

  protected readonly formatarData = formatarData;

  protected readonly listaFiltrada = computed(() => {
    const filtro = this.filtro();
    const termo = this.busca().trim().toLowerCase();

    return this.obras().filter((obra) => {
      if (filtro === 'confirmada' && !obra.is_confirmed) return false;
      if (filtro === 'aberta' && obra.is_confirmed) return false;
      if (!termo) return true;

      const alvo = [obra.obra_nome, obra.cliente, obra.responsavel, obra.map_number]
        .join(' ')
        .toLowerCase();
      return alvo.includes(termo);
    });
  });

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarObras().subscribe({
      next: (obras) => {
        this.obras.set(obras);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as obras.');
        this.carregando.set(false);
      },
    });
  }

  protected mudarFiltro(evento: Event): void {
    this.filtro.set((evento.target as HTMLSelectElement).value as FiltroStatus);
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  protected acessar(obra: Obra): void {
    void this.router.navigate(['/obras', obra.id, 'eap']);
  }

  protected remover(obra: Obra): void {
    if (!window.confirm(`Excluir a obra "${obra.obra_nome || 'sem nome'}"?`)) return;

    this.api.excluirObra(obra.id).subscribe({
      next: () => this.obras.update((lista) => lista.filter((o) => o.id !== obra.id)),
      error: () => window.alert('Não foi possível excluir a obra.'),
    });
  }
}
