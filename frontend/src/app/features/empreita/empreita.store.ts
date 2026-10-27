import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { catchError, concatMap, tap } from 'rxjs/operators';

import { ApiService } from '../../core/services/api.service';
import { hojeIso } from '../../core/utils/formato';
import { ChaveTipo, ItemEap } from '../eap/eap.models';
import { gerarId, normalizarItemEap } from '../eap/eap-normalize';
import {
  arredondarCentavos,
  gerarNumeroPagamento,
  normalizarPagamento,
  paraPayloadApi,
} from '../pagamentos/pagamentos-calc';
import { ItemPagamento, MedicaoSnapshotEmpreita, Pagamento } from '../pagamentos/pagamentos.models';
import {
  calcularJaPagoPorLinha,
  calcularLinhaEmpreita,
  calcularLinhaEmpreitaEstendida,
  calcularOrcadoDaEap,
  calcularQtdeDisponivelPorEap,
  calcularReservasSugeridas,
  calcularSaldoDisponivelPorEap,
  calcularTotaisEmpreita,
  calcularTotaisEmpreitaEstendida,
} from './empreita-engine';
import {
  CabecalhoEapSnapshot,
  CabecalhoEmpreita,
  ItemEmpreita,
  ResumoContratoEmpreita,
} from './empreita.models';

/**
 * Ids de tipos_custo (tabela seed, ver TiposCustoSeeder.php) — fixos,
 * usados só para traduzir o `tipo_custo_id` que o backend guarda de volta
 * pra chave (`ChaveTipo`) que a tela usa.
 */
const CHAVE_POR_ID: Record<number, ChaveTipo> = {
  1: 'material',
  2: 'maoDeObra',
  3: 'equipamento',
  4: 'outros',
  5: 'administracao',
};

/**
 * Exportado (03/09/2026) pra `EmpreitasObra` também poder montar
 * `ItemEmpreita[]` a partir da resposta bruta de `GET /empreitas/{id}` —
 * ela precisa do detalhe completo (id do item, rascunho de pagamento) pra
 * montar a mensagem de solicitação de pagamento de várias empreitas de
 * uma vez, e a lista lightweight (`GET /empreitas/resumo`) não traz esses
 * dois campos.
 */
export function normalizarItemEmpreita(bruto: Record<string, unknown>): ItemEmpreita {
  const qtdeContratada = bruto['qtde_contratada'];
  const emp = bruto['contrato_emp'];
  const reserva = bruto['contrato_reserva'];
  const medicaoAcum = bruto['medicao_acum'];
  const medicaoAtual = bruto['medicao_atual'];
  const pagamentoEmp = bruto['pagamento_emp'];
  const pagamentoReserva = bruto['pagamento_reserva'];

  return {
    id: bruto['id'] ? String(bruto['id']) : gerarId(),
    desc: String(bruto['descricao'] ?? ''),
    eapId: bruto['eap_item_id'] ? String(bruto['eap_item_id']) : '',
    tipo: CHAVE_POR_ID[Number(bruto['tipo_custo_id'])] ?? 'material',
    qtdeContratada: qtdeContratada === null || qtdeContratada === undefined ? null : Number(qtdeContratada) || 0,
    contratoEmp: Number(emp) || 0,
    contratoReserva: Number(reserva) || 0,
    medicaoAcum: Number(medicaoAcum) || 0,
    medicaoAtual: medicaoAtual === null || medicaoAtual === undefined ? null : Number(medicaoAtual) || 0,
    pagamentoEmp: pagamentoEmp === null || pagamentoEmp === undefined ? null : Number(pagamentoEmp) || 0,
    pagamentoReserva:
      pagamentoReserva === null || pagamentoReserva === undefined ? null : Number(pagamentoReserva) || 0,
  };
}

/**
 * Estado da Empreita.
 *
 * Até 31/07/2026 persistia na ponte chave-valor, uma empreita por obra.
 * Migrado para o endpoint relacional `/empreitas/{id}` porque uma obra
 * pode ter VÁRIAS empreitas (contratos com empreiteiros diferentes), não
 * só uma — cada empreita agora é seu próprio registro, criado pela lista
 * `EmpreitasObra`.
 *
 * Depende da EAP: é o orçado de cada item que entra como referência de
 * comparação (o contrato em si é lançado à mão — task #45). Por isso
 * carrega os dois — e o cabeçalho da EAP também, porque o BDI global
 * entra na composição do orçado.
 *
 * 25/08/2026 (redesign): também carrega o contrato das empreitas-irmãs da
 * mesma obra (`siblingsResumo`, pro Saldo disp.) e os pagamentos já
 * gerados por esta empreita (`pagamentosDaEmpreita`, pro Já pago/
 * Divergência e pro relatório "Pagamentos registrados").
 */
@Injectable()
export class EmpreitaStore {
  private readonly api = inject(ApiService);

