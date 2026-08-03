import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { normalizarPagamento, paraPayloadApi } from './pagamentos-calc';
import {
  CabecalhoPagamentos,
  ItemEapSnapshot,
  Pagamento,
} from './pagamentos.models';

/**
 * Persistência de Pagamentos.
 *
 * Migrado em 03/08/2026 da ponte chave-valor (`controleObra.pagamentos.
 * v1.obra-{obraId}`) pro endpoint relacional `/api/pagamentos`, que já
 * existia pronto no backend (tabelas `pagamentos`/`pagamento_itens`) mas
 * nunca tinha sido conectado — faltava só o campo `status` (pendente/
 * confirmado), adicionado nesta mesma leva. Isso é o que permite listas
 * gerais confiáveis (todos os pagamentos de todas as obras) e vínculos
 * de verdade com Mapa/Empreita (`origem_tipo`/`origem_ref_id`,
 * `mapa_id`, `empreita_id`), sem precisar ler a chave-valor de cada
 * obra uma por uma.
 */
@Injectable()
export class PagamentosStore {
  private readonly api = inject(ApiService);

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

    this.api.listarPagamentos({ obraId }).subscribe({
      next: (lista) => {
        this.pagamentos.set(lista.map((p) => normalizarPagamento(p as Record<string, unknown>)));
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os pagamentos.');
        this.carregando.set(false);
      },
    });

    this.carregarObraNumber(obraId);
    this.carregarSnapshotEap(obraId);
  }

  /**
   * "Nº da obra" mostrado/editável no cabeçalho da tela — não existe mais
   * um registro único por obra pra guardar isso (cada pagamento carrega
   * o seu `obraNumber` na hora de salvar), então só inicializa a partir
   * do `map_number` cadastrado na obra. `definirObra()` troca só o valor
   * em tela; o que for salvo a partir daí (novo pagamento ou edição) leva
   * o valor trocado.
   */
  private carregarObraNumber(obraId: string): void {
    this.api.obterObra(obraId).subscribe({
      next: (obra) => this.cabecalho.set({ obraNumber: String(obra.map_number ?? '') }),
      error: () => undefined,
    });
  }

  definirObra(obraNumber: string): void {
    this.cabecalho.set({ obraNumber });
  }

  inserirOuAtualizar(pagamento: Pagamento, idEditando: string | null): void {
    const payload = paraPayloadApi(pagamento, this.obraId);
    const requisicao = idEditando
      ? this.api.atualizarPagamento(idEditando, payload)
      : this.api.criarPagamento(payload);

    requisicao.subscribe({
      next: (salvo) => {
        const normalizado = normalizarPagamento(salvo as Record<string, unknown>);
        this.pagamentos.update((lista) => {
          if (!idEditando) return [...lista, normalizado];
          return lista.map((p) => (p.id === idEditando ? normalizado : p));
        });
      },
      error: () => window.alert('Não foi possível salvar o pagamento — confira os valores e tente de novo.'),
    });
  }

  remover(id: string): void {
    this.api.excluirPagamento(id).subscribe({
      next: () => this.pagamentos.update((lista) => lista.filter((p) => p.id !== id)),
      error: () => window.alert('Não foi possível excluir o pagamento.'),
    });
  }

  // ------------------------------------------------------------------
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
}
