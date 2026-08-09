import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Pagamento } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';

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
  imports: [RouterLink],
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
