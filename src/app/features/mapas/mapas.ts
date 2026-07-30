import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Mapa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';

/**
 * Lista de Mapas — portado de js/mapas/01-lista.js.
 *
 * Diferença relevante em relação ao original: a lista antiga era lida do
 * localStorage (`controleObra.mapas.v1`); aqui vem de GET /api/mapas.
 * Os nomes de campo do backend relacional são snake_case, então há um
 * fallback para as chaves camelCase do formato antigo — assim a tela não
 * quebra se o backend ainda devolver o formato de transição.
 */
@Component({
  selector: 'app-mapas',
  imports: [RouterLink],
  templateUrl: './mapas.html',
  styleUrl: './mapas.scss',
})
export class Mapas implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly mapas = signal<Mapa[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarMoeda = formatarMoeda;

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarMapas().subscribe({
      next: (mapas) => {
        this.mapas.set(mapas);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os mapas.');
        this.carregando.set(false);
      },
    });
  }

  protected numero(mapa: Mapa): string {
    return String(mapa['map_number'] ?? mapa['numeroMapa'] ?? '—');
  }

  protected descricao(mapa: Mapa): string {
    return String(mapa['descricao'] ?? '—');
  }

  protected cliente(mapa: Mapa): string {
    return String(mapa['cliente'] ?? '—');
  }

  protected dataFinalizacao(mapa: Mapa): string {
    const bruto = mapa['data_finalizacao'] ?? mapa['dataFinalizacao'];
    if (!bruto) return '—';
    // O formato antigo já vinha em dd/mm/aaaa; o novo vem ISO.
    const texto = String(bruto);
    return texto.includes('-') ? formatarData(texto) : texto;
  }

  protected total(mapa: Mapa): number {
    return Number(mapa['total_mapa'] ?? mapa['totalMapa'] ?? 0);
  }

  protected quantidadePagamentos(mapa: Mapa): number {
    const ids = mapa['pagamentos_ids'] ?? mapa['pagamentosIds'];
    return Array.isArray(ids) ? ids.length : 0;
  }

  protected remover(mapa: Mapa): void {
    if (!window.confirm('Excluir este mapa da lista?')) return;

    this.api.excluirMapa(mapa.id).subscribe({
      next: () => this.mapas.update((lista) => lista.filter((m) => m.id !== mapa.id)),
      error: () => window.alert('Não foi possível excluir o mapa.'),
    });
  }
}
