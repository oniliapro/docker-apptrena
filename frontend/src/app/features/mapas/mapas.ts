import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { Mapa, Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';
import { dataDentroDoIntervalo, valoresDistintos } from '../../shared/filtros/filtros';

type ColunaMapa =
  | 'codigo'
  | 'numero'
  | 'descricao'
  | 'obra'
  | 'status'
  | 'inicio'
  | 'finalizacao'
  | 'responsavelMapa'
  | 'total'
  | 'pagamentos';

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
  imports: [RouterLink, RedimensionarColunas],
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
   * Serve pra duas coisas:
   * 1. Contagem da coluna "Pagtos." e o popup com a lista ao clicar nela.
   * 2. (Até 16/08/2026) também alimentava o "Total" — trocado pra usar
   *    `total_mapa` direto (ver `total()`), porque somar só pagamentos já
   *    gerados deixava a coluna zerada em qualquer mapa que ainda não
   *    passou por "Gerar Pagamento" (cotação em andamento, por exemplo),
   *    mesmo com itens e preços preenchidos — o pedido do Lucas era ver o
   *    valor efetivo do mapa, não o que já virou pagamento.
   */
  protected readonly pagamentosPorMapa = signal<Map<string, Pagamento[]>>(new Map());

  /** Mapa cujo popup de pagamentos está aberto — null quando fechado. */
  protected readonly popupMapa = signal<Mapa | null>(null);

  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaMapa> | null>(null);
  protected readonly setaOrdenacao = setaOrdenacao;
  protected readonly busca = signal('');

  /** Filtros por coluna (19/08/2026, pedido do Lucas — além da busca livre). */
  protected readonly filtroObra = signal('');
  protected readonly filtroFinalizacaoDe = signal('');
  protected readonly filtroFinalizacaoAte = signal('');

  /** Filtros novos (20/08/2026, pedido do Lucas) — Status, Início e Responsável da cotação. */
  protected readonly filtroStatus = signal<'' | 'em_edicao' | 'finalizado'>('');
  protected readonly filtroInicioDe = signal('');
  protected readonly filtroInicioAte = signal('');
  protected readonly filtroResponsavel = signal('');

  protected readonly obrasDisponiveis = computed(() =>
    valoresDistintos(this.mapas(), (mapa) => this.obraDoMapa(mapa)).filter((v) => v !== '—'),
  );

  protected readonly responsaveisDisponiveis = computed(() =>
    valoresDistintos(this.mapas(), (mapa) => this.responsavelCotacao(mapa)),
  );

  protected alternarOrdenacaoColuna(coluna: ColunaMapa): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroObra(evento: Event): void {
    this.filtroObra.set((evento.target as HTMLSelectElement).value);
  }

  protected mudarFiltroFinalizacaoDe(evento: Event): void {
    this.filtroFinalizacaoDe.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroFinalizacaoAte(evento: Event): void {
    this.filtroFinalizacaoAte.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroStatus(evento: Event): void {
    this.filtroStatus.set((evento.target as HTMLSelectElement).value as '' | 'em_edicao' | 'finalizado');
  }

  protected mudarFiltroInicioDe(evento: Event): void {
    this.filtroInicioDe.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroInicioAte(evento: Event): void {
    this.filtroInicioAte.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroResponsavel(evento: Event): void {
    this.filtroResponsavel.set((evento.target as HTMLSelectElement).value);
  }

  protected readonly listaOrdenada = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const obra = this.filtroObra();
    const de = this.filtroFinalizacaoDe();
    const ate = this.filtroFinalizacaoAte();
    const status = this.filtroStatus();
    const inicioDe = this.filtroInicioDe();
    const inicioAte = this.filtroInicioAte();
    const responsavel = this.filtroResponsavel();

    const filtrada = this.mapas().filter((mapa) => {
      if (obra && this.obraDoMapa(mapa) !== obra) return false;
      if (!dataDentroDoIntervalo(mapa['confirmed_at'] as string | null, de, ate)) return false;
      if (!dataDentroDoIntervalo(mapa['created_at'] as string | null, inicioDe, inicioAte)) return false;
      if (status === 'finalizado' && !mapa['is_confirmed']) return false;
      if (status === 'em_edicao' && mapa['is_confirmed']) return false;
      if (responsavel && this.responsavelCotacao(mapa) !== responsavel) return false;
      if (!termo) return true;
      return [this.numero(mapa), this.descricao(mapa), this.obraDoMapa(mapa)]
        .join(' ')
        .toLowerCase()
        .includes(termo);
    });

    return ordenarPor(filtrada, this.ordenacao(), (mapa, coluna) => {
      switch (coluna) {
        case 'codigo': return this.codigo(mapa);
        case 'numero': return this.numero(mapa);
        case 'descricao': return this.descricao(mapa);
        case 'obra': return this.obraDoMapa(mapa);
        case 'status': return this.statusMapa(mapa);
        case 'inicio': return mapa['created_at'] as string | null;
        case 'finalizacao': return mapa['confirmed_at'] as string | null;
        case 'responsavelMapa': return this.responsavelCotacao(mapa);
        case 'total': return this.total(mapa);
        case 'pagamentos': return this.quantidadePagamentos(mapa);
      }
    });
  });

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

  protected codigo(mapa: Mapa): string {
    return String(mapa['codigo'] ?? '—');
  }

  protected numero(mapa: Mapa): string {
    // `map_number`/`numeroMapa` eram os nomes errados (o primeiro é campo
    // de Obra, o segundo só existe no `CabecalhoMapa` do frontend) — a API
    // devolve `numero_mapa`, então essa coluna sempre caía em "—" (bug
    // encontrado junto do "Total" zerado, 16/08/2026).
    return String(mapa['numero_mapa'] ?? '—');
  }

  protected descricao(mapa: Mapa): string {
    return String(mapa['descricao'] ?? '—');
  }

  protected obraDoMapa(mapa: Mapa): string {
    return this.nomeDaObra().get(this.obraId(mapa)) ?? '—';
  }

  /** "Finalizado"/"Em edição" — mesmo rótulo já usado no editor do mapa (mapa.html). */
  protected statusMapa(mapa: Mapa): string {
    return mapa['is_confirmed'] ? 'Finalizado' : 'Em edição';
  }

  /** Coluna "Início" — `created_at`, o mesmo timestamp que já alimenta "Início do mapa" no editor. */
  protected dataInicio(mapa: Mapa): string {
    const bruto = mapa['created_at'];
    return bruto ? formatarData(String(bruto)) : '—';
  }

  protected responsavelCotacao(mapa: Mapa): string {
    return String(mapa['responsavel_mapa'] ?? '—');
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

  /**
   * Valor efetivo total do mapa — `total_mapa`, calculado e gravado pelo
   * editor a cada mudança (`MapaStore.calcularTotalGeral`, nota
   * fracionada com desconto real + frete particular). Trocado (16/08/2026,
   * pedido do Lucas) de "somar só os pagamentos já gerados" — que
   * mostrava R$ 0,00 pra qualquer mapa ainda não finalizado/sem "Gerar
   * Pagamento" — pra esse campo, que reflete o mapa mesmo antes de gerar
   * pagamento nenhum.
   */
  protected total(mapa: Mapa): number {
    return Number(mapa['total_mapa']) || 0;
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