  /** Id da empreita atual — definido por `carregar()`, usado em toda gravação. */
  private empreitaId = '';
  /** Id da obra dona da empreita — usado por `gerarPagamento()` e pra carregar empreitas-irmãs/pagamentos. */
  private obraIdAtual = '';
  /** `created_at` da empreita atual, ISO — usado por `calcularSaldoDisponivelPorEap` pra decidir quem "chegou antes". */
  private criadoEmAtual = '';

  /**
   * Fila de gravações (31/08/2026, investigação do Lucas: "quando preencho
   * rápido o sistema não capta o campo anterior, meio que reseta") — mesmo
   * problema e mesma solução de `MapaStore`: sem sequenciar, duas edições
   * próximas no tempo geram dois PUTs concorrentes, e se o servidor
   * responder fora de ordem o mais antigo (com um snapshot desatualizado)
   * pode chegar por último e regravar por cima de uma edição mais nova.
   * `concatMap` garante que cada PUT só começa depois do anterior
   * terminar, e como cada execução lê o estado atual dos signals no
   * momento em que roda (não no momento em que foi enfileirada), o último
   * PUT da fila sempre carrega o estado mais recente de verdade.
   */
  private readonly salvarSubject = new Subject<void>();
  private readonly salvar$ = this.salvarSubject.pipe(
    concatMap(() => this.executarSalvar().pipe(catchError(() => of(null)))),
  );

  constructor() {
    this.salvar$.subscribe();
  }

  readonly cabecalho = signal<CabecalhoEmpreita>({
    numeroEmpreita: '',
    descricaoEmpreita: '',
    obraNumber: '',
    empreiteiro: '',
    data: '',
    previsaoConclusao: '',
    isConfirmed: false,
    confirmedAt: '',
    pagamentoIniciado: false,
    pagamentoIniciadoAt: '',
    medicaoHabilitada: true,
    contratoAssinado: false,
    contratoAssinadoEm: '',
  });

  /**
   * Empreita confirmada — mesmo padrão da EAP (25/08/2026, pedido do
   * Lucas): enquanto em edição, cabeçalho e serviços (desc/tipo/etapa/
   * contrato/quantidade) ficam livres; confirmando, tudo isso trava.
   * Única saída do travamento é `alternarConfirmacao()` de novo (reabrir).
   */
  readonly travada = computed(() => this.cabecalho().isConfirmed);

  /**
   * "Realizar pagamento" (03/09/2026, pedido do Lucas) — separado de
   * `travada()`: confirmar só trava o contrato; é este passo à parte que
   * libera a tabela de Medição/Já pago/Pagamento/Saldo após pagamento e
   * os botões "Fechar período"/"Resetar". Só liga com a empreita
   * confirmada (`iniciarPagamento()` abaixo) e reseta sozinho ao reabrir
   * (`alternarConfirmacao()`).
   */
  readonly pagamentoIniciado = computed(() => this.cabecalho().pagamentoIniciado);

  /**
   * Qual dos 2 botões — "Realizar medição"/"Realizar pagamento" — está
   * habilitado agora (03/09/2026) — ver `CabecalhoEmpreita.medicaoHabilitada`.
   */
  readonly medicaoHabilitada = computed(() => this.cabecalho().medicaoHabilitada);

  readonly itens = signal<ItemEmpreita[]>([]);
  readonly itensEap = signal<ItemEap[]>([]);
  readonly cabecalhoEap = signal<CabecalhoEapSnapshot | null>(null);

  readonly carregando = signal(true);

  /**
   * Quantas gravações estão pendentes na fila (enfileiradas + a que está
   * em voo agora) — não só "a última está em andamento". Mesmo ajuste de
   * `MapaStore.pendentes` (31/08/2026): editar vários itens em sequência
   * (cada edição é uma gravação própria) fazia `salvando` virar `false`
   * assim que UM PUT terminava, mesmo com outros ainda esperando a vez no
   * `concatMap` — dava a falsa impressão de que já era seguro sair da
   * página antes de tudo ter sido gravado de verdade.
   */
  private readonly pendentes = signal(0);
  readonly salvando = computed(() => this.pendentes() > 0);

  readonly erro = signal<string | null>(null);

  readonly gerandoPagamento = signal(false);
  readonly resultadoGerarPagamento = signal<string | null>(null);

  /** Orçado da EAP por id, com BDI distribuído — a base de tudo. */
  readonly orcado = computed(() => calcularOrcadoDaEap(this.itensEap(), this.cabecalhoEap()));

  readonly linhas = computed(() => this.itens().map((item) => calcularLinhaEmpreita(item, this.orcado())));

  readonly totais = computed(() => calcularTotaisEmpreita(this.itens(), this.orcado()));

  /** Alguma linha com medição retrocedendo — bloqueia o fechamento. */
  readonly temMedicaoInvalida = computed(() => this.linhas().some((l) => l.reducaoInvalida));

  /** Itens da EAP que podem ser vinculados (com descrição). */
  readonly opcoesEap = computed(() => this.itensEap().filter((i) => i.eap || i.desc));

