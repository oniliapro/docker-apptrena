import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { normalizarRecebimento, paraPayloadApi } from './recebimentos-calc';
import {
  CabecalhoRecebimentos,
  ItemEapSnapshotRecebimento,
  Recebimento,
} from './recebimentos.models';

/**
 * Persistência de Recebimentos (01/09/2026, pedido do Lucas: "funciona
 * exatamente como os pagamentos") — mirror de `pagamentos.store.ts`.
 */
@Injectable()
export class RecebimentosStore {
  private readonly api = inject(ApiService);

  /** Obra atual — definida por `carregar(obraId)`, usada em toda gravação. */
  private obraId = '';

  readonly cabecalho = signal<CabecalhoRecebimentos>({ obraNumber: '' });
  readonly obraNome = signal('');
  readonly recebimentos = signal<Recebimento[]>([]);
  readonly snapshotEap = signal<ItemEapSnapshotRecebimento[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  readonly total = computed(() =>
    this.recebimentos().reduce((soma, r) => soma + (Number(r.valorTotal) || 0), 0),
  );

  carregar(obraId: string): void {
    this.obraId = obraId;
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarRecebimentos({ obraId }).subscribe({
      next: (lista) => {
        this.recebimentos.set(lista.map((r) => normalizarRecebimento(r as Record<string, unknown>)));
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os recebimentos.');
        this.carregando.set(false);
      },
    });

    this.carregarObraNumber(obraId);
    this.carregarSnapshotEap(obraId);
  }

  private carregarObraNumber(obraId: string): void {
    this.api.obterObra(obraId).subscribe({
      next: (obra) => {
        this.cabecalho.set({ obraNumber: String(obra.map_number ?? '') });
        this.obraNome.set(String(obra.obra_nome ?? ''));
      },
      error: () => undefined,
    });
  }

  definirObra(obraNumber: string): void {
    this.cabecalho.set({ obraNumber });
  }

  inserirOuAtualizar(recebimento: Recebimento, idEditando: string | null): void {
    const payload = paraPayloadApi(recebimento, this.obraId);
    const requisicao = idEditando
      ? this.api.atualizarRecebimento(idEditando, payload)
      : this.api.criarRecebimento(payload);

    requisicao.subscribe({
      next: (salvo) => {
        const normalizado = normalizarRecebimento(salvo as Record<string, unknown>);
        this.recebimentos.update((lista) => {
          if (!idEditando) return [...lista, normalizado];
          return lista.map((r) => (r.id === idEditando ? normalizado : r));
        });
      },
      error: () => window.alert('Não foi possível salvar o recebimento — confira os valores e tente de novo.'),
    });
  }

  remover(id: string): void {
    this.api.excluirRecebimento(id).subscribe({
      next: () => this.recebimentos.update((lista) => lista.filter((r) => r.id !== id)),
      error: () => window.alert('Não foi possível excluir o recebimento.'),
    });
  }

  // ------------------------------------------------------------------
  private carregarSnapshotEap(obraId: string): void {
    this.api.obterEap(obraId).subscribe({
      next: (payload) => this.snapshotEap.set(this.extrairItensEap(payload.eapItems)),
      error: () => this.snapshotEap.set([]),
    });
  }

  private extrairItensEap(lista: unknown): ItemEapSnapshotRecebimento[] {
    if (!Array.isArray(lista)) return [];

    return lista
      .map((bruto) => {
        const item = bruto as Record<string, unknown>;
        return {
          id: String(item?.['id'] ?? ''),
          isGroup: Boolean(item?.['isGroup']),
          eap: String(item?.['eap'] ?? ''),
          desc: String(item?.['desc'] ?? ''),
        };
      })
      .filter((item) => item.id);
  }
}
