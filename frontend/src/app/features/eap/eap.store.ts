import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { EapItem as EapItemApi } from '../../core/models/api.models';
import { calcularCacheOrcado, somarDescendentesDoGrupo } from './eap-engine';
import {
  aplicarNumeracaoAutomatica,
  cabecalhoVazio,
  criarVazioPorTipo,
  gerarId,
  normalizarCabecalho,
  normalizarItemEap,
  normalizarUi,
} from './eap-normalize';
import { CabecalhoObra, ChaveTipo, EstadoUi, ItemEap, TIPOS_CUSTO } from './eap.models';

/**
 * Estado da EAP: cabeçalho da obra, preferências de exibição e itens.
 *
 * Migrado (28/07/2026) da ponte genérica chave-valor para o endpoint
 * relacional `GET/PUT /obras/{id}/eap` (`ApiService.obterEap`/
 * `salvarEap`) — o `ObraController::showEap()`/`syncEap()` no backend já
 * aceitava exatamente este payload `{header, ui, eapItems}`, então a
 * migração foi só de origem dos dados, sem mudar formato. É o primeiro
 * dos quatro módulos (EAP, Mapa, Empreita, Pagamentos) a sair da ponte —
 * ver `INTEGRACAO.md`. Os outros três continuam na ponte por enquanto:
 * o endpoint deles ainda não foi confirmado como pronto pro formato que
 * a tela usa (são maiores, com relações aninhadas).
 *
 * Os cálculos ficam em `eap-engine.ts`, verificado contra o original em
 * `verificacao/`. Aqui só entra estado e persistência.
 */
@Injectable()
export class EapStore {
  private readonly api = inject(ApiService);

  /** Obra atual — definida por `carregar(obraId)`, usada em toda gravação. */
  private obraId = '';

  readonly cabecalho = signal<CabecalhoObra>(cabecalhoVazio());
  readonly ui = signal<EstadoUi>(normalizarUi(null));
  readonly itens = signal<ItemEap[]>([]);

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly salvando = signal(false);

  /** Recalculado sozinho a cada mudança em itens ou cabeçalho. */
  readonly cache = computed(() => calcularCacheOrcado(this.itens(), this.cabecalho()));

  readonly tiposVisiveis = computed(() =>
    TIPOS_CUSTO.filter((t) => this.ui().visibleTypes[t.chave] !== false),
  );

  /** Só detalha por categoria se o usuário pediu e há alguma visível. */
  readonly mostrarColunasTipo = computed(
    () => this.ui().showTypes && this.tiposVisiveis().length > 0,
  );

  // ------------------------------------------------------------------
  // Carga e gravação
  // ------------------------------------------------------------------
  /** `obraId` define de qual obra é a EAP — obrigatório desde a task "obra como contexto". */
  carregar(obraId: string): void {
    this.obraId = obraId;
    this.carregando.set(true);
    this.erro.set(null);

    this.api.obterEap(obraId).subscribe({
      next: (payload) => {
        // `showEap()` sempre devolve uma estrutura completa (mesmo pra
        // obra sem EAP lançada ainda, com eapItems vazio) — diferente da
        // ponte chave-valor, não há caso de "nada gravado ainda".
        this.aplicar(payload.header, payload.ui, payload.eapItems);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar a EAP.');
        this.carregando.set(false);
      },
    });
  }

  private aplicar(
    header: Record<string, unknown>,
    ui: Record<string, unknown>,
    itensBrutos: unknown[],
  ): void {
    this.cabecalho.set(normalizarCabecalho(header));
    this.ui.set(normalizarUi(ui));

    const itens = Array.isArray(itensBrutos)
      ? itensBrutos.map((i) => normalizarItemEap(i as Record<string, unknown>))
      : [];

    this.itens.set(aplicarNumeracaoAutomatica(itens));
  }