  // ------------------------------------------------------------------
  // Redesign 25/08/2026 — saldo comprometido entre empreitas, Já pago/
  // Divergência acumulados, rascunho de Pagamento, Saldo após pagamento.
  // ------------------------------------------------------------------

  /** Contrato de toda empreita da mesma obra (inclusive esta) — só pro cálculo do Saldo disp. */
  readonly siblingsResumo = signal<ResumoContratoEmpreita[]>([]);

  /** Todo pagamento já gerado por ESTA empreita, confirmado ou pendente. */
  readonly pagamentosDaEmpreita = signal<Pagamento[]>([]);

  /** Só os confirmados — pendente ainda não é dinheiro de verdade (mesma regra do resto do sistema). */
  readonly pagamentosConfirmadosDaEmpreita = computed(() =>
    this.pagamentosDaEmpreita().filter((p) => p.status !== 'pendente'),
  );

  readonly saldoDispPorEap = computed(() =>
    calcularSaldoDisponivelPorEap(
      this.itensEap(),
      this.cabecalhoEap(),
      this.siblingsResumo(),
      this.empreitaId,
      this.criadoEmAtual,
    ),
  );

  /** Qtde. disp. — mesma ideia do Saldo disp., mas em quantidade física (só relevante em edição, ver `empreita.html`). */
  readonly qtdeDispPorEap = computed(() =>
    calcularQtdeDisponivelPorEap(this.itensEap(), this.siblingsResumo(), this.empreitaId, this.criadoEmAtual),
  );

  readonly jaPagoPorItem = computed(() => calcularJaPagoPorLinha(this.pagamentosConfirmadosDaEmpreita()));

  readonly linhasEstendidas = computed(() =>
    this.itens().map((item) =>
      calcularLinhaEmpreitaEstendida(
        item,
        this.orcado(),
        this.saldoDispPorEap(),
        this.qtdeDispPorEap(),
        this.jaPagoPorItem(),
      ),
    ),
  );

  readonly totaisEstendidos = computed(() =>
    calcularTotaisEmpreitaEstendida(
      this.itens(),
      this.orcado(),
      this.saldoDispPorEap(),
      this.qtdeDispPorEap(),
      this.jaPagoPorItem(),
    ),
  );

  // ------------------------------------------------------------------
  /**
   * `empreitaId` é o id do registro em `/empreitas`; `obraId` continua
   * sendo necessário só para buscar a EAP de referência (a empreita já
   * carrega o seu próprio `obra_id`, mas o parâmetro de rota é mais
   * direto e sempre disponível).
   */
  carregar(empreitaId: string, obraId: string): void {
    this.empreitaId = empreitaId;
    this.obraIdAtual = obraId;
    this.carregando.set(true);
    this.erro.set(null);

    this.api.obterEmpreita(empreitaId).subscribe({
      next: (empreita) => {
        this.aplicar(empreita as Record<string, unknown>);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar a empreita.');
        this.carregando.set(false);
      },
    });

    this.carregarEap(obraId);
    this.carregarSiblingsResumo(obraId);
    this.carregarPagamentos(obraId, empreitaId);
  }

  /**
   * A EAP entra como referência. Falha ao carregá-la não derruba a tela:
   * sem orçado, a distribuição entre categorias passa a ser igualitária,
   * que é o comportamento previsto na engine.
   */
  private carregarEap(obraId: string): void {
    this.api.obterEap(obraId).subscribe({
      next: (payload) => {
        const brutos = payload.eapItems;
        if (Array.isArray(brutos)) {
          this.itensEap.set(brutos.map((i) => normalizarItemEap(i as Record<string, unknown>)));
        }

        const cabecalho = payload.header ?? {};
        this.cabecalhoEap.set({
          mapNumber: String(cabecalho['mapNumber'] ?? ''),
          bdiMode: cabecalho['bdiMode'] === 'value' ? 'value' : 'pct',
          bdiPercent: Number(cabecalho['bdiPercent']) || 0,
          bdiValue: Number(cabecalho['bdiValue']) || 0,
        });
      },
      error: () => undefined,
    });
  }

  /**
   * Contrato de toda empreita-irmã da mesma obra — falha silenciosa (fica
   * `[]`), mesmo espírito de `carregarEap`: sem essa lista o Saldo disp.
   * degrada pra "orçado inteiro disponível" (nenhuma empreita anterior
   * descontada) em vez de derrubar a tela.
   */
  private carregarSiblingsResumo(obraId: string): void {
    this.api.obterResumoContratoEmpreitas(obraId).subscribe({
      next: (resumo) => this.siblingsResumo.set(resumo ?? []),
      error: () => undefined,
    });
  }

