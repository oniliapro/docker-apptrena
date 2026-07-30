import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Empreita } from '../../core/models/api.models';
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
 * da EAP) na mão. Aqui as colunas alternáveis foram preservadas, mas o
 * cruzamento com pagamentos depende do backend devolver esses dados
 * junto — enquanto isso, a coluna mostra o que vier em `pagamentos`.
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
      },
      error: () => {
        this.erro.set('Não foi possível carregar as empreitas.');
        this.carregando.set(false);
      },
    });
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

  protected pagamentos(e: Empreita): Array<Record<string, unknown>> {
    const lista = e['pagamentos'];
    return Array.isArray(lista) ? (lista as Array<Record<string, unknown>>) : [];
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
