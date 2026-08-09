import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { Mapa, Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';

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
  protected readonly formatarData = formatarData;

  /**
   * Nome da obra de cada mapa — `obraId -> obra_nome`. A coluna da
   * lista mostrava "Cliente" (texto digitado à mão dentro do mapa, quase
   * sempre vazio); trocado para "Obra" (04/08/2026, pedido do Lucas), que
   * é um dado confiável — vem do cadastro da obra, não de digitação.
   */
  protected readonly nomeDaObra = signal<Map<string, string>>(new Map());

  /**
   * Pagamentos gerados a partir de cada mapa — `mapaId -> Pagamento[]`.
   * Cada Pagamento carrega `origem: { tipo: 'mapa', refId }` quando nasce
   * de "Gerar Pagamento" (ver `mapa.store.ts#montarPagamentosPorFornecedor`).
   *
   * Serve pra três coisas (04/08/2026, revisão da lista com o Lucas):
   * 1. Contagem da coluna "Pagtos.".
   * 2. Total da coluna "Total" — o campo `total_mapa` salvo no mapa vinha
   *    sempre R$ 0,00 em vários casos reais (provavelmente porque só é
   *    recalculado no editor, e nem todo mapa passa por lá de novo depois
   *    de gerar pagamento); somar os pagamentos de verdade é mais
   *    confiável que confiar nesse campo solto.
   * 3. Popup com a lista de pagamentos ao clicar no número de "Pagtos.".
   */
  protected readonly pagamentosPorMapa = signal<Map<string, Pagamento[]>>(new Map());

  /** Mapa cujo popup de pagamentos está aberto — null quando fechado. */
  protected readonly popupMapa = signal<Mapa | null>(null);

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
        this.carregarObrasEPagamentos(mapas);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os mapas.');
        this.carregando.set(false);
      },
    });
  }

  private carregarObrasEPagamentos(mapas: Mapa[]): void {
    const obraIds = [
      ...new Set(mapas.map((m) => m['obra_id']).filter((id): id is string => !!id)),
    ];
    if (!obraIds.length) return;

    const nomes = obraIds.map((obraId) =>
      this.api.obterObra(obraId).pipe(catchError(() => of(null as Obra | null))),
    );
    const pagamentos = obraIds.map((obraId) =>
      this.api.listarPagamentos({ obraId }).pipe(catchError(() => of([]))),
    );

    forkJoin(nomes).subscribe((resultados) => {
      const mapa = new Map<string, string>();
      resultados.forEach((obra, indice) => {
        if (obra) mapa.set(obraIds[indice], String(obra.obra_nome ?? '') || '—');
      });
      this.nomeDaObra.set(mapa);
    });

    forkJoin(pagamentos).subscribe((resultados) => {
      const porMapa = new Map<string, Pagamento[]>();

      for (const lista of resultados) {
        for (const bruto of lista) {
          const pagamento = normalizarPagamento(bruto as Record<string, unknown>);
          const origem = pagamento.origem;
          if (origem?.tipo !== 'mapa' || !origem.refId) continue;
          const refId = origem.refId;
          const atual = porMapa.get(refId) ?? [];
          atual.push(pagamento);
          porMapa.set(refId, atual);
        }
      }

      this.pagamentosPorMapa.set(porMapa);
    });
  }

  protected numero(mapa: Mapa): string {
    return String(mapa['map_number'] ?? mapa['numeroMapa'] ?? '—');
  }

  protected descricao(mapa: Mapa): string {
    return String(mapa['descricao'] ?? '—');
  }

  protected obraDoMapa(mapa: Mapa): string {
    return this.nomeDaObra().get(this.obraId(mapa)) ?? '—';
  }

  /**
   * Coluna "Finalização" — lê `confirmed_at` (04/08/2026), preenchido
   * automaticamente pelo botão "Finalizar mapa" no editor. Substitui o
   * antigo `data_finalizacao`, que era digitado à mão e não garantia que
   * o mapa estivesse de fato pronto.
   */
  protected dataFinalizacao(mapa: Mapa): string {
    const bruto = mapa['confirmed_at'];
    return bruto ? formatarData(String(bruto)) : '—';
  }

  /** Soma dos pagamentos gerados a partir deste mapa — ver `pagamentosPorMapa`. */
  protected total(mapa: Mapa): number {
    const lista = this.pagamentosPorMapa().get(mapa.id) ?? [];
    return lista.reduce((soma, p) => soma + (Number(p.valorTotal) || 0), 0);
  }

  protected pagamentosDoMapa(mapa: Mapa): Pagamento[] {
    return this.pagamentosPorMapa().get(mapa.id) ?? [];
  }

  protected quantidadePagamentos(mapa: Mapa): number {
    return this.pagamentosDoMapa(mapa).length;
  }

  /** Id da obra dona do mapa — usado pra montar o link de drill-down. */
  protected obraId(mapa: Mapa): string {
    return String(mapa['obra_id'] ?? '');
  }

  protected abrirPopupPagamentos(mapa: Mapa): void {
    if (!this.quantidadePagamentos(mapa)) return;
    this.popupMapa.set(mapa);
  }

  protected fecharPopupPagamentos(): void {
    this.popupMapa.set(null);
  }

  protected remover(mapa: Mapa): void {
    if (!window.confirm('Excluir este mapa da lista?')) return;

    this.api.excluirMapa(mapa.id).subscribe({
      next: () => this.mapas.update((lista) => lista.filter((m) => m.id !== mapa.id)),
      error: () => window.alert('Não foi possível excluir o mapa.'),
    });
  }
}