  /** Pagamentos já gerados por esta empreita — Já pago/Divergência e o relatório "Pagamentos registrados". */
  private carregarPagamentos(obraId: string, empreitaId: string): void {
    this.api.listarPagamentos({ obraId, origemTipo: 'empreita', origemRefId: empreitaId }).subscribe({
      next: (brutos) => {
        this.pagamentosDaEmpreita.set(brutos.map((p) => normalizarPagamento(p as Record<string, unknown>)));
      },
      error: () => undefined,
    });
  }

  private aplicar(empreita: Record<string, unknown>): void {
    // `created_at` do próprio registro — precisa pra decidir, no cálculo
    // do Saldo disp., quais empreitas-irmãs "chegaram antes" desta.
    this.criadoEmAtual = String(empreita['created_at'] ?? '');

    this.cabecalho.set({
      numeroEmpreita: String(empreita['numero_empreita'] ?? ''),
      descricaoEmpreita: String(empreita['descricao_empreita'] ?? ''),
      obraNumber: String(empreita['obra_number'] ?? ''),
      empreiteiro: String(empreita['empreiteiro'] ?? ''),
      data: String(empreita['medicao_date'] ?? '').slice(0, 10),
      previsaoConclusao: String(empreita['previsao_conclusao'] ?? '').slice(0, 10),
      isConfirmed: Boolean(empreita['is_confirmed']),
      confirmedAt: String(empreita['confirmed_at'] ?? ''),
      pagamentoIniciado: Boolean(empreita['pagamento_iniciado']),
      pagamentoIniciadoAt: String(empreita['pagamento_iniciado_at'] ?? ''),
      // `!== false` (não `Boolean(...)`): ausente/undefined tem que virar
      // `true` (o padrão), não `false` — mesma convenção de `ativo` nos
      // cadastros.
      medicaoHabilitada: empreita['medicao_habilitada'] !== false,
      contratoAssinado: Boolean(empreita['contrato_assinado']),
      contratoAssinadoEm: String(empreita['contrato_assinado_em'] ?? ''),
    });

    const itensBrutos = Array.isArray(empreita['itens'])
      ? (empreita['itens'] as Record<string, unknown>[])
      : [];
    this.itens.set(itensBrutos.map((i) => this.normalizarItem(i)));
  }

  private normalizarItem(bruto: Record<string, unknown>): ItemEmpreita {
    return normalizarItemEmpreita(bruto);
  }

  salvar(): void {
    if (!this.empreitaId) return;
    this.pendentes.update((n) => n + 1);
    this.salvarSubject.next();
  }

  /**
   * Execução de fato do PUT — sempre lê o estado mais atual dos signals
   * (ver comentário de `salvarSubject` acima). Não reaplica a resposta do
   * servidor sobre `itens`/`cabecalho`: é sempre um eco do que acabou de
   * ser enviado (nenhum campo é computado só no backend), e reaplicar
   * sobrescreveria uma edição feita DEPOIS deste PUT ter partido mas ANTES
   * dele responder — exatamente o bug do "campo reseta" ao digitar rápido.
   * Mesmo padrão (não reaplicar) que `EapStore.salvar()`/`MedicaoStore` já
   * usavam sem esse problema.
   */
  private executarSalvar() {
    const cabecalho = this.cabecalho();

    const payload = {
      numero_empreita: cabecalho.numeroEmpreita,
      descricao_empreita: cabecalho.descricaoEmpreita,
      obra_number: cabecalho.obraNumber,
      empreiteiro: cabecalho.empreiteiro,
      medicao_date: cabecalho.data || null,
      previsao_conclusao: cabecalho.previsaoConclusao || null,
      is_confirmed: cabecalho.isConfirmed,
      confirmed_at: cabecalho.confirmedAt || null,
      pagamento_iniciado: cabecalho.pagamentoIniciado,
      pagamento_iniciado_at: cabecalho.pagamentoIniciadoAt || null,
      medicao_habilitada: cabecalho.medicaoHabilitada,
      itens: this.itens().map((item) => ({
        id: item.id,
        desc: item.desc,
        eapId: item.eapId || null,
        tipo: item.tipo,
        qtdeContratada: item.qtdeContratada,
        contratoEmp: item.contratoEmp,
        contratoReserva: item.contratoReserva,
        medicaoAcum: item.medicaoAcum,
        medicaoAtual: item.medicaoAtual,
        pagamentoEmp: item.pagamentoEmp,
        pagamentoReserva: item.pagamentoReserva,
      })),
    };

    return this.api.atualizarEmpreita(this.empreitaId, payload).pipe(
      tap({
        next: () => this.pendentes.update((n) => Math.max(0, n - 1)),
        error: () => this.pendentes.update((n) => Math.max(0, n - 1)),
      }),
    );
  }

  // ------------------------------------------------------------------
  /**
   * Descrição/Empreiteiro/Data — trava na confirmação (03/09/2026,
   * pedido do Lucas). `numeroEmpreita`/`obraNumber` não passam mais por
   * aqui (viraram somente leitura na tela, gerados pelo backend na
   * criação — ver `EmpreitaController::syncCompleto`), então travar os 3
   * campos que sobraram cobre o cabeçalho inteiro.
   */
  atualizarCabecalho<K extends keyof CabecalhoEmpreita>(
    campo: K,
    valor: CabecalhoEmpreita[K],
  ): void {
    if (this.travada()) return;
    this.cabecalho.update((c) => ({ ...c, [campo]: valor }));
    this.salvar();
  }

