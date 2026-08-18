import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Pagamento } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';
import { dataDentroDoIntervalo, valoresDistintos } from '../../shared/filtros/filtros';

type ColunaPagamentoGeral =
  | 'obra'
  | 'numero'
  | 'dataSolicitacao'
  | 'fornecedor'
  | 'descricao'
  | 'origem'
  | 'valorTotal'
  | 'status';

/**
 * Lista geral de Pagamentos — todos os lançamentos de todas as obras
 * (item 4, 03/08/2026). Só existe porque Pagamentos migrou pro endpoint
 * relacional `/api/pagamentos` no mesmo dia: antes disso cada obra tinha
 * sua própria chave-valor isolada, sem jeito de listar tudo junto.
 *
 * O "Ver" de cada linha não abre o pagamento em si (não existe uma
 * página própria pra isso), e sim a página que originou o lançamento —
 * exatamente o que foi pedido: o Mapa ou a Empreita que geraram o
 * pagamento automaticamente, ou a aba Pagamentos da obra para os
 * lançamentos manuais (onde ele já aparece na lista, pronto pra editar).
 */
@Component({
  selector: 'app-pagamentos-geral',
  imports: [RouterLink, RedimensionarColunas],
  templateUrl: './pagamentos-geral.html',
  styleUrl: './pagamentos-geral.scss',
})
export class PagamentosGeral implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly pagamentos = signal<Pagamento[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;

  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaPagamentoGeral> | null>(null);
  protected readonly setaOrdenacao = setaOrdenacao;
  protected readonly busca = signal('');
  protected readonly filtroStatus = signal<'todos' | 'pendente' | 'confirmado'>('todos');
  protected readonly filtroObra = signal('');
  protected readonly filtroOrigem = signal<'todos' | 'manual' | 'mapa' | 'empreita'>('todos');
  protected readonly filtroDataDe = signal('');
  protected readonly filtroDataAte = signal('');

  protected readonly obrasDisponiveis = computed(() =>
    valoresDistintos(this.pagamentos(), (p) => this.obraNumber(p)).filter((v) => v !== '—'),
  );

  protected alternarOrdenacaoColuna(coluna: ColunaPagamentoGeral): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroStatus(evento: Event): void {
    this.filtroStatus.set((evento.target as HTMLSelectElement).value as 'todos' | 'pendente' | 'confirmado');
  }

  protected mudarFiltroObra(evento: Event): void {
    this.filtroObra.set((evento.target as HTMLSelectElement).value);
  }

  protected mudarFiltroOrigem(evento: Event): void {
    this.filtroOrigem.set((evento.target as HTMLSelectElement).value as 'todos' | 'manual' | 'mapa' | 'empreita');
  }

  protected mudarFiltroDataDe(evento: Event): void {
    this.filtroDataDe.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroDataAte(evento: Event): void {
    this.filtroDataAte.set((evento.target as HTMLInputElement).value);
  }

  private readonly listaFiltrada = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const status = this.filtroStatus();
    const obra = this.filtroObra();
    const origem = this.filtroOrigem();
    const de = this.filtroDataDe();
    const ate = this.filtroDataAte();

    return this.pagamentos().filter((p) => {
      if (status !== 'todos' && (p['status'] as string) !== status) return false;
      if (obra && this.obraNumber(p) !== obra) return false;
      if (origem !== 'todos' && this.origemRotulo(p).toLowerCase() !== origem) return false;
      if (!dataDentroDoIntervalo(p['dataSolicitacao'] as string | null, de, ate)) return false;
      if (!termo) return true;
      return [this.obraNumber(p), this.numero(p), this.fornecedor(p), this.descricao(p)]
        .join(' ')
        .toLowerCase()
        .includes(termo);
    });
  });

  protected readonly listaOrdenada = computed(() =>
    ordenarPor(this.listaFiltrada(), this.ordenacao(), (p, coluna) => {
      switch (coluna) {
        case 'obra': return this.obraNumber(p);
        case 'numero': return this.numero(p);
        case 'dataSolicitacao': return p['dataSolicitacao'] as string | null;
        case 'fornecedor': return this.fornecedor(p);
        case 'descricao': return this.descricao(p);
        case 'origem': return this.origemRotulo(p);
        case 'valorTotal': return this.valorTotal(p);
        case 'status': return p['status'] as string | null;
      }
    }),
  );

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    // Sem filtros: todos os pagamentos da empresa, de todas as obras.
    this.api.listarPagamentos().subscribe({
      next: (pagamentos) => {
        this.pagamentos.set(pagamentos);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os pagamentos.');
        this.carregando.set(false);
      },
    });
  }

  protected obraNumber(p: Pagamento): string {
    return String(p['obraNumber'] ?? '—') || '—';
  }

  protected numero(p: Pagamento): string {
    return String(p['numeroPagamento'] ?? '—') || '—';
  }

  protected fornecedor(p: Pagamento): string {
    return String(p['fornecedor'] ?? '—') || '—';
  }

  protected descricao(p: Pagamento): string {
    return String(p['descricao'] ?? '—') || '—';
  }

  protected valorTotal(p: Pagamento): number {
    return Number(p['valorTotal'] ?? 0);
  }

  protected dataSolicitacao(p: Pagamento): string {
    return this.formatarData(String(p['dataSolicitacao'] ?? '')) || '—';
  }

  protected pendente(p: Pagamento): boolean {
    return p['status'] === 'pendente';
  }

  private origem(p: Pagamento): { tipo?: string; refId?: string } | null {
    return (p['origem'] as { tipo?: string; refId?: string } | null) ?? null;
  }

  /** Rótulo de onde o pagamento nasceu — Manual, Mapa ou Empreita. */
  protected origemRotulo(p: Pagamento): string {
    const tipo = this.origem(p)?.tipo;
    if (tipo === 'mapa') return 'Mapa';
    if (tipo === 'empreita') return 'Empreita';
    return 'Manual';
  }

  /**
   * Rota da página que gerou o lançamento: o Mapa ou a Empreita, quando
   * automático; a aba Pagamentos da própria obra, quando manual (não
   * existe uma página "de origem" separada pra um lançamento digitado à
   * mão — a lista da obra já mostra ele pronto pra editar).
   */
  protected rotaOrigem(p: Pagamento): unknown[] {
    const obraId = String(p['obraId'] ?? '');
    const origem = this.origem(p);

    if (origem?.tipo === 'mapa' && origem.refId) {
      return ['/obras', obraId, 'mapas', origem.refId];
    }
    if (origem?.tipo === 'empreita' && origem.refId) {
      return ['/obras', obraId, 'empreitas', origem.refId];
    }
    return ['/obras', obraId, 'pagamentos'];
  }
}
