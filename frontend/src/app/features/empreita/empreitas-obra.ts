import { Component, OnInit, WritableSignal, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { Empreita } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { formatarData, formatarMoeda, hojeIso } from '../../core/utils/formato';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { copiarParaAreaDeTransferencia, SelecaoMultipla } from '../../shared/selecao-lista/selecao-lista';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';
import { DadosRecebimento, Empreiteiro as EmpreiteiroCadastro } from '../cadastros/cadastros.models';
import { CHAVE_EMPREITEIROS, normalizarEmpreiteiro } from '../cadastros/empreiteiros/empreiteiros';
import { normalizarItemEap } from '../eap/eap-normalize';
import { ChaveTipo, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
import { normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { calcularJaPagoPorLinha, calcularLinhaEmpreitaEstendida, calcularOrcadoDaEap } from './empreita-engine';
import { normalizarItemEmpreita } from './empreita.store';
import {
  CabecalhoEapSnapshot,
  ItemEmpreita,
  LinhaEmpreitaEstendida,
  OrcadoEap,
  ResumoContratoEmpreita,
} from './empreita.models';

interface LinhaComItem {
  item: ItemEmpreita;
  linha: LinhaEmpreitaEstendida;
}

/**
 * Uma ETAPA da EAP, já agrupando os serviços desta empreita que apontam
 * pra ela (03/09/2026, pedido do Lucas: "quero que cada etapa apareça
 * apenas uma única vez") — `categorias` são as categorias de custo
 * PRESENTES nela (abreviadas: MAT/MO/EQUIP/OUTR/ADM) e `somaOrcado` é a
 * soma do orçado só dessas categorias, contada uma vez por categoria
 * (não por serviço — orçado é um valor de referência da própria EAP).
 */
interface GrupoServicosEtapa {
  eapCodigo: string;
  etapaDesc: string;
  categorias: ChaveTipo[];
  somaOrcado: number;
  /**
   * Etapa marcada como Adicional na EAP (03/09/2026) — separa a lista de
   * serviços da mensagem em "previstos"/"não previstos". Serviço sem
   * etapa vinculada (`semEtapa`) sempre entra como "não previsto": por
   * definição não está na EAP.
   */
  adicional: boolean;
}

/** Dados já calculados de UMA empreita, prontos pra virar texto de mensagem. */
interface DadosEmpreitaMensagem {
  descricaoEmpreita: string;
  beneficiado: string;
  pix: string;
  gruposEtapa: GrupoServicosEtapa[];
  somaOrcado: number;
  somaContrato: number;
  somaJaPago: number;
  somaAPagar: number;
  somaSaldo: number;
  historico: { data: string; valor: number }[];
}

type ColunaEmpreitaObra =
  | 'numero'
  | 'descricao'
  | 'empreiteiro'
  | 'total'
  | 'totalPago'
  | 'ultimaSolicitacao';

/**
 * Lista de empreitas de UMA obra, com criação de empreitas novas.
 *
 * Substitui, dentro da obra, o antigo editor único de empreita (que
 * assumia "1 empreita por obra" e persistia na ponte chave-valor). Agora
 * uma obra pode ter várias empreitas — contratos diferentes com
 * empreiteiros diferentes — cada uma é um registro de verdade em
 * `/empreitas`, e esta tela é o índice delas (task "várias por obra",
 * 31/07/2026).
 */
@Component({
  selector: 'app-empreitas-obra',
  imports: [ReactiveFormsModule, RedimensionarColunas],
  templateUrl: './empreitas-obra.html',
  styleUrl: './empreitas-obra.scss',
})
export class EmpreitasObra implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly armazenamento = inject(ArmazenamentoService);

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly empreitas = signal<Empreita[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;

  /** `resumo()`/pagamentos desta obra, usados só pra derivar Total/Pago/Última solicitação por empreita. */
  private readonly resumoContrato = signal<ResumoContratoEmpreita[]>([]);
  private readonly pagamentosPorEmpreita = signal<Map<string, Pagamento[]>>(new Map());

  /**
   * EAP da obra + Orçado (03/09/2026) — só pra montar a mensagem de
   * solicitação de pagamento (ver bloco no fim do arquivo): é a mesma EAP
   * pra todas as empreitas desta obra, então carrega uma vez só aqui em
   * vez de cada empreita buscar a sua.
   */
  private readonly itensEap = signal<ItemEap[]>([]);
  private readonly cabecalhoEap = signal<CabecalhoEapSnapshot | null>(null);

  /**
   * 26/08/2026, pedido do Lucas: "não está aparecendo o valor total da
   * empreita e nem o valor pago" — `total_empreita`/`total_pago` nunca são
   * gravados no banco (campos mortos), então precisam ser calculados aqui:
   * Total = soma do contrato (Empreiteiro + Reserva) de cada item, via
   * `resumoObra`; Pago = soma dos pagamentos já CONFIRMADOS desta empreita
   * (mesma semântica de "Realizado" usada em EAP/Mapa — pendente não conta).
   */
  private readonly totalPorEmpreita = computed(() => {
    const mapa = new Map<string, number>();
    for (const r of this.resumoContrato()) {
      const soma = r.itens.reduce((s, it) => s + (it.contratoEmp || 0) + (it.contratoReserva || 0), 0);
      mapa.set(r.id, soma);
    }
    return mapa;
  });

  /**
   * "% Medição — Físico" (01/09/2026, redesenhado em 03/09/2026 —
   * pedido do Lucas: barra dupla igual à Medição de obra, em vez de um
   * texto só). Acumulado e Atual separados (antes eram um número só,
   * `medicaoAtual ?? medicaoAcum` já misturado) — ponderados pelo valor
   * do contrato do EMPREITEIRO de cada item (não soma a Reserva: é
   * retenção discricionária, desvinculada do avanço físico — ponderar
   * por ela distorceria "quanto do serviço já foi de fato executado").
   * Itens sem contrato lançado saem do cálculo; sem nenhum item com
   * contrato, `null` (a célula mostra "—").
   */
  private readonly pctFisicoPorEmpreita = computed(() => {
    const mapa = new Map<string, { acumulado: number; atual: number } | null>();
    for (const r of this.resumoContrato()) {
      let somaPonderadaAcum = 0;
      let somaPonderadaAtual = 0;
      let somaContrato = 0;
      for (const item of r.itens) {
        const contrato = item.contratoEmp || 0;
        if (contrato <= 0) continue;
        const acumulado = item.medicaoAcum ?? 0;
        const atual = item.medicaoAtual ?? acumulado;
        somaPonderadaAcum += acumulado * contrato;
        somaPonderadaAtual += atual * contrato;
        somaContrato += contrato;
      }
      mapa.set(
        r.id,
        somaContrato > 0
          ? { acumulado: somaPonderadaAcum / somaContrato, atual: somaPonderadaAtual / somaContrato }
          : null,
      );
    }
    return mapa;
  });

  private readonly pagoPorEmpreita = computed(() => {
    const mapa = new Map<string, number>();
    for (const [id, lista] of this.pagamentosPorEmpreita()) {
      mapa.set(
        id,
        lista.filter((p) => p.status === 'confirmado').reduce((s, p) => s + p.valorTotal, 0),
      );
    }
    return mapa;
  });

  /** Soma dos pagamentos PENDENTES (fechados mas ainda não pagos) — pra "% Medição — Financeiro". */
  private readonly pendentePorEmpreita = computed(() => {
    const mapa = new Map<string, number>();
    for (const [id, lista] of this.pagamentosPorEmpreita()) {
      mapa.set(
        id,
        lista.filter((p) => p.status === 'pendente').reduce((s, p) => s + p.valorTotal, 0),
      );
    }
    return mapa;
  });

  /** Empreiteiro/Reserva separados do Total do contrato — pro modo "Detalhar". */
  private readonly totalDetalhadoPorEmpreita = computed(() => {
    const mapa = new Map<string, { emp: number; reserva: number }>();
    for (const r of this.resumoContrato()) {
      let emp = 0;
      let reserva = 0;
      for (const item of r.itens) {
        emp += item.contratoEmp || 0;
        reserva += item.contratoReserva || 0;
      }
      mapa.set(r.id, { emp, reserva });
    }
    return mapa;
  });

  /** Empreiteiro/Reserva separados do total PAGO (confirmado) — pro modo "Detalhar". */
  private readonly pagoDetalhadoPorEmpreita = computed(() => {
    const mapa = new Map<string, { emp: number; reserva: number }>();
    for (const [id, lista] of this.pagamentosPorEmpreita()) {
      let emp = 0;
      let reserva = 0;
      for (const pagamento of lista) {
        if (pagamento.status !== 'confirmado') continue;
        for (const item of pagamento.itens) {
          if (item.parcela === 'reserva') reserva += Number(item.valor) || 0;
          else if (item.parcela === 'empreiteiro') emp += Number(item.valor) || 0;
        }
      }
      mapa.set(id, { emp, reserva });
    }
    return mapa;
  });

  /** Pagamento mais recentemente SOLICITADO (pendente ou confirmado) — fonte única das 2 colunas "última solicitação". */
  private readonly ultimaSolicitacaoPorEmpreita = computed(() => {
    const mapa = new Map<string, Pagamento | null>();
    for (const [id, lista] of this.pagamentosPorEmpreita()) {
      const ordenada = [...lista]
        .filter((p) => p.dataSolicitacao)
        .sort((a, b) => a.dataSolicitacao.localeCompare(b.dataSolicitacao));
      mapa.set(id, ordenada.length ? ordenada[ordenada.length - 1] : null);
    }
    return mapa;
  });

  protected readonly pagamentosModalEmpreita = signal<Empreita | null>(null);
  protected readonly pagamentosModalLista = computed(() => {
    const empreita = this.pagamentosModalEmpreita();
    if (!empreita) return [];
    return [...(this.pagamentosPorEmpreita().get(empreita.id) ?? [])].sort((a, b) =>
      (b.dataSolicitacao || '').localeCompare(a.dataSolicitacao || ''),
    );
  });

  protected readonly formularioAberto = signal(false);
  protected readonly salvando = signal(false);

  protected readonly formulario = this.fb.nonNullable.group({
    descricaoEmpreita: ['', [Validators.required]],
    empreiteiro: [''],
    dataMedicao: [''],
  });

  /**
   * Empreiteiros ATIVOS do cadastro (03/09/2026, pedido do Lucas: menu
   * suspenso em vez de texto livre) — `cadastroPorEmpreitaSelecionada`
   * (mais abaixo) carrega TODOS pra achar Chave PIX; aqui é uma lista à
   * parte, filtrada, só pra popular o `<select>` do formulário.
   */
  protected readonly empreiteirosAtivos = computed(() =>
    this.empreiteirosCadastro()
      .filter((e) => e.ativo !== false)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  );

  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaEmpreitaObra> | null>(null);
  protected readonly setaOrdenacao = setaOrdenacao;
  protected readonly busca = signal('');

  /**
   * "Detalhar" (03/09/2026, pedido do Lucas) — liga, as colunas Total/
   * Pago/Valor da última solicitação passam a empilhar Empreiteiro/
   * Reserva dentro da célula, em vez do valor somado. Mesmo padrão de
   * `mostrarEtapas` (Pagamentos) / `simplificado` (Empreita).
   */
  protected readonly detalhar = signal(false);

  protected alternarDetalhar(): void {
    this.detalhar.update((v) => !v);
  }

  protected alternarOrdenacaoColuna(coluna: ColunaEmpreitaObra): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  private readonly listaFiltrada = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    if (!termo) return this.empreitas();
    return this.empreitas().filter((e) =>
      [this.numero(e), this.descricao(e), this.empreiteiro(e)].join(' ').toLowerCase().includes(termo),
    );
  });

  protected readonly listaOrdenada = computed(() =>
    ordenarPor(this.listaFiltrada(), this.ordenacao(), (e, coluna) => {
      switch (coluna) {
        case 'numero': return this.numero(e);
        case 'descricao': return this.descricao(e);
        case 'empreiteiro': return this.empreiteiro(e);
        case 'total': return this.total(e);
        case 'totalPago': return this.totalPago(e);
        case 'ultimaSolicitacao': return this.dataUltimaSolicitacao(e);
      }
    }),
  );

  ngOnInit(): void {
    this.carregar();
    this.carregarEmpreiteiros();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    forkJoin({
      empreitas: this.api.listarEmpreitas(this.obraId()),
      resumo: this.api.obterResumoContratoEmpreitas(this.obraId()),
      pagamentosBrutos: this.api.listarPagamentos({ obraId: this.obraId(), origemTipo: 'empreita' }),
      eap: this.api.obterEap(this.obraId()),
    }).subscribe({
      next: ({ empreitas, resumo, pagamentosBrutos, eap }) => {
        this.empreitas.set(empreitas);
        this.resumoContrato.set(resumo);

        const porEmpreita = new Map<string, Pagamento[]>();
        for (const bruto of pagamentosBrutos) {
          const pagamento = normalizarPagamento(bruto as Record<string, unknown>);
          const empreitaId = pagamento.origem?.tipo === 'empreita' ? pagamento.origem.refId : null;
          if (!empreitaId) continue;
          const lista = porEmpreita.get(empreitaId) ?? [];
          lista.push(pagamento);
          porEmpreita.set(empreitaId, lista);
        }
        this.pagamentosPorEmpreita.set(porEmpreita);

        const itensEapBrutos = Array.isArray(eap.eapItems) ? eap.eapItems : [];
        this.itensEap.set(itensEapBrutos.map((i) => normalizarItemEap(i as unknown as Record<string, unknown>)));
        const cabecalho = eap.header ?? {};
        this.cabecalhoEap.set({
          mapNumber: String(cabecalho['mapNumber'] ?? ''),
          bdiMode: cabecalho['bdiMode'] === 'value' ? 'value' : 'pct',
          bdiPercent: Number(cabecalho['bdiPercent']) || 0,
          bdiValue: Number(cabecalho['bdiValue']) || 0,
        });

        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as empreitas.');
        this.carregando.set(false);
      },
    });
  }

  private carregarEmpreiteiros(): void {
    this.armazenamento.ler(CHAVE_EMPREITEIROS).subscribe({
      next: (bruto) => {
        const dados = this.interpretarListaJson(bruto);
        this.empreiteirosCadastro.set(dados.map((d) => normalizarEmpreiteiro(d)));
      },
      error: () => this.empreiteirosCadastro.set([]),
    });
  }

  private interpretarListaJson(bruto: string | null): Record<string, unknown>[] {
    if (!bruto) return [];
    try {
      const dados = JSON.parse(bruto);
      return Array.isArray(dados) ? dados : [];
    } catch {
      return [];
    }
  }

  protected numero(empreita: Empreita): string {
    return String(empreita['numero_empreita'] ?? '—');
  }

  protected descricao(empreita: Empreita): string {
    return String(empreita['descricao_empreita'] ?? '—');
  }

  protected empreiteiro(empreita: Empreita): string {
    return String(empreita['empreiteiro'] ?? '—');
  }

  protected total(empreita: Empreita): number {
    return this.totalPorEmpreita().get(empreita.id) ?? 0;
  }

  /** `null` quando não há contrato lançado ainda — a célula mostra "—" nesse caso, sem desenhar as barras. */
  protected temMedicaoFisica(empreita: Empreita): boolean {
    return this.pctFisicoPorEmpreita().get(empreita.id) !== null;
  }

  protected pctFisicoAcumulado(empreita: Empreita): number {
    return this.pctFisicoPorEmpreita().get(empreita.id)?.acumulado ?? 0;
  }

  protected pctFisicoAtual(empreita: Empreita): number {
    return this.pctFisicoPorEmpreita().get(empreita.id)?.atual ?? 0;
  }

  /** "Financeiro" — % do Contrato já pago (a fatia coberta, mais escura, igual à Medição). */
  protected pctFinanceiroPago(empreita: Empreita): number {
    const total = this.total(empreita);
    return total > 0 ? (this.totalPago(empreita) / total) * 100 : 0;
  }

  /** "Financeiro" — % do Contrato já SOLICITADO (pago + pendente) — o trecho que sobra visível é o pendente. */
  protected pctFinanceiroTotal(empreita: Empreita): number {
    const total = this.total(empreita);
    if (total <= 0) return 0;
    const pendente = this.pendentePorEmpreita().get(empreita.id) ?? 0;
    return ((this.totalPago(empreita) + pendente) / total) * 100;
  }

  /** `Math.min(100, Math.max(0, pct))` — mesmo clamp de `medicao.ts::larguraBarra`. */
  protected larguraBarra(pct: number): number {
    return Math.min(100, Math.max(0, pct));
  }

  protected formatarPercentualBarra(pct: number): string {
    return `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  protected totalPago(empreita: Empreita): number {
    return this.pagoPorEmpreita().get(empreita.id) ?? 0;
  }

  protected totalEmp(empreita: Empreita): number {
    return this.totalDetalhadoPorEmpreita().get(empreita.id)?.emp ?? 0;
  }

  protected totalReserva(empreita: Empreita): number {
    return this.totalDetalhadoPorEmpreita().get(empreita.id)?.reserva ?? 0;
  }

  protected pagoEmp(empreita: Empreita): number {
    return this.pagoDetalhadoPorEmpreita().get(empreita.id)?.emp ?? 0;
  }

  protected pagoReserva(empreita: Empreita): number {
    return this.pagoDetalhadoPorEmpreita().get(empreita.id)?.reserva ?? 0;
  }

  protected valorUltimaSolicitacao(empreita: Empreita): number {
    return this.ultimaSolicitacaoPorEmpreita().get(empreita.id)?.valorTotal ?? 0;
  }

  protected dataUltimaSolicitacao(empreita: Empreita): string {
    return this.ultimaSolicitacaoPorEmpreita().get(empreita.id)?.dataSolicitacao ?? '';
  }

  /** Empreiteiro/Reserva do MESMO pagamento que "última solicitação" — pro modo "Detalhar". */
  protected ultimaSolicitacaoDetalhada(empreita: Empreita): { emp: number; reserva: number } {
    const pagamento = this.ultimaSolicitacaoPorEmpreita().get(empreita.id);
    if (!pagamento) return { emp: 0, reserva: 0 };
    let emp = 0;
    let reserva = 0;
    for (const item of pagamento.itens) {
      if (item.parcela === 'reserva') reserva += Number(item.valor) || 0;
      else if (item.parcela === 'empreiteiro') emp += Number(item.valor) || 0;
    }
    return { emp, reserva };
  }

  protected abrir(empreita: Empreita): void {
    void this.router.navigate(['/obras', this.obraId(), 'empreitas', empreita.id]);
  }

  /** 26/08/2026, pedido do Lucas: clicar no valor "Pago" mostra a lista de pagamentos desta empreita. */
  protected abrirPagamentos(empreita: Empreita, evento: Event): void {
    evento.stopPropagation();
    this.pagamentosModalEmpreita.set(empreita);
  }

  protected fecharPagamentos(): void {
    this.pagamentosModalEmpreita.set(null);
  }

  /** Empreiteiro/Reserva de UM pagamento — mesma quebra por `parcela` usada no "Detalhar" da lista. */
  protected detalharPagamento(pagamento: Pagamento): { emp: number; reserva: number } {
    let emp = 0;
    let reserva = 0;
    for (const item of pagamento.itens) {
      if (item.parcela === 'reserva') reserva += Number(item.valor) || 0;
      else if (item.parcela === 'empreiteiro') emp += Number(item.valor) || 0;
    }
    return { emp, reserva };
  }

  protected remover(empreita: Empreita, evento: Event): void {
    evento.stopPropagation();
    if (!window.confirm(`Excluir a empreita "${this.descricao(empreita)}"?`)) return;

    this.api.excluirEmpreita(empreita.id).subscribe({
      next: () => this.empreitas.update((lista) => lista.filter((e) => e.id !== empreita.id)),
      error: () => window.alert('Não foi possível excluir a empreita.'),
    });
  }

  // ------------------------------------------------------------------
  // Formulário — Nova empreita
  // ------------------------------------------------------------------
  protected novo(): void {
    // "Data" nasce com hoje (03/09/2026, pedido do Lucas) — só o valor
    // PADRÃO muda, continua editável depois, como o resto do cabeçalho.
    this.formulario.reset({ descricaoEmpreita: '', empreiteiro: '', dataMedicao: hojeIso() });
    this.formularioAberto.set(true);
  }

  protected fechar(): void {
    this.formularioAberto.set(false);
  }

  protected salvar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const v = this.formulario.getRawValue();

    // `numero_empreita`/`obra_number` não são mais enviados — o backend
    // gera os dois sozinho na criação (`OBR-XXX-EMP-XXX`, ver
    // `EmpreitaController::syncCompleto`), e o campo nasce travado na tela.
    const payload = {
      obra_id: this.obraId(),
      descricao_empreita: v.descricaoEmpreita.trim(),
      empreiteiro: v.empreiteiro.trim(),
      medicao_date: v.dataMedicao || null,
    };

    this.salvando.set(true);
    this.api.criarEmpreita(payload).subscribe({
      next: (empreita) => {
        this.salvando.set(false);
        this.fechar();
        this.router.navigate(['/obras', this.obraId(), 'empreitas', empreita.id]);
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível criar a empreita.');
      },
    });
  }

  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  // ------------------------------------------------------------------
  // Seleção de empreitas + "Copiar solicitação"/"Copiar resumo" de
  // pagamento pro WhatsApp (02-03/09/2026, pedido do Lucas, formato de
  // mensagens reais dele). Fica só AQUI, na lista (pedido dele,
  // 03/09/2026: "quero que aconteça de fato apenas na lista de
  // empreita" — uma 1ª versão vivia dentro de cada empreita e foi
  // removida de lá).
  //
  // Selecionando várias empreitas de uma vez, cada uma vira UM bloco de
  // solicitação — bullet de TODOS os serviços contratados (pedido do
  // Lucas, "quero que apareça tudo") — juntos numa mensagem só,
  // exatamente como nos exemplos que o Lucas mandou (3 empreitas/
  // empreiteiros numa "leva" só). O resumo final junta um beneficiado por
  // empreita selecionada.
  //
  // Uma empreita só entra na mensagem se tiver algum pagamento PENDENTE
  // (gerado por "Fechar período", ainda não confirmado) — é dali, não do
  // rascunho ao vivo da empreita, que vem "VALOR A SER PAGO" (ver
  // `montarDadosEmpreita`: bug real do fluxo do Lucas, corrigido em
  // 03/09/2026 — "Fechar período" zera o rascunho na hora, então ler dele
  // aqui sempre dava "nada a pagar" bem no momento em que o fluxo mais
  // precisa da mensagem).
  //
  // Confirmado com o Lucas: "VALOR JÁ PAGO"/"VALOR A SER PAGO" somam
  // Empreiteiro + Reserva; a Chave PIX é escolhida na hora quando o
  // empreiteiro tem mais de uma cadastrada — por empreita, já que
  // empreitas diferentes podem ter empreiteiros diferentes.
  //
  // **Ignorado por pedido do Lucas (03/09/2026):** a fórmula diferente de
  // empreita "Administração" (Valor gasto na obra × percentual) — ele
  // ajusta essa parte manualmente na mensagem antes de mandar no
  // WhatsApp, já que só acontece numa empreita.
  // ------------------------------------------------------------------
  protected readonly selecao = new SelecaoMultipla<Empreita>((empreita) => empreita.id);
  protected readonly preparando = signal(false);
  protected readonly copiadoSolicitacoes = signal(false);
  protected readonly copiadoResumo = signal(false);

  protected readonly empreiteirosCadastro = signal<EmpreiteiroCadastro[]>([]);
  protected readonly pixEscolhidoPorEmpreita = signal<Record<string, string>>({});

  /** Cadastro de Empreiteiro (pra Chave PIX) de cada empreita SELECIONADA agora, por nome do empreiteiro. */
  protected readonly cadastroPorEmpreitaSelecionada = computed(() => {
    const mapa = new Map<string, EmpreiteiroCadastro | undefined>();
    for (const empreita of this.selecao.selecionados(this.listaOrdenada())) {
      const nome = this.empreiteiro(empreita).trim().toLowerCase();
      mapa.set(empreita.id, this.empreiteirosCadastro().find((c) => c.nome.trim().toLowerCase() === nome));
    }
    return mapa;
  });

  /** Empreitas selecionadas cujo empreiteiro tem MAIS DE UMA Chave PIX cadastrada — precisam de escolha manual. */
  protected readonly empreitasComPixParaEscolher = computed(() =>
    this.selecao
      .selecionados(this.listaOrdenada())
      .filter((e) => (this.cadastroPorEmpreitaSelecionada().get(e.id)?.dadosRecebimento.length ?? 0) > 1),
  );

  protected opcoesPix(empreita: Empreita): DadosRecebimento[] {
    return this.cadastroPorEmpreitaSelecionada().get(empreita.id)?.dadosRecebimento ?? [];
  }

  protected mudarPixEscolhida(empreitaId: string, evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.pixEscolhidoPorEmpreita.update((m) => ({ ...m, [empreitaId]: valor }));
  }

  private chavePixDaEmpreita(empreita: Empreita): string {
    const opcoes = this.cadastroPorEmpreitaSelecionada().get(empreita.id)?.dadosRecebimento ?? [];
    if (!opcoes.length) return '';
    const escolhida = opcoes.find((o) => o.id === this.pixEscolhidoPorEmpreita()[empreita.id]);
    return (escolhida ?? opcoes[0]).chavePix || '';
  }

  /** Mesma data que `formatarData`, mas com ano de 2 dígitos — formato usado em "PAGAMENTOS PARCIAIS". */
  private formatarDataCurta(iso: string): string {
    const partes = this.formatarData(iso).split('/');
    if (partes.length !== 3) return this.formatarData(iso);
    return `${partes[0]}/${partes[1]}/${partes[2].slice(-2)}`;
  }

  private static readonly ABREV_TIPO: Record<ChaveTipo, string> = {
    material: 'MAT',
    maoDeObra: 'MO',
    equipamento: 'EQUIP',
    outros: 'OUTR',
    administracao: 'ADM',
  };

  /**
   * Agrupa os serviços por ETAPA da EAP — cada etapa aparece UMA vez só,
   * mesmo que a empreita tenha mais de um serviço apontando pra ela em
   * categorias diferentes (ex.: um serviço de Material e outro de Mão de
   * obra, ambos na etapa 19). `somaOrcado` do grupo soma o orçado de cada
   * categoria PRESENTE na etapa uma vez só (é o orçado da própria EAP
   * pra aquela categoria — não duplica se dois serviços caírem na mesma
   * etapa+categoria). Serviço sem etapa vinculada vira um grupo à parte,
   * um por serviço (não tem como agrupar sem saber a etapa). A ordem dos
   * grupos segue a ordem da própria EAP, não a ordem de lançamento dos
   * serviços na empreita.
   */
  private agruparServicosPorEtapa(
    todosItens: LinhaComItem[],
    orcadoPorId: Map<string, OrcadoEap>,
  ): { grupos: GrupoServicosEtapa[]; somaOrcado: number } {
    const categoriasPorEap = new Map<string, Set<ChaveTipo>>();
    const semEtapa: LinhaComItem[] = [];

    for (const linhaComItem of todosItens) {
      const eapId = linhaComItem.item.eapId;
      if (!eapId) {
        semEtapa.push(linhaComItem);
        continue;
      }
      const categorias = categoriasPorEap.get(eapId) ?? new Set<ChaveTipo>();
      categorias.add(linhaComItem.item.tipo);
      categoriasPorEap.set(eapId, categorias);
    }

    const grupos: GrupoServicosEtapa[] = [];
    let somaOrcado = 0;

    for (const itemEap of this.itensEap()) {
      const categoriasSet = categoriasPorEap.get(itemEap.id);
      if (!categoriasSet?.size) continue;

      const categorias = TIPOS_CUSTO.map((t) => t.chave).filter((c) => categoriasSet.has(c));
      const totalPorTipo = orcadoPorId.get(itemEap.id)?.totalPorTipo;
      const somaGrupo = categorias.reduce((total, c) => total + (Number(totalPorTipo?.[c]) || 0), 0);

      grupos.push({
        eapCodigo: itemEap.eap,
        etapaDesc: String(itemEap.desc ?? '').toUpperCase(),
        categorias,
        somaOrcado: somaGrupo,
        adicional: itemEap.adicional,
      });
      somaOrcado += somaGrupo;
    }

    for (const { item, linha } of semEtapa) {
      grupos.push({
        eapCodigo: '',
        etapaDesc: (item.desc || 'Serviço').toUpperCase(),
        categorias: [item.tipo],
        somaOrcado: linha.orcado,
        adicional: true,
      });
      somaOrcado += linha.orcado;
    }

    return { grupos, somaOrcado };
  }

  /** Bullet "{código EAP} - {ETAPA} (ABREV, ABREV) - R$ {orçado das categorias presentes na etapa}". */
  private bulletEtapa(grupo: GrupoServicosEtapa): string {
    const categoriasTexto = grupo.categorias.map((c) => EmpreitasObra.ABREV_TIPO[c]).join(', ');
    const rotulo = grupo.eapCodigo ? `${grupo.eapCodigo} - ${grupo.etapaDesc}` : grupo.etapaDesc;
    return `* \`${rotulo} (${categoriasTexto}) - ${this.formatarMoeda(grupo.somaOrcado)}\``;
  }

  /**
   * "PAGAMENTOS PARCIAIS" de uma empreita — uma linha por período já
   * fechado (Empreiteiro + Reserva do pagamento inteiro, já que um
   * "Fechar período" cobre a empreita toda), do mais antigo pro mais
   * novo. Só pagamentos CONFIRMADOS entram, mesmo filtro do "Já pago" —
   * o pendente sendo cobrado agora entra à parte, como "(HOJE)".
   */
  private historicoPagamentos(empreitaId: string): { data: string; valor: number }[] {
    return (this.pagamentosPorEmpreita().get(empreitaId) ?? [])
      .filter((p) => p.status === 'confirmado')
      .map((p) => ({
        data: p.dataSolicitacao,
        valor: p.itens.reduce((total, it) => total + (Number(it.valor) || 0), 0),
      }))
      .filter((h) => h.valor > 0)
      .sort((a, b) => a.data.localeCompare(b.data));
  }

  /**
   * Monta os dados de UMA empreita a partir do detalhe cheio (`GET
   * /empreitas/{id}`, único jeito de ter o id de cada serviço — o resumo
   * leve da lista não traz). `null` quando não há NENHUM pagamento
   * PENDENTE desta empreita — nada a cobrar do cliente agora.
   *
   * Importante (03/09/2026, corrigido a partir do teste real do Lucas):
   * "VALOR A SER PAGO" vem da SOMA DOS PAGAMENTOS PENDENTES já gerados
   * por "Fechar período" — NÃO do rascunho ao vivo da empreita
   * (`pagamentoDraftTotal`), que "Fechar período" já zera assim que cria
   * o pagamento pendente (o rascunho é sempre o do PRÓXIMO período, que
   * ainda não foi medido). Ler do draft fazia a mensagem sair vazia
   * bem no momento em que o fluxo real do Lucas mais precisa dela: logo
   * depois de fechar o período.
   */
  private montarDadosEmpreita(empreita: Empreita, bruto: Record<string, unknown>): DadosEmpreitaMensagem | null {
    const itensBrutos = Array.isArray(bruto['itens']) ? (bruto['itens'] as Record<string, unknown>[]) : [];
    const itens = itensBrutos.map((i) => normalizarItemEmpreita(i));
    if (!itens.length) return null;

    const orcadoPorId = calcularOrcadoDaEap(this.itensEap(), this.cabecalhoEap());
    const todosPagamentos = this.pagamentosPorEmpreita().get(empreita.id) ?? [];
    const confirmados = todosPagamentos.filter((p) => p.status === 'confirmado');
    const pendentes = todosPagamentos.filter((p) => p.status === 'pendente');
    const jaPagoPorItem = calcularJaPagoPorLinha(confirmados);

    const aPagarPorItem = new Map<string, number>();
    for (const pagamento of pendentes) {
      for (const it of pagamento.itens) {
        if (!it.empreitaItemId) continue;
        aPagarPorItem.set(it.empreitaItemId, (aPagarPorItem.get(it.empreitaItemId) ?? 0) + (Number(it.valor) || 0));
      }
    }

    const somaAPagar = Array.from(aPagarPorItem.values()).reduce((total, v) => total + v, 0);
    if (somaAPagar <= 0) return null;

    // TODOS os serviços contratados aparecem como bullet (pedido do
    // Lucas, 03/09/2026: "quero que apareça tudo") — não só os que têm
    // algo pendente pra pagar neste período.
    const todosItens: LinhaComItem[] = itens.map((item) => ({
      item,
      linha: calcularLinhaEmpreitaEstendida(item, orcadoPorId, new Map(), new Map(), jaPagoPorItem),
    }));

    const somar = (campo: (l: LinhaEmpreitaEstendida) => number) =>
      todosItens.reduce((total, { linha }) => total + campo(linha), 0);
    const somaContrato = somar((l) => l.contrato);
    const somaJaPago = somar((l) => l.jaPago.total);

    // Orçado vem do agrupamento por etapa, não da soma direta por
    // serviço — evita contar duas vezes o orçado de uma etapa+categoria
    // quando dois serviços apontam pra ela (ver `agruparServicosPorEtapa`).
    const { grupos: gruposEtapa, somaOrcado } = this.agruparServicosPorEtapa(todosItens, orcadoPorId);

    return {
      descricaoEmpreita: this.descricao(empreita),
      beneficiado: this.empreiteiro(empreita).trim().toUpperCase() || '—',
      pix: this.chavePixDaEmpreita(empreita),
      gruposEtapa,
      somaOrcado,
      somaContrato,
      somaJaPago,
      somaAPagar,
      // Saldo após ESTE pagamento pendente — não dá pra usar
      // `linha.saldoAposPagamentoTotal` aqui: ele é calculado em cima do
      // rascunho ao vivo (zerado após "Fechar período"), não do pendente.
      somaSaldo: somaContrato - somaJaPago - somaAPagar,
      historico: this.historicoPagamentos(empreita.id),
    };
  }

  /**
   * "SERVIÇOS PREVISTOS NA EAP" e "SERVIÇOS NÃO PREVISTOS NA EAP"
   * (03/09/2026, pedido do Lucas, depois da EAP ganhar a coluna
   * "Adicionais") — previstos sempre aparecem primeiro; cada seção só
   * aparece se tiver pelo menos 1 bullet.
   */
  private secoesServicos(dados: DadosEmpreitaMensagem): string[] {
    const previstos = dados.gruposEtapa.filter((g) => !g.adicional);
    const naoPrevistos = dados.gruposEtapa.filter((g) => g.adicional);
    const somaPrevistos = previstos.reduce((total, g) => total + g.somaOrcado, 0);
    const somaNaoPrevistos = naoPrevistos.reduce((total, g) => total + g.somaOrcado, 0);

    const secoes: string[] = [];
    if (previstos.length) {
      secoes.push(
        `*SERVIÇOS PREVISTOS NA EAP: ${this.formatarMoeda(somaPrevistos)}*`,
        ...previstos.map((grupo) => this.bulletEtapa(grupo)),
      );
    }
    if (naoPrevistos.length) {
      if (secoes.length) secoes.push('');
      secoes.push(
        `*SERVIÇOS NÃO PREVISTOS NA EAP: ${this.formatarMoeda(somaNaoPrevistos)}*`,
        ...naoPrevistos.map((grupo) => this.bulletEtapa(grupo)),
      );
    }
    return secoes;
  }

  private blocoSolicitacao(dados: DadosEmpreitaMensagem): string {
    const linhasParciais = [
      ...dados.historico.map((h) => `${this.formatarMoeda(h.valor)} - ${this.formatarDataCurta(h.data)}`),
      `${this.formatarMoeda(dados.somaAPagar)} - ${this.formatarDataCurta(hojeIso())} (HOJE)`,
    ];

    return [
      '*SOLICITAÇÃO DE PAGAMENTO*',
      ...(dados.descricaoEmpreita && dados.descricaoEmpreita !== '—'
        ? [`> *${dados.descricaoEmpreita.toUpperCase()}*`]
        : []),
      '',
      ...this.secoesServicos(dados),
      '',
      `VALOR ORÇADO: ${this.formatarMoeda(dados.somaOrcado)}`,
      `VALOR EMPREITA: ${this.formatarMoeda(dados.somaContrato)}`,
      `VALOR JÁ PAGO: ${this.formatarMoeda(dados.somaJaPago)}`,
      '',
      `VALOR A SER PAGO: *${this.formatarMoeda(dados.somaAPagar)}*`,
      `SALDO APÓS PAGAMENTO: ${this.formatarMoeda(dados.somaSaldo)}`,
      `DATA: ${this.formatarData(hojeIso())}`,
      '',
      'PAGAMENTOS PARCIAIS',
      ...linhasParciais,
      '',
      'DADOS DE PAGAMENTO',
      dados.beneficiado,
      `PIX: ${dados.pix || '—'}`,
    ].join('\n');
  }

  /** "1ª mensagem" do padrão do Lucas: um bloco de solicitação por empreita, separados por travessão. */
  private textoSolicitacoes(lista: DadosEmpreitaMensagem[]): string {
    return lista.map((d) => this.blocoSolicitacao(d)).join('\n\n' + '-'.repeat(43) + '\n\n');
  }

  /**
   * "Segunda mensagem": cabeçalho + um resumo (beneficiado + valor + PIX)
   * por empreita, separados por travessão curto — cabeçalho e o 1º
   * pagamento ficam separados por uma linha em branco (03/09/2026, pedido
   * do Lucas: o cabeçalho tinha ficado de fora quando o recurso mudou
   * pra lista, e faltava essa linha em branco).
   */
  private textoResumo(lista: DadosEmpreitaMensagem[]): string {
    const entradas = lista
      .map((d) =>
        [`\`${d.beneficiado}\``, `*${this.formatarMoeda(d.somaAPagar)}*`, `\`Chave PIX: ${d.pix || '—'}\``].join('\n'),
      )
      .join('\n\n' + '-'.repeat(15) + '\n\n');

    return ['*RESUMO DE PAGAMENTOS*', '', entradas].join('\n');
  }

  protected copiarSolicitacoes(): void {
    this.prepararEGerar((lista) => this.textoSolicitacoes(lista), this.copiadoSolicitacoes);
  }

  protected copiarResumo(): void {
    this.prepararEGerar((lista) => this.textoResumo(lista), this.copiadoResumo);
  }

  /**
   * Busca o detalhe cheio de cada empreita selecionada, monta os dados e
   * copia o texto pra área de transferência — compartilhado pelos dois
   * botões, só muda como o texto final é montado a partir da lista.
   */
  private prepararEGerar(
    montarTexto: (lista: DadosEmpreitaMensagem[]) => string,
    copiadoFlag: WritableSignal<boolean>,
  ): void {
    const selecionados = this.selecao.selecionados(this.listaOrdenada());
    if (!selecionados.length) return;

    for (const empreita of selecionados) {
      const opcoes = this.cadastroPorEmpreitaSelecionada().get(empreita.id)?.dadosRecebimento ?? [];
      if (opcoes.length > 1 && !this.pixEscolhidoPorEmpreita()[empreita.id]) {
        window.alert(`Escolha a chave PIX de ${this.empreiteiro(empreita)} antes de copiar.`);
        return;
      }
    }

    this.preparando.set(true);
    forkJoin(selecionados.map((e) => this.api.obterEmpreita(e.id))).subscribe({
      next: (brutos) => {
        this.preparando.set(false);

        const lista = selecionados
          .map((empreita, i) => this.montarDadosEmpreita(empreita, brutos[i] as unknown as Record<string, unknown>))
          .filter((d): d is DadosEmpreitaMensagem => d !== null);

        if (!lista.length) {
          window.alert('Nenhuma das empreitas selecionadas tem pagamento pendente pra cobrar — feche o período antes.');
          return;
        }

        const texto = montarTexto(lista);
        copiarParaAreaDeTransferencia(texto).then((ok) => {
          if (!ok) {
            window.alert('Não foi possível copiar — copie manualmente o texto abaixo:\n\n' + texto);
            return;
          }
          copiadoFlag.set(true);
          setTimeout(() => copiadoFlag.set(false), 2000);
        });
      },
      error: () => {
        this.preparando.set(false);
        window.alert('Não foi possível carregar os dados das empreitas selecionadas.');
      },
    });
  }
}