  /**
   * Confirma a empreita (ou reabre) — mesmo padrão da EAP
   * (`EapStore.alternarConfirmacao`). Confirmar trava cabeçalho/serviços/
   * Contrato/Qtde. contratada e bloqueia adicionar serviço. Reabrir
   * (03/09/2026, pedido do Lucas) também zera `pagamentoIniciado` — a
   * tela de Medição/Já pago/Pagamento/Saldo após pagamento só volta a
   * aparecer depois de confirmar de novo E clicar "Realizar pagamento".
   */
  alternarConfirmacao(): void {
    const confirmando = !this.cabecalho().isConfirmed;
    this.cabecalho.update((c) => ({
      ...c,
      isConfirmed: confirmando,
      confirmedAt: confirmando ? new Date().toISOString() : '',
      ...(confirmando
        ? null
        : { pagamentoIniciado: false, pagamentoIniciadoAt: '', medicaoHabilitada: true }),
    }));
    this.salvar();
  }

  /**
   * Alterna qual dos 2 botões — "Realizar medição"/"Realizar pagamento"
   * — está habilitado (03/09/2026, pedido do Lucas: "pode fazer
   * persistir"). `empreita.ts` chama isso nos dois cliques (valor `false`
   * ao clicar "Realizar medição", `true` de volta quando "Realizar
   * pagamento" termina com sucesso).
   */
  definirMedicaoHabilitada(valor: boolean): void {
    this.cabecalho.update((c) => ({ ...c, medicaoHabilitada: valor }));
    this.salvar();
  }

  /**
   * "Realizar pagamento" (03/09/2026, pedido do Lucas) — só liga com a
   * empreita confirmada; troca o layout da tabela pra Medição/Já pago/
   * Pagamento/Saldo após pagamento e libera "Fechar período"/"Resetar".
   * Sem "voltar atrás" própria: a única forma de desligar é reabrir a
   * empreita (`alternarConfirmacao`), que já reseta este campo junto.
   */
  iniciarPagamento(): void {
    if (!this.travada() || this.pagamentoIniciado()) return;
    this.cabecalho.update((c) => ({
      ...c,
      pagamentoIniciado: true,
      pagamentoIniciadoAt: new Date().toISOString(),
    }));
    this.salvar();
  }

  /**
   * "Contrato assinado" (27/09/2026, pedido do Lucas) — fora do fluxo normal
   * de `salvar()`/`executarSalvar()` de propósito: tem endpoint próprio no
   * backend porque marcar/desmarcar cria ou apaga o lembrete de assinatura
   * pendente na Agenda (side-effect que não cabe no PUT genérico do resto
   * do cabeçalho).
   */
  alternarContratoAssinado(assinado: boolean): void {
    if (!this.empreitaId) return;
    this.api.marcarContratoAssinadoEmpreita(this.empreitaId, assinado).subscribe({
      next: (empreita) =>
        this.cabecalho.update((c) => ({
          ...c,
          contratoAssinado: Boolean(empreita['contrato_assinado']),
          contratoAssinadoEm: String(empreita['contrato_assinado_em'] ?? ''),
        })),
      error: () => window.alert('Não foi possível atualizar o status do contrato.'),
    });
  }

  /** Acrescenta um serviço ao final ou, com `posicao`, no meio da lista (botão "+" da linha e Ctrl + Enter). */
  adicionarItem(posicao?: number): void {
    if (this.travada()) return;
    this.itens.update((lista) => {
      const novo: ItemEmpreita = {
        id: gerarId(),
        desc: '',
        eapId: '',
        // Padrão do serviço novo é Mão de obra (pedido do Lucas, 25/09/2026)
        // — a empreita é, na prática, contratação de mão de obra.
        tipo: 'maoDeObra',
        qtdeContratada: null,
        contratoEmp: null,
        contratoReserva: null,
        medicaoAcum: null,
        medicaoAtual: null,
        pagamentoEmp: null,
        pagamentoReserva: null,
      };
      const destino = posicao === undefined || posicao < 0 || posicao > lista.length ? lista.length : posicao;
      const copia = [...lista];
      copia.splice(destino, 0, novo);
      return copia;
    });
    this.salvar();
  }

  /** Sobe (-1) ou desce (1) um serviço — mesmo padrão de `MapaStore.moverItem` (21/09/2026). */
  moverItem(id: string, direcao: -1 | 1): void {
    this.moverVarios([id], direcao);
  }

