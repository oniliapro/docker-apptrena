import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { normalizarPagamento } from './pagamentos-calc';
import {
  CabecalhoPagamentos,
  ItemEapSnapshot,
  Pagamento,
  PayloadPagamentos,
} from './pagamentos.models';

/**
 * Chave por obra dos próprios pagamentos — task "obra como contexto"
 * (28/07/2026). Pagamentos continua na ponte chave-valor por enquanto
 * (o endpoint relacional `/pagamentos` ainda não foi confirmado como
 * pronto pro formato que esta tela usa — ver `INTEGRACAO.md`).
 *
 * A leitura do snapshot da EAP (só como rótulo de etapa) já migrou
 * (28/07/2026) pro endpoint relacional `GET /obras/{id}/eap` — ver
 * `carregarSnapshotEap` — porque é de lá que a EAP de verdade vem desde
 * que `EapStore` também migrou.
 */
const chavePagamentos = (obraId: string) => `controleObra.pagamentos.v1.obra-${obraId}`;

/**
 * Persistência de Pagamentos.
 *
 * Usa a ponte chave-valor do backend (GET/POST /api/storage), que fala o
 * mesmo formato do storage.php de hoje. É uma escolha deliberada: os
 * pagamentos ainda não têm modelo relacional equivalente no
 * laravel-backend, e migrar o formato ao mesmo tempo que o framework
 * dobraria o risco. Quando o backend relacional cobrir pagamentos, só
 * este arquivo muda.
 */
@Injectable()
export class PagamentosStore {
  private readonly armazenamento = inject(ArmazenamentoService);
  private readonly api = inject(ApiService);

  /** Verdadeiro quando os dados estão indo só para o navegador. */
  readonly modoLocal = this.armazenamento.modoLocal;

  /** Obra atual — definida por `carregar(obraId)`, usada em toda gravação. */
  private obraId = '';

  readonly cabecalho = signal<CabecalhoPagamentos>({ obraNumber: '' });
  readonly pagamentos = signal<Pagamento[]>([]);
  readonly snapshotEap = signal<ItemEapSnapshot[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  readonly total = computed(() =>
    this.pagamentos().reduce((soma, p) => soma + (Number(p.valorTotal) || 0), 0),
  );

  /** `obraId` define de qual obra são os pagamentos — obrigatório desde a task "obra como contexto". */
  carregar(obraId: string): void {
    this.obraId = obraId;
    this.carregando.set(true);
    this.erro.set(null);

    this.armazenamento.ler(chavePagamentos(obraId)).subscribe({
      next: (value) => {
        this.aplicarPayload(this.interpretar(value));
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os pagamentos.');
        this.carregando.set(false);
      },
    });

    this.carregarSnapshotEap(obraId);
  }

  salvar(): void {
    const payload: PayloadPagamentos = {
      header: this.cabecalho(),
      pagamentos: this.pagamentos(),
    };

    this.armazenamento.gravar(chavePagamentos(this.obraId), JSON.stringify(payload)).subscribe();
  }

  definirObra(obraNumber: string): void {
    this.cabecalho.set({ obraNumber });
    this.salvar();
  }

  inserirOuAtualizar(pagamento: Pagamento, idEditando: string | null): void {
    this.pagamentos.update((lista) => {
      if (!idEditando) return [...lista, pagamento];
      return lista.map((p) => (p.id === idEditando ? pagamento : p));
    });
    this.salvar();
  }

  remover(id: string): void {
    this.pagamentos.update((lista) => lista.filter((p) => p.id !== id));
    this.salvar();
  }

  // ------------------------------------------------------------------
  private aplicarPayload(payload: Record<string, unknown> | null): void {
    const header = (payload?.['header'] ?? {}) as Record<string, unknown>;
    this.cabecalho.set({ obraNumber: String(header['obraNumber'] ?? '') });

    const lista = payload?.['pagamentos'];
    this.pagamentos.set(
      Array.isArray(lista) ? lista.map((p) => normalizarPagamento(p as Record<string, unknown>)) : [],
    );
  }

  /**
   * A EAP entra aqui só como rótulo (para dizer a que etapa cada item se
   * refere), então uma falha ao carregá-la não deve derrubar a tela —
   * os selects apenas ficam vazios.
   */
  private carregarSnapshotEap(obraId: string): void {
    this.api.obterEap(obraId).subscribe({
      next: (payload) => this.snapshotEap.set(this.extrairItensEap(payload.eapItems)),
      error: () => this.snapshotEap.set([]),
    });
  }

  private extrairItensEap(lista: unknown): ItemEapSnapshot[] {
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

  /** O storage guarda JSON como string; JSON inválido vira null, não exceção. */
  private interpretar(bruto: string | null): Record<string, unknown> | null {
    if (!bruto) return null;
    try {
      const dados = JSON.parse(bruto);
      return typeof dados === 'object' && dados !== null ? (dados as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
