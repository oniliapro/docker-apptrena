import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { Empreita, Pagamento } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarMoeda } from '../../core/utils/formato';

interface ServicoEmpreita {
  desc?: string;
  valorTotal?: number;
  valoresPorTipo?: Record<string, number>;
}

/**
 * Lista de Empreitas — portado de js/empreitas/01-lista.js.
 *
 * O original montava as colunas "Serviços" e "Pagamentos" cruzando três
 * chaves diferentes do localStorage (empreitas, pagamentos e um snapshot
 * da EAP) na mão. Aqui a coluna "Pagamentos" cruza com o endpoint
 * relacional `/api/pagamentos` (migrado em 03/08/2026), filtrando por
 * `origem.tipo === 'empreita'` e `origem.refId === empreita.id` — mesmo
 * princípio da coluna "Pagtos." da lista de Mapas. Fica vazia até existir
 * uma forma de gerar pagamento a partir de uma medição de empreita (item
 * 6, ainda não construído).
 */
@Component({
  selector: 'app-empreitas',
  imports: [RouterLink],
  templateUrl: './empreitas.html',
  styleUrl: './empreitas.scss',
})
export class Empreitas implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly empreitas = signal<Empreita[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly mostrarServicos = signal(true);
  protected readonly mostrarPagamentos = signal(true);

  protected readonly formatarMoeda = formatarMoeda;

  /** `empreitaId -> pagamentos` gerados a partir dela (ver comentário acima). */
  protected readonly pagamentosPorEmpreita = signal<Map<string, Pagamento[]>>(new Map());

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarEmpreitas().subscribe({
      next: (empreitas) => {
        this.empreitas.set(empreitas);
        this.carregando.set(false);
        this.carregarPagamentos(empreitas);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as empreitas.');
        this.carregando.set(false);
      },
    });
  }

  private carregarPagamentos(empreitas: Empreita[]): void {
    const obraIds = [
      ...new Set(empreitas.map((e) => e['obra_id']).filter((id): id is string => !!id)),
    ];
    if (!obraIds.length) return;

    const leituras = obraIds.map((obraId) =>
      this.api.listarPagamentos({ obraId }).pipe(catchError(() => of([]))),
    );

    forkJoin(leituras).subscribe((resultados) => {
      const mapa = new Map<string, Pagamento[]>();

      for (const lista of resultados) {
        for (const pagamento of lista) {
          const origem = pagamento['origem'] as { tipo?: string; refId?: string } | null;
          if (origem?.tipo !== 'empreita' || !origem.refId) continue;
          const lista2 = mapa.get(origem.refId) ?? [];
          lista2.push(pagamento);
          mapa.set(origem.refId, lista2);
        }
      }

      this.pagamentosPorEmpreita.set(mapa);
    });
  }

  /** Id da obra dona da empreita — usado pra montar o link de drill-down. */
  protected obraId(e: Empreita): string {
    return String(e['obra_id'] ?? '');
  }

  protected alternarServicos(): void {
    this.mostrarServicos.update((v) => !v);
  }

  protected alternarPagamentos(): void {
    this.mostrarPagamentos.update((v) => !v);
  }

  protected obra(e: Empreita): string {
    return String(e['obra_number'] ?? e['obraNumber'] ?? '—');
  }

  protected numero(e: Empreita): string {
    return String(e['numero_empreita'] ?? e['numeroEmpreita'] ?? '—');
  }

  protected descricao(e: Empreita): string {
    return String(e['descricao_empreita'] ?? e['descricaoEmpreita'] ?? '—');
  }

  protected total(e: Empreita): number {
    return Number(e['total_empreita'] ?? e['totalEmpreita'] ?? 0);
  }

  protected servicos(e: Empreita): ServicoEmpreita[] {
    const lista = e['servicos'] ?? e['itens'];
    return Array.isArray(lista) ? (lista as ServicoEmpreita[]) : [];
  }

  protected pagamentos(e: Empreita): Pagamento[] {
    return this.pagamentosPorEmpreita().get(e.id) ?? [];
  }

  protected totalPago(e: Empreita): number {
    return this.pagamentos(e).reduce(
      (soma, p) => soma + (Number(p['valor_total'] ?? p['valorTotal']) || 0),
      0,
    );
  }

  protected numeroPagamento(p: Record<string, unknown>): string {
    return String(p['numero_pagamento'] ?? p['numeroPagamento'] ?? '—');
  }

  protected valorPagamento(p: Record<string, unknown>): number {
    return Number(p['valor_total'] ?? p['valorTotal'] ?? 0);
  }
}