  /**
   * Move vários serviços de uma vez, uma posição: cada marcado troca de lugar
   * com a vizinha NÃO marcada, então um bloco anda junto e a ordem entre os
   * marcados é preservada.
   */
  moverVarios(ids: readonly string[], direcao: -1 | 1): void {
    if (this.travada() || !ids.length) return;
    const marcados = new Set(ids);
    this.itens.update((lista) => {
      const copia = [...lista];
      if (direcao < 0) {
        for (let i = 1; i < copia.length; i++) {
          if (marcados.has(copia[i].id) && !marcados.has(copia[i - 1].id)) [copia[i - 1], copia[i]] = [copia[i], copia[i - 1]];
        }
      } else {
        for (let i = copia.length - 2; i >= 0; i--) {
          if (marcados.has(copia[i].id) && !marcados.has(copia[i + 1].id)) [copia[i + 1], copia[i]] = [copia[i], copia[i + 1]];
        }
      }
      return copia;
    });
    this.salvar();
  }

  /** Desc/Tipo/Etapa(EAP) do serviço — trava na confirmação (03/09/2026, pedido do Lucas). */
  atualizarItem(id: string, alteracao: Partial<ItemEmpreita>): void {
    if (this.travada()) return;
    this.itens.update((lista) => lista.map((i) => (i.id === id ? { ...i, ...alteracao } : i)));
    this.salvar();
  }

  /**
   * "Realizar medição" (26/09/2026, pedido do Lucas): a medição atual de cada serviço nasce IGUAL à
   * acumulada — só se o usuário ainda não digitou nada —, pra evitar regressos de medição sem querer.
   */
  preencherMedicaoAtualComAcumulada(): void {
    this.itens.update((lista) =>
      lista.map((item) =>
        item.medicaoAtual === null || item.medicaoAtual === undefined
          ? { ...item, medicaoAtual: Number(item.medicaoAcum) || 0 }
          : item,
      ),
    );
    this.salvar();
  }

  /** Relê os pagamentos desta empreita (usado depois de editar/apagar medições no popup de Pagamentos registrados). */
  recarregarPagamentos(): void {
    this.carregarPagamentos(this.obraIdAtual, this.empreitaId);
  }

  /**
   * Editar/apagar uma medição antiga desloca o acumulado ATUAL de cada serviço (26/09/2026): soma o
   * deslocamento em `medicaoAcum` e, quando há uma medição em andamento, também em `medicaoAtual`
   * (o avanço em andamento é preservado). O pré-preenchimento do pagamento em andamento é refeito.
   */
  aplicarDeslocamentoDeMedicao(deslocamentos: Map<string, number>): void {
    if (!deslocamentos.size) return;
    const limitar = (v: number) => Math.min(100, Math.max(0, Math.round(v * 1e6) / 1e6));
    this.itens.update((lista) =>
      lista.map((item) => {
        const delta = deslocamentos.get(item.id);
        if (!delta) return item;
        return {
          ...item,
          medicaoAcum: limitar((Number(item.medicaoAcum) || 0) + delta),
          medicaoAtual:
            item.medicaoAtual === null || item.medicaoAtual === undefined ? null : limitar(Number(item.medicaoAtual) + delta),
          pagamentoEmp: null,
          pagamentoReserva: null,
        };
      }),
    );
    this.salvar();
  }

  /**
   * Só "Atual" — "Acumulado" é preenchido pelo sistema em `avancarPeriodo()`, nunca pelo usuário.
   * Mudar a medição atual refaz o pré-preenchimento do Pagamento (empreiteiro e reserva): os valores
   * digitados à mão para este serviço são descartados (26/09/2026, pedido do Lucas).
   */
  atualizarMedicao(id: string, campo: 'medicaoAtual', valor: number | null): void {
    this.itens.update((lista) =>
      lista.map((item) =>
        item.id === id ? { ...item, [campo]: valor, pagamentoEmp: null, pagamentoReserva: null } : item,
      ),
    );
    this.salvar();
  }