  salvar(): void {
    this.salvando.set(true);

    const payload = {
      header: this.cabecalho() as unknown as Record<string, unknown>,
      ui: this.ui() as unknown as Record<string, unknown>,
      eapItems: this.itens() as unknown as EapItemApi[],
    };

    this.api.salvarEap(this.obraId, payload).subscribe({
      next: () => this.salvando.set(false),
      error: () => this.salvando.set(false),
    });
  }

  // ------------------------------------------------------------------
  // Cabeçalho e preferências
  // ------------------------------------------------------------------
  atualizarCabecalho(campo: keyof CabecalhoObra, valor: unknown): void {
    this.cabecalho.update((c) => ({ ...c, [campo]: valor }));
    this.salvar();
  }

  atualizarUi(campo: keyof EstadoUi, valor: unknown): void {
    this.ui.update((u) => ({ ...u, [campo]: valor }));
    this.salvar();
  }

  alternarTipoVisivel(chave: ChaveTipo): void {
    this.ui.update((u) => ({
      ...u,
      visibleTypes: { ...u.visibleTypes, [chave]: !u.visibleTypes[chave] },
    }));
    this.salvar();
  }

  alternarConfirmacao(): void {
    this.cabecalho.update((c) => ({
      ...c,
      isConfirmed: !c.isConfirmed,
      confirmedAt: !c.isConfirmed ? new Date().toISOString() : '',
    }));
    this.salvar();
  }

  // ------------------------------------------------------------------
  // Itens
  // ------------------------------------------------------------------
  /**
   * Insere um item. `posicao` permite inserir no meio da lista (usado
   * pelo atalho Shift + `+`, que insere logo abaixo da linha atual);
   * omitida, acrescenta ao final.
   */
  adicionarItem(isGroup = false, posicao?: number): void {
    this.itens.update((lista) => {
      const novo: ItemEap = {
        id: gerarId(),
        isGroup,
        eap: '',
        desc: '',
        qtde: isGroup ? 0 : 1,
        unid: '',
        unit: criarVazioPorTipo(),
        bdiMode: 'pct',
        bdiPercent: 0,
        bdiValue: 0,
      };

      const destino =
        posicao === undefined ? lista.length : Math.max(0, Math.min(lista.length, posicao));

      const copia = [...lista];
      copia.splice(destino, 0, novo);
      return aplicarNumeracaoAutomatica(copia);
    });
    this.salvar();
  }

  atualizarItem(id: string, alteracao: Partial<ItemEap>): void {
    this.itens.update((lista) =>
      aplicarNumeracaoAutomatica(
        lista.map((item) => (item.id === id ? { ...item, ...alteracao } : item)),
      ),
    );
    this.salvar();
  }

  atualizarCustoUnitario(id: string, tipo: ChaveTipo, valor: number): void {
    this.itens.update((lista) =>
      lista.map((item) =>
        item.id === id ? { ...item, unit: { ...item.unit, [tipo]: valor } } : item,
      ),
    );
    this.salvar();
  }

  removerItem(id: string): void {
    this.itens.update((lista) => aplicarNumeracaoAutomatica(lista.filter((i) => i.id !== id)));
    this.salvar();
  }

  /** Move uma linha; a renumeração da EAP acompanha a nova ordem. */
  moverItem(id: string, direcao: -1 | 1): void {
    this.itens.update((lista) => {
      const atual = lista.findIndex((i) => i.id === id);
      const destino = atual + direcao;
      if (atual < 0 || destino < 0 || destino >= lista.length) return lista;

      const copia = [...lista];
      [copia[atual], copia[destino]] = [copia[destino], copia[atual]];
      return aplicarNumeracaoAutomatica(copia);
    });
    this.salvar();
  }

  limpar(): void {
    this.itens.set([]);
    this.cabecalho.set(cabecalhoVazio());
    this.salvar();
  }

  // ------------------------------------------------------------------
  totaisDoGrupo(indice: number) {
    return somarDescendentesDoGrupo(indice, this.itens(), this.cache());
  }
}
