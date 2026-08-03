import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Mapa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { normalizarPagamento } from '../pagamentos/pagamentos-calc';

/**
 * Chave por obra dos Pagamentos — mesma convenção usada em
 * `mapa.store.ts` e `relatorios.ts` (ver comentário lá): Pagamentos
 * continua na ponte chave-valor por enquanto.
 */
const chavePagamentos = (obraId: string) => `controleObra.pagamentos.v1.obra-${obraId}`;

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
  private readonly armazenamento = inject(ArmazenamentoService);

  protected readonly mapas = signal<Mapa[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarMoeda = formatarMoeda;

  /**
   * Quantidade de pagamentos gerados a partir de cada mapa —
   * `mapaId -> contagem`. Cada Pagamento carrega `origem: { tipo:
   * 'mapa', refId }` quando nasce de "Gerar Pagamento" (ver
   * `mapa.store.ts#montarPagamentosPorFornecedor`); antes desta correção
   * (03/08/2026) essa coluna lia um campo `pagamentos_ids` que o backend
   * nunca envia, então sempre mostrava 0. Como os pagamentos ficam numa
   * chave por obra, é preciso ler a chave de cada obra representada
   * nesta lista e contar por `origem.refId`.
   */
  protected readonly contagemPagamentos = signal<Map<string, number>>(new Map());

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
        this.carregarContagemPagamentos(mapas);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os mapas.');
        this.carregando.set(false);
      },
    });
  }

  private carregarContagemPagamentos(mapas: Mapa[]): void {
    const obraIds = [
      ...new Set(mapas.map((m) => m['obra_id']).filter((id): id is string => !!id)),
    ];
    if (!obraIds.length) return;

    const leituras = obraIds.map((obraId) =>
      this.armazenamento.ler(chavePagamentos(obraId)).pipe(
        map((bruto) => ({ obraId, bruto })),
        catchError(() => of({ obraId, bruto: null as string | null })),
      ),
    );

    forkJoin(leituras).subscribe((resultados) => {
      const contagem = new Map<string, number>();

      for (const { bruto } of resultados) {
        if (!bruto) continue;
        try {
          const dados = JSON.parse(bruto);
          const lista = Array.isArray(dados?.pagamentos) ? dados.pagamentos : [];
          for (const bruto2 of lista) {
            const pagamento = normalizarPagamento(bruto2 as Record<string, unknown>);
            if (pagamento.origem?.tipo !== 'mapa' || !pagamento.origem.refId) continue;
            const refId = pagamento.origem.refId;
            contagem.set(refId, (contagem.get(refId) ?? 0) + 1);
          }
        } catch {
          // Chave com JSON inválido — ignora essa obra, mantém as demais.
        }
      }

      this.contagemPagamentos.set(contagem);
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
    return this.contagemPagamentos().get(mapa.id) ?? 0;
  }

  protected remover(mapa: Mapa): void {
    if (!window.confirm('Excluir este mapa da lista?')) return;

    this.api.excluirMapa(mapa.id).subscribe({
      next: () => this.mapas.update((lista) => lista.filter((m) => m.id !== mapa.id)),
      error: () => window.alert('Não foi possível excluir o mapa.'),
    });
  }
}