  /** Lança o contrato (empreita ou reserva), à mão — travado depois de confirmada. */
  atualizarContrato(id: string, campo: 'contratoEmp' | 'contratoReserva', valor: number | null): void {
    if (this.travada()) return;
    this.itens.update((lista) => lista.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)));
    this.salvar();
  }

  /**
   * "Lançar reservas": preenche a reserva dos serviços que estão com ela vazia
   * (regra em `calcularReservasSugeridas`). Devolve quantos serviços receberam
   * reserva; não mexe no que já foi digitado.
   */
  lancarReservas(): number {
    if (this.travada()) return 0;
    const sugeridas = calcularReservasSugeridas(this.itens(), this.saldoDispPorEap());
    if (!sugeridas.size) return 0;
    this.itens.update((lista) =>
      lista.map((item) => (sugeridas.has(item.id) ? { ...item, contratoReserva: sugeridas.get(item.id)! } : item)),
    );
    this.salvar();
    return sugeridas.size;
  }

  /** Quantidade contratada, na unidade da EAP — travada depois de confirmada. */
  atualizarQtdeContratada(id: string, valor: number | null): void {
    if (this.travada()) return;
    this.itens.update((lista) => lista.map((item) => (item.id === id ? { ...item, qtdeContratada: valor } : item)));
    this.salvar();
  }

  /**
   * Rascunho do "Pagamento" do período atual — pré-preenchido pelo
   * calculado (`pagar`/`reservar`), mas o Lucas pode digitar um valor
   * menor (fica a diferença como Divergência quando o pagamento for
   * gerado) ou maior. `null` volta a herdar o calculado.
   */
  atualizarPagamentoDraft(id: string, campo: 'pagamentoEmp' | 'pagamentoReserva', valor: number | null): void {
    this.itens.update((lista) => lista.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)));
    this.salvar();
  }

  /** Remove várias linhas de uma vez (seleção em lote, 20/09/2026) — uma gravação só. */
  removerVarios(ids: readonly string[]): void {
    if (this.travada() || !ids.length) return;
    const alvo = new Set(ids);
    this.itens.update((lista) => lista.filter((i) => !alvo.has(i.id)));
    this.salvar();
  }

  removerItem(id: string): void {
    if (this.travada()) return;
    this.itens.update((lista) => lista.filter((i) => i.id !== id));
    this.salvar();
  }

  /**
   * Fecha o período (25/08/2026, pedido do Lucas: "apagar o botão gerar
   * pagamento, o pagamento deve ser gerado automaticamente ao finalizar
   * um período") — o que antes eram duas ações separadas ("Gerar
   * pagamento" + "Fechar período", nessa ordem obrigatória) virou uma só:
   * gera o pagamento pendente do rascunho atual e, só depois de gravar
   * com sucesso, avança o período (medição atual vira o novo acumulado, e
   * o rascunho de Pagamento é zerado pro próximo ciclo). Se não houver
   * nada no rascunho pra pagar, avança direto, sem gerar pagamento vazio.
   * Se a gravação do pagamento falhar, o período NÃO avança — evita
   * perder o avanço medido sem deixar rastro do pagamento correspondente.
   */
  /**
   * `onSucesso` (03/09/2026, pedido do Lucas) — chamado só quando o
   * período REALMENTE avança (`avancarPeriodo()` roda), nunca nos casos
   * de erro. `empreita.ts` usa isso pra virar de volta o par de botões
   * "Realizar medição"/"Realizar pagamento" pro estado inicial, pronto
   * pro próximo ciclo.
   */
  fecharPeriodo(onSucesso?: () => void): void {
    if (!this.empreitaId || !this.obraIdAtual) return;

    const obraId = this.obraIdAtual;
    this.gerandoPagamento.set(true);
    this.resultadoGerarPagamento.set(null);

    this.api.listarPagamentos({ obraId }).subscribe({
      next: (brutos) => {
        const existentes = brutos.map((p) => normalizarPagamento(p as Record<string, unknown>));
        const novo = this.montarPagamentoDoAvanco(existentes);

        if (!novo) {
          this.gerandoPagamento.set(false);
          this.avancarPeriodo();
          onSucesso?.();
          return;
        }

        this.api.criarPagamento(paraPayloadApi(novo, obraId)).subscribe({
          next: () => {
            this.gerandoPagamento.set(false);
            this.resultadoGerarPagamento.set(
              'Pagamento gerado — confira em "Pagamentos registrados" ou na aba Pagamentos da obra.',
            );
            this.carregarPagamentos(obraId, this.empreitaId);
            this.avancarPeriodo();
            onSucesso?.();
          },
          error: () => {
            this.gerandoPagamento.set(false);
            this.resultadoGerarPagamento.set('Não foi possível gravar o pagamento — período não fechado.');
          },
        });
      },
      error: () => {
        this.gerandoPagamento.set(false);
        this.resultadoGerarPagamento.set(
          'Não foi possível ler os pagamentos existentes desta obra — período não fechado.',
        );
      },
    });
  }

  /**
   * "Resetar" (31/08/2026, pedido do Lucas) — zera o % acumulado de TODOS
   * os serviços da empreita, junto com o rascunho de medição/pagamento do
   * período atual (mesma limpeza de `avancarPeriodo()`, só que o acumulado
   * volta a zero em vez de herdar o medido). Não mexe em pagamentos já
   * gerados/confirmados na aba Pagamentos — só na contagem de % medido
   * daqui pra frente, pra empreiteiro que precisa recomeçar a medição
   * (ex.: contrato remedido, erro de lançamento acumulado ao longo de
   * vários períodos).
   */
  resetarAcumulado(): void {
    this.itens.update((lista) =>
      lista.map((item) => ({
        ...item,
        medicaoAcum: 0,
        medicaoAtual: null,
        pagamentoEmp: null,
        pagamentoReserva: null,
      })),
    );
    this.salvar();
  }

  /** A medição atual vira o novo acumulado, e os rascunhos de medição/pagamento zeram pro próximo ciclo. */
  private avancarPeriodo(): void {
    this.itens.update((lista) =>
      lista.map((item) => {
        const atual = item.medicaoAtual;
        const novoAcumulado = atual !== null && atual !== undefined ? atual : item.medicaoAcum;
        return { ...item, medicaoAcum: novoAcumulado, medicaoAtual: null, pagamentoEmp: null, pagamentoReserva: null };
      }),
    );
    this.salvar();
  }

  /** Um item Empreiteiro + um item Reserva por serviço, pro valor efetivo do rascunho (calculado ou sobrescrito). */
  private montarPagamentoDoAvanco(numerosEmUso: Pagamento[]): Pagamento | null {
    const cabecalho = this.cabecalho();

    const itensPagamento: ItemPagamento[] = [];
    let valorTotal = 0;

    const itens = this.itens();
    const linhas = this.linhasEstendidas();

    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const linha = linhas[i];

      // Centavos (21/10/2026): cada item é arredondado ANTES de entrar na soma — o banco guarda cada
      // valor com 2 casas, e somar valores quebrados deixava o total diferente da soma dos itens.
      const emp = arredondarCentavos(linha.pagamentoEmpDraft);
      const reserva = arredondarCentavos(linha.pagamentoReservaDraft);

      if (emp > 0) {
        itensPagamento.push({
          id: gerarId(),
          descricao: item.desc || 'Serviço',
          tipo: item.tipo,
          eapId: item.eapId || '',
          valor: emp,
          modoValor: 'valor',
          parcela: 'empreiteiro',
          empreitaItemId: item.id,
          valorReferencia: Number(linha.pagamentoEmpDraft) || 0,
        });
        valorTotal += emp;
      }
      if (reserva > 0) {
        itensPagamento.push({
          id: gerarId(),
          descricao: item.desc || 'Serviço',
          tipo: item.tipo,
          eapId: item.eapId || '',
          valor: reserva,
          modoValor: 'valor',
          parcela: 'reserva',
          empreitaItemId: item.id,
          valorReferencia: Number(linha.pagamentoReservaDraft) || 0,
        });
        valorTotal += reserva;
      }
    }

    if (!itensPagamento.length) return null;

    // O total deve ser o valor REAL a pagar (soma dos valores originais, arredondada uma vez) e a soma dos
    // itens arredondados precisa fechar com ele: a sobra de centavos vai para o maior item. Sem isso, três
    // itens de 333,3333 virariam 999,99 em vez de 1.000,00.
    const totalReal = arredondarCentavos(
      itensPagamento.reduce((soma, i) => soma + (Number(i.valorReferencia) || 0), 0),
    );
    const sobra = arredondarCentavos(totalReal - itensPagamento.reduce((soma, i) => soma + i.valor, 0));
    if (sobra !== 0) {
      const maior = itensPagamento.reduce((a, b) => (b.valor > a.valor ? b : a));
      maior.valor = arredondarCentavos(maior.valor + sobra);
    }
    valorTotal = totalReal;

    const descricaoBase = [cabecalho.numeroEmpreita, cabecalho.descricaoEmpreita]
      .filter(Boolean)
      .join(' — ');

    return {
      id: gerarId(),
      numeroPagamento: gerarNumeroPagamento(numerosEmUso),
      obraNumber: cabecalho.obraNumber,
      dataSolicitacao: hojeIso(),
      dataPagamento: '',
      fornecedor: cabecalho.empreiteiro || 'Profissional',
      descricao: descricaoBase || 'Medição de empreita',
      valorTotal,
      itens: itensPagamento,
      origem: { tipo: 'empreita', refId: this.empreitaId },
      status: 'pendente',
      medicaoSnapshot: this.montarMedicaoSnapshot(itens),
    };
  }

  /**
   * "Guardar as medições" (03/09/2026, pedido do Lucas) — retrato de
   * TODOS os serviços da empreita (não só os com avanço a pagar neste
   * ciclo) no exato momento em que "Fechar período" gera o pagamento,
   * antes de `avancarPeriodo()` zerar os rascunhos. `contratoTotalEmpreita`
   * é gravado à parte porque o contrato pode crescer/diminuir depois
   * deste pagamento — a popup de retrato precisa mostrar o total de
   * ENTÃO, não o de agora.
   */
  private montarMedicaoSnapshot(itens: ItemEmpreita[]): MedicaoSnapshotEmpreita {
    return {
      contratoTotalEmpreita: this.totais().valorTotal,
      itens: itens.map((item) => ({
        empreitaItemId: item.id,
        desc: item.desc,
        tipo: item.tipo,
        eapId: item.eapId || '',
        medicaoAcum: Number(item.medicaoAcum) || 0,
        medicaoAtual:
          item.medicaoAtual === null || item.medicaoAtual === undefined
            ? Number(item.medicaoAcum) || 0
            : Number(item.medicaoAtual),
        contratoEmp: Number(item.contratoEmp) || 0,
        contratoReserva: Number(item.contratoReserva) || 0,
      })),
    };
  }
}
