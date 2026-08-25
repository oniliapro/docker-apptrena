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
import { CabecalhoObra, ChaveTipo, EstadoUi, ItemEap, PorTipo, TIPOS_CUSTO } from './eap.models';

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

  /**
   * Com a EAP confirmada, nenhum campo é editável — só "Reabrir EAP" volta
   * a permitir mudanças. Decisão tomada com o Lucas em 15/08/2026: antes
   * só o Orçado congelava (ver `alternarConfirmacao`), mas outros lugares
   * que liam os dados ao vivo (ex.: o painel "Resumo por categoria")
   * continuavam mudando se qtde/custo/BDI fossem editados depois de
   * confirmar — travar tudo na origem evita essa classe inteira de bug,
   * em vez de precisar caçar cada lugar que lê a cache ao vivo. Checada em
   * todo método que muda `itens`, `cabecalho` ou `ui` (exceto a própria
   * `alternarConfirmacao`, que é a única saída do estado travado). Também
   * exposta ao componente, pra desabilitar os campos na tela.
   */
  readonly travada = computed(() => this.cabecalho().isConfirmed);

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
    if (this.travada()) return;
    this.cabecalho.update((c) => ({ ...c, [campo]: valor }));
    this.salvar();
  }

  atualizarUi(campo: keyof EstadoUi, valor: unknown): void {
    if (this.travada()) return;
    this.ui.update((u) => ({ ...u, [campo]: valor }));
    this.salvar();
  }

  alternarTipoVisivel(chave: ChaveTipo): void {
    if (this.travada()) return;
    this.ui.update((u) => ({
      ...u,
      visibleTypes: { ...u.visibleTypes, [chave]: !u.visibleTypes[chave] },
    }));
    this.salvar();
  }

  /**
   * Confirmar congela o Orçado (custo direto + BDI) de cada item no valor
   * do momento, pra não virar um alvo móvel se qtde/custo mudarem depois —
   * decisão tomada com o Lucas em 14/08/2026 (antes recalculava ao vivo
   * mesmo depois de confirmada). Reabrir descongela (volta a null em todo
   * item), e a próxima confirmação grava um snapshot novo.
   */
  alternarConfirmacao(): void {
    const confirmando = !this.cabecalho().isConfirmed;

    this.itens.update((lista) =>
      lista.map((item, i) => ({
        ...item,
        orcadoCongelado: confirmando ? this.orcadoAoVivoDoItem(i, item) : null,
      })),
    );

    this.cabecalho.update((c) => ({
      ...c,
      isConfirmed: confirmando,
      confirmedAt: confirmando ? new Date().toISOString() : '',
    }));
    this.salvar();
  }

  /** Orçado (custo direto + BDI) por categoria, calculado ao vivo — usado só para gravar o snapshot na confirmação. */
  private orcadoAoVivoDoItem(indice: number, item: ItemEap): PorTipo {
    const cache = this.cache();
    const totais = item.isGroup ? somarDescendentesDoGrupo(indice, this.itens(), cache) : null;

    return TIPOS_CUSTO.reduce((acc, t) => {
      acc[t.chave] = item.isGroup
        ? (totais!.directByType[t.chave] ?? 0) + (totais!.bdiByType[t.chave] ?? 0)
        : (cache.directByType[indice]?.[t.chave] ?? 0) + (cache.bdiByType[indice]?.[t.chave] ?? 0);
      return acc;
    }, criarVazioPorTipo());
  }

  // ------------------------------------------------------------------
  // Itens
  // ------------------------------------------------------------------
  /**
   * Insere um item. `posicao` permite inserir no meio da lista (usado
   * pelo atalho Shift + `+`, que insere logo abaixo da linha atual);
   * omitida, acrescenta ao final. Sempre entra como item comum — `isGroup`
   * é recalculado por `aplicarNumeracaoAutomatica` logo abaixo, então vira
   * "grupo" sozinho assim que algo for aninhado embaixo dele.
   */
  adicionarItem(posicao?: number): void {
    if (this.travada()) return;
    this.itens.update((lista) => {
      const novo: ItemEap = {
        id: gerarId(),
        isGroup: false,
        nivel: 0,
        eap: '',
        desc: '',
        qtde: 1,
        unid: '',
        unit: criarVazioPorTipo(),
        bdiMode: 'pct',
        bdiPercent: 0,
        bdiValue: 0,
        orcadoCongelado: null,
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
    if (this.travada()) return;
    this.itens.update((lista) =>
      aplicarNumeracaoAutomatica(
        lista.map((item) => (item.id === id ? { ...item, ...alteracao } : item)),
      ),
    );
    this.salvar();
  }

  atualizarCustoUnitario(id: string, tipo: ChaveTipo, valor: number): void {
    if (this.travada()) return;
    this.itens.update((lista) =>
      lista.map((item) =>
        item.id === id ? { ...item, unit: { ...item.unit, [tipo]: valor } } : item,
      ),
    );
    this.salvar();
  }

  removerItem(id: string): void {
    if (this.travada()) return;
    this.itens.update((lista) => aplicarNumeracaoAutomatica(lista.filter((i) => i.id !== id)));
    this.salvar();
  }

  /** Move uma linha; a renumeração da EAP acompanha a nova ordem. */
  moverItem(id: string, direcao: -1 | 1): void {
    if (this.travada()) return;
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
    if (this.travada()) return;
    this.itens.set([]);
    this.cabecalho.set(cabecalhoVazio());
    this.salvar();
  }

  /**
   * Importa itens vindos da planilha Excel (23/08/2026, ver
   * `eap-importar.ts::analisarPlanilha`) — `modo: 'adicionar'` acrescenta
   * ao final da lista atual; `'substituir'` troca tudo. Só um `salvar()`
   * no final, não um por item (`aplicarNumeracaoAutomatica` já resolve
   * nível/código/grupo pra lista inteira de uma vez, igual à digitação
   * manual).
   */
  importarItens(itensImportados: ItemEap[], modo: 'adicionar' | 'substituir'): void {
    if (this.travada()) return;
    this.itens.update((atual) => {
      const combinados = modo === 'substituir' ? itensImportados : [...atual, ...itensImportados];
      return aplicarNumeracaoAutomatica(combinados);
    });
    this.salvar();
  }

  /**
   * Copia a EAP de outra obra (23/08/2026, pedido do Lucas: "copiar EAP
   * de outra obra") — substitui todos os itens e a configuração de BDI
   * pelos da obra de origem. `headerOrigemBruto`/`itensOrigemBrutos` vêm
   * direto de `ApiService.obterEap(obraOrigemId)`, sem passar pelo store
   * da obra de origem (só precisamos ler os dados dela uma vez).
   *
   * Só copia BDI (é "dados da EAP" no sentido de orçamento) — os campos
   * de identidade da obra atual (nome, cliente, data base, responsável,
   * local, período, observações, confirmação) **não** são tocados, e os
   * itens ganham `id` novo (`normalizarItemEap` não reaproveita o `id` da
   * obra de origem — ver `gerarId()` ali dentro) e nascem sem Orçado
   * congelado, mesmo que a EAP de origem estivesse confirmada.
   */
  clonarDeOutraObra(headerOrigemBruto: Record<string, unknown>, itensOrigemBrutos: unknown[]): void {
    if (this.travada()) return;

    const headerOrigem = normalizarCabecalho(headerOrigemBruto);
    this.cabecalho.update((atual) => ({
      ...atual,
      bdiScope: headerOrigem.bdiScope,
      bdiMode: headerOrigem.bdiMode,
      bdiPercent: headerOrigem.bdiPercent,
      bdiValue: headerOrigem.bdiValue,
      bdiByType: headerOrigem.bdiByType,
    }));

    const itens = (Array.isArray(itensOrigemBrutos) ? itensOrigemBrutos : []).map((i) => ({
      ...normalizarItemEap(i as Record<string, unknown>),
      id: gerarId(),
      orcadoCongelado: null,
    }));
    this.itens.set(aplicarNumeracaoAutomatica(itens));

    this.salvar();
  }

  // ------------------------------------------------------------------
  totaisDoGrupo(indice: number) {
    return somarDescendentesDoGrupo(indice, this.itens(), this.cache());
  }
}
