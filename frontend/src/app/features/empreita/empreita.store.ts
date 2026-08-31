import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { hojeIso } from '../../core/utils/formato';
import { ChaveTipo, ItemEap } from '../eap/eap.models';
import { gerarId, normalizarItemEap } from '../eap/eap-normalize';
import {
  gerarNumeroPagamento,
  normalizarPagamento,
  paraPayloadApi,
} from '../pagamentos/pagamentos-calc';
import { ItemPagamento, Pagamento } from '../pagamentos/pagamentos.models';
import {
  calcularJaPagoPorLinha,
  calcularLinhaEmpreita,
  calcularLinhaEmpreitaEstendida,
  calcularOrcadoDaEap,
  calcularQtdeDisponivelPorEap,
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

  readonly cabecalho = signal<CabecalhoEmpreita>({
    numeroEmpreita: '',
    descricaoEmpreita: '',
    obraNumber: '',
    empreiteiro: '',
    data: '',
    isConfirmed: false,
    confirmedAt: '',
  });

  /**
   * Empreita confirmada — mesmo padrão da EAP (25/08/2026, pedido do
   * Lucas): enquanto em edição, só Contrato e Quantidade contratada são
   * lançados, e serviços podem ser adicionados; confirmando, esses campos
   * travam e a medição/pagamento é liberada. Única saída do travamento é
   * `alternarConfirmacao()` de novo (reabrir).
   */
  readonly travada = computed(() => this.cabecalho().isConfirmed);

  readonly itens = signal<ItemEmpreita[]>([]);
  readonly itensEap = signal<ItemEap[]>([]);
  readonly cabecalhoEap = signal<CabecalhoEapSnapshot | null>(null);

  readonly carregando = signal(true);
  readonly salvando = signal(false);
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
      isConfirmed: Boolean(empreita['is_confirmed']),
      confirmedAt: String(empreita['confirmed_at'] ?? ''),
    });

    const itensBrutos = Array.isArray(empreita['itens'])
      ? (empreita['itens'] as Record<string, unknown>[])
      : [];
    this.itens.set(itensBrutos.map((i) => this.normalizarItem(i)));
  }

  private normalizarItem(bruto: Record<string, unknown>): ItemEmpreita {
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

  salvar(): void {
    if (!this.empreitaId) return;
    this.salvando.set(true);

    const cabecalho = this.cabecalho();

    const payload = {
      numero_empreita: cabecalho.numeroEmpreita,
      descricao_empreita: cabecalho.descricaoEmpreita,
      obra_number: cabecalho.obraNumber,
      empreiteiro: cabecalho.empreiteiro,
      medicao_date: cabecalho.data || null,
      is_confirmed: cabecalho.isConfirmed,
      confirmed_at: cabecalho.confirmedAt || null,
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

    this.api.atualizarEmpreita(this.empreitaId, payload).subscribe({
      next: (empreita) => {
        this.aplicar(empreita as Record<string, unknown>);
        this.salvando.set(false);
      },
      error: () => this.salvando.set(false),
    });
  }

  // ------------------------------------------------------------------
  atualizarCabecalho<K extends keyof CabecalhoEmpreita>(
    campo: K,
    valor: CabecalhoEmpreita[K],
  ): void {
    this.cabecalho.update((c) => ({ ...c, [campo]: valor }));
    this.salvar();
  }

  /**
   * Confirma a empreita (ou reabre) — mesmo padrão da EAP
   * (`EapStore.alternarConfirmacao`). Confirmar trava Contrato/Qtde.
   * contratada e bloqueia adicionar serviço; libera Medição de contrato/
   * Já pago/Pagamento/Saldo após pagamento (escondidos enquanto em
   * edição — ver `empreita.html`).
   */
  alternarConfirmacao(): void {
    const confirmando = !this.cabecalho().isConfirmed;
    this.cabecalho.update((c) => ({
      ...c,
      isConfirmed: confirmando,
      confirmedAt: confirmando ? new Date().toISOString() : '',
    }));
    this.salvar();
  }

  adicionarItem(): void {
    if (this.travada()) return;
    this.itens.update((lista) => [
      ...lista,
      {
        id: gerarId(),
        desc: '',
        eapId: '',
        tipo: 'material',
        qtdeContratada: null,
        contratoEmp: null,
        contratoReserva: null,
        medicaoAcum: null,
        medicaoAtual: null,
        pagamentoEmp: null,
        pagamentoReserva: null,
      },
    ]);
    this.salvar();
  }

  atualizarItem(id: string, alteracao: Partial<ItemEmpreita>): void {
    this.itens.update((lista) => lista.map((i) => (i.id === id ? { ...i, ...alteracao } : i)));
    this.salvar();
  }

  /** Só "Atual" — "Acumulado" é preenchido pelo sistema em `avancarPeriodo()`, nunca pelo usuário. */
  atualizarMedicao(id: string, campo: 'medicaoAtual', valor: number | null): void {
    this.itens.update((lista) => lista.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)));
    this.salvar();
  }

  /** Lança o contrato (empreita ou reserva), à mão — travado depois de confirmada. */
  atualizarContrato(id: string, campo: 'contratoEmp' | 'contratoReserva', valor: number | null): void {
    if (this.travada()) return;
    this.itens.update((lista) => lista.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)));
    this.salvar();
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

  removerItem(id: string): void {
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
  fecharPeriodo(): void {
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

      const emp = Number(linha.pagamentoEmpDraft) || 0;
      const reserva = Number(linha.pagamentoReservaDraft) || 0;

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
          valorReferencia: Number(linha.pagar) || 0,
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
          valorReferencia: Number(linha.reservar) || 0,
        });
        valorTotal += reserva;
      }
    }

    if (!itensPagamento.length) return null;

    const descricaoBase = [cabecalho.numeroEmpreita, cabecalho.descricaoEmpreita]
      .filter(Boolean)
      .join(' — ');

    return {
      id: gerarId(),
      numeroPagamento: gerarNumeroPagamento(numerosEmUso),
      obraNumber: cabecalho.obraNumber,
      dataSolicitacao: hojeIso(),
      dataPagamento: '',
      fornecedor: cabecalho.empreiteiro || 'Empreiteiro',
      descricao: descricaoBase || 'Medição de empreita',
      valorTotal,
      itens: itensPagamento,
      origem: { tipo: 'empreita', refId: this.empreitaId },
      status: 'pendente',
    };
  }
}
