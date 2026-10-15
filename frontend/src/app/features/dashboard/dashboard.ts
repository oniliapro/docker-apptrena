import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import {
  Empreita,
  Mapa,
  MedicaoPayload,
  Obra,
  dadosDaEmpresa,
  rotuloStatusObra,
} from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { diasRestantes, formatarData, formatarMoeda } from '../../core/utils/formato';
import { calcularCacheOrcado } from '../eap/eap-engine';
import {
  aplicarNumeracaoAutomatica,
  cabecalhoVazio,
  normalizarCabecalho,
  normalizarItemEap,
} from '../eap/eap-normalize';
import { CabecalhoObra, ChaveTipo, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
import { calcularSomaItens, normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { normalizarRecebimento } from '../recebimentos/recebimentos-calc';
import { Recebimento } from '../recebimentos/recebimentos.models';
import { pctParaValor } from '../medicoes/medicao-engine';
import { EventoAgenda } from '../agenda/agenda.models';
import { ContratoEquipamento, ROTULOS_STATUS_CONTRATO } from '../contratos-equipamentos/contratos-equipamentos.models';
import { ContratosEquipamentosService } from '../contratos-equipamentos/contratos-equipamentos.service';
import { Diaria } from '../diarias/diarias.models';
import { valorTotalDiaria } from '../diarias/diarias-engine';
import { RdoRegistro } from '../rdo/rdo.models';
import { RdoService } from '../rdo/rdo.service';
import { BlocoLista, OpcaoFiltroBloco } from './dashboard-bloco';
import { EditarPagamentoModal, EventoSalvarPagamento } from '../pagamentos/editar-pagamento-modal/editar-pagamento-modal';
import { EditarRecebimentoModal, EventoSalvarRecebimento } from '../recebimentos/editar-recebimento-modal/editar-recebimento-modal';
import { AcoesRecebimento } from '../recebimentos/acoes-recebimento';
import { AcoesPagamento } from '../../shared/pagamentos-vinculados-popup/acoes-pagamento';
import { PagamentosVinculadosPopup } from '../../shared/pagamentos-vinculados-popup/pagamentos-vinculados-popup';
import { AnexosLancamento } from '../../shared/anexos-lancamento/anexos-lancamento';

/** Uma categoria a mais que `TIPOS_CUSTO`: itens sem `tipo` reconhecido caem aqui em vez de sumir da soma (ver docblock de `baldeCategoria`). */
type BaldeCategoria = ChaveTipo | 'semCategoria';

/** Categorias + a coluna "Total" — mesma chave usada tanto pro card em Detalhar quanto pro total geral. */
type ChaveColuna = BaldeCategoria | 'total';

const CATEGORIAS_RELATORIO: ReadonlyArray<{ chave: BaldeCategoria; rotulo: string }> = [
  { chave: 'material', rotulo: 'Material' },
  { chave: 'maoDeObra', rotulo: 'Mão de obra' },
  { chave: 'equipamento', rotulo: 'Equipamento' },
  { chave: 'outros', rotulo: 'Outros' },
  { chave: 'administracao', rotulo: 'Administração' },
  { chave: 'semCategoria', rotulo: 'S/ categoria' },
];

const COLUNAS_RELATORIO: readonly ChaveColuna[] = [...CATEGORIAS_RELATORIO.map((c) => c.chave), 'total'];

/** Orçado/Realizado/Saldo/Medido de uma categoria (ou do total) — nessa ordem, que é a do mockup do Lucas (14/09/2026). */
interface Metricas {
  orcado: number;
  realizado: number;
  saldo: number;
  medido: number;
}

function metricasZeradas(): Metricas {
  return { orcado: 0, realizado: 0, saldo: 0, medido: 0 };
}

/** `Record<ChaveColuna, Metricas>` já zerado, uma entrada por categoria + "total". */
function mapaDeColunasZerado(): Record<ChaveColuna, Metricas> {
  return COLUNAS_RELATORIO.reduce(
    (acc, chave) => ({ ...acc, [chave]: metricasZeradas() }),
    {} as Record<ChaveColuna, Metricas>,
  );
}

interface LinhaRelatorio {
  obraId: string;
  obraNumber: string;
  obraNome: string;
  cliente: string;
  dataBase: string;
  statusObra: string;
  statusEap: string;
  /** Só itens/pagamentos/medições SEM a EAP marcada como "serviço adicional" (fora do escopo original). */
  semAdicionais: Record<ChaveColuna, Metricas>;
  /** Só os marcados como adicional. */
  somenteAdicionais: Record<ChaveColuna, Metricas>;
  /** `semAdicionais + somenteAdicionais` — usado quando "Segmentar adicionais" está desligado. */
  geral: Record<ChaveColuna, Metricas>;
}

interface LinhaMedicao {
  id: string;
  obraId: string;
  obraNome: string;
  sequencia: number;
  dataMedicao: string | null;
  status: 'rascunho' | 'aprovada';
}

/** Um RDO no bloco "Diário de obra" (15/10/2026). */
interface LinhaRdo {
  id: string;
  obraId: string;
  obraNome: string;
  numero: number | null;
  data: string;
  status: 'rascunho' | 'finalizado';
  tarefas: number;
  fotos: number;
}

/** Uma diária no bloco "Diárias" (15/10/2026). */
interface LinhaDiaria {
  id: string;
  obraId: string;
  obraNome: string;
  profissional: string;
  funcao: string;
  data: string;
  meia: boolean;
  valor: number;
  status: 'rascunho' | 'fechada';
}

type LinhaEquipamento = ContratoEquipamento & { obra_nome: string };

/** Opções de status de cada bloco (15/10/2026, pedido do Lucas: no máximo status + obra). */
const STATUS_MAPA: OpcaoFiltroBloco[] = [
  { valor: 'em_aberto', rotulo: 'Em aberto' },
  { valor: 'finalizado', rotulo: 'Finalizado' },
];
const STATUS_EMPREITA: OpcaoFiltroBloco[] = [
  { valor: 'em_edicao', rotulo: 'Em edição' },
  { valor: 'confirmada', rotulo: 'Confirmada' },
  { valor: 'em_pagamento', rotulo: 'Em pagamento' },
];
const STATUS_LANCAMENTO: OpcaoFiltroBloco[] = [
  { valor: 'pendente', rotulo: 'Pendente' },
  { valor: 'confirmado', rotulo: 'Confirmado' },
];
const STATUS_MEDICAO: OpcaoFiltroBloco[] = [
  { valor: 'rascunho', rotulo: 'Rascunho' },
  { valor: 'aprovada', rotulo: 'Aprovada' },
];
const STATUS_RDO: OpcaoFiltroBloco[] = [
  { valor: 'rascunho', rotulo: 'Rascunho' },
  { valor: 'finalizado', rotulo: 'Finalizado' },
];
const STATUS_DIARIA: OpcaoFiltroBloco[] = [
  { valor: 'rascunho', rotulo: 'Em aberto' },
  { valor: 'fechada', rotulo: 'Fechada' },
];
const STATUS_EQUIPAMENTO: OpcaoFiltroBloco[] = [
  { valor: 'ativo', rotulo: 'Ativo' },
  { valor: 'vencido', rotulo: 'Vencido' },
  { valor: 'encerrado', rotulo: 'Encerrado' },
];
const STATUS_AGENDA: OpcaoFiltroBloco[] = [
  { valor: 'proximos', rotulo: 'Próximos' },
  { valor: 'passados', rotulo: 'Passados' },
];

/** `AAAA-MM-DD` de uma data local (o recorte da agenda do dashboard). */
function isoLocal(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

interface TotaisEmpreita {
  total: number;
  pago: number;
  saldo: number;
}

/**
 * Tipo vazio/desconhecido cai em "S/ categoria" — em vez de simplesmente
 * desaparecer da soma, como a tela de Relatórios de uma obra já faz hoje
 * (`relatorios.ts::realizado`, `if (item.tipo && item.tipo in totais)`).
 */
function baldeCategoria(tipo: string | undefined | null): BaldeCategoria {
  if (
    tipo === 'material' ||
    tipo === 'maoDeObra' ||
    tipo === 'equipamento' ||
    tipo === 'outros' ||
    tipo === 'administracao'
  ) {
    return tipo;
  }
  return 'semCategoria';
}

/**
 * Página inicial — visão geral de todas as obras.
 *
 * Estrutura vinda do protótipo do Lucas (14/09/2026, mockups em Excel):
 * cinco indicadores no topo, o card "Relatórios" sozinho numa linha
 * cheia logo abaixo, e os demais cards de lista em 3 linhas x 2 colunas.
 * O card "Obras em aberto" que existia antes saiu — não aparecia em
 * nenhum dos mockups.
 *
 * Cada bloco carrega por conta própria. Se um falhar, os outros
 * continuam aparecendo — comportamento herdado de
 * js/home/01-dashboard.js e mantido de propósito: um dashboard que
 * some inteiro porque um endpoint caiu é pior do que um com lacunas.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, NgTemplateOutlet, PagamentosVinculadosPopup, AnexosLancamento, EditarPagamentoModal, EditarRecebimentoModal],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly rdoService = inject(RdoService);
  private readonly contratosEquipamentos = inject(ContratosEquipamentosService);

  protected readonly formatarData = formatarData;
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly rotulosStatusContrato = ROTULOS_STATUS_CONTRATO;

  // ---- Indicadores ----
  protected readonly obrasEmAndamento = signal<string | number>('—');
  protected readonly obrasTotais = signal<number | null>(null);
  protected readonly obrasFinalizadas = signal<string | number>('—');
  protected readonly assinatura = signal('—');
  protected readonly assinaturaNota = signal('');

  // ---- Blocos de lista (15/10/2026): lista completa, filtros (status/obra) e "Ver mais" ----
  protected readonly blocoMapas = new BlocoLista<Mapa>(
    STATUS_MAPA,
    (m) => (m['is_confirmed'] ? 'finalizado' : 'em_aberto'),
    (m) => String(m['obra_nome'] ?? ''),
  );
  protected readonly blocoEmpreitas = new BlocoLista<Empreita>(
    STATUS_EMPREITA,
    (e) => (e['pagamento_iniciado'] ? 'em_pagamento' : e['is_confirmed'] ? 'confirmada' : 'em_edicao'),
    (e) => String(e['obra_nome'] ?? ''),
  );
  protected readonly blocoPagamentos = new BlocoLista<Pagamento>(
    STATUS_LANCAMENTO,
    (p) => p.status,
    (p) => p.obraNome ?? '',
  );
  protected readonly blocoRecebimentos = new BlocoLista<Recebimento>(
    STATUS_LANCAMENTO,
    (r) => r.status,
    (r) => r.obraNome ?? '',
  );
  protected readonly blocoMedicoes = new BlocoLista<LinhaMedicao>(STATUS_MEDICAO, (m) => m.status, (m) => m.obraNome);
  protected readonly blocoRdos = new BlocoLista<LinhaRdo>(STATUS_RDO, (r) => r.status, (r) => r.obraNome);
  protected readonly blocoDiarias = new BlocoLista<LinhaDiaria>(STATUS_DIARIA, (d) => d.status, (d) => d.obraNome);
  protected readonly blocoEquipamentos = new BlocoLista<LinhaEquipamento>(
    STATUS_EQUIPAMENTO,
    (c) => c.status,
    (c) => c.obra_nome,
  );
  /** Agenda abre só nos compromissos que ainda vão acontecer (o que interessa no painel); "Todos" mostra os passados também. */
  protected readonly blocoAgenda = new BlocoLista<EventoAgenda>(
    STATUS_AGENDA,
    (e) => (e.fim >= this.agoraLocal() ? 'proximos' : 'passados'),
    (e) => e.obraNome ?? '',
    'proximos',
  );

  protected readonly totaisPorEmpreita = signal<Map<string, TotaisEmpreita>>(new Map());
  protected readonly relatorios = signal<LinhaRelatorio[]>([]);
  protected readonly detalharRelatorios = signal(false);
  protected readonly segmentarAdicionais = signal(false);

  protected readonly carregandoRelatorios = signal(true);

  /** `AAAA-MM-DDTHH:mm` do momento (o formato de `EventoAgenda.inicio/fim`). */
  private agoraLocal(): string {
    const agora = new Date();
    return `${isoLocal(agora)}T${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  }

  // ---- Editar ao clicar num item dos cards (21/09/2026) ----
  private readonly acoesPagamento = new AcoesPagamento(this.api, (alteracao) =>
    this.blocoPagamentos.itens.update((lista) =>
      alteracao.tipo === 'excluido'
        ? lista.filter((p) => p.id !== alteracao.id)
        : lista.map((p) => (p.id === alteracao.pagamento.id ? { ...p, ...alteracao.pagamento } : p)),
    ),
  );
  protected readonly pagamentoEmEdicao = this.acoesPagamento.emEdicao;
  protected readonly snapshotEapPagamento = this.acoesPagamento.snapshotEap;

  private readonly acoesRecebimento = new AcoesRecebimento(this.api, (alteracao) =>
    this.blocoRecebimentos.itens.update((lista) =>
      alteracao.tipo === 'excluido'
        ? lista.filter((r) => r.id !== alteracao.id)
        : lista.map((r) => (r.id === alteracao.recebimento.id ? { ...r, ...alteracao.recebimento } : r)),
    ),
  );
  protected readonly recebimentoEmEdicao = this.acoesRecebimento.emEdicao;
  protected readonly snapshotEapRecebimento = this.acoesRecebimento.snapshotEap;

  protected abrirPagamento(pagamento: Pagamento): void {
    this.acoesPagamento.abrirComEap(pagamento);
  }

  protected excluirPagamentoDoEditor(pagamento: Pagamento): void {
    this.acoesPagamento.excluirDoEditor(pagamento);
  }

  protected fecharPagamento(): void {
    this.acoesPagamento.fechar();
  }

  protected salvarPagamento(evento: EventoSalvarPagamento): void {
    this.acoesPagamento.salvar(evento);
  }

  protected abrirRecebimento(recebimento: Recebimento): void {
    this.acoesRecebimento.abrir(recebimento);
  }

  protected excluirRecebimentoDoEditor(recebimento: Recebimento): void {
    this.acoesRecebimento.excluirDoEditor(recebimento);
  }

  protected fecharRecebimento(): void {
    this.acoesRecebimento.fechar();
  }

  protected salvarRecebimento(evento: EventoSalvarRecebimento): void {
    this.acoesRecebimento.salvar(evento);
  }

  /** Mapa e Empreita: "editar" é abrir a página dele, dentro da obra. */
  protected abrirMapa(mapa: Record<string, unknown>): void {
    const obraId = this.campo(mapa, 'obra_id');
    // Mapa sem obra vinculada não tem página para abrir.
    if (obraId === '—') return;
    void this.router.navigate(['/obras', obraId, 'mapas', this.campo(mapa, 'id')]);
  }

  protected abrirEmpreita(empreita: Record<string, unknown>): void {
    const obraId = this.campo(empreita, 'obra_id');
    if (obraId === '—') return;
    void this.router.navigate(['/obras', obraId, 'empreitas', this.campo(empreita, 'id')]);
  }

  // ---- Popups ----
  /** `{ tipo, refId, titulo }` do popup "pagamentos vinculados" aberto (Mapas/Empreitas) — `null` = fechado. */
  protected readonly popupPagamentosVinculados = signal<{
    tipo: 'mapa' | 'empreita';
    refId: string;
    titulo: string;
  } | null>(null);

  /** `{ tipo, id }` do popup de anexos aberto (Pagamentos/Recebimentos) — `null` = fechado. */
  protected readonly popupAnexos = signal<{ tipo: 'pagamento' | 'recebimento'; id: string } | null>(null);

  /** Quantas obras em aberto entram nos blocos que não têm lista geral (Relatórios). */
  private readonly LIMITE = 5;

  /** Obras em aberto que alimentam o bloco de Medição (não existe lista geral de medições, cada obra é uma chamada). */
  private readonly LIMITE_OBRAS_MEDICAO = 20;

  /** Compromissos da agenda: de 30 dias atrás a 90 dias à frente. */
  private readonly DIAS_AGENDA_ATRAS = 30;
  private readonly DIAS_AGENDA_FRENTE = 90;

  ngOnInit(): void {
    this.carregarObrasEIndicadores();
    this.carregarAssinatura();
    this.carregarMapas();
    this.carregarEmpreitas();
    this.carregarPagamentos();
    this.carregarRecebimentos();
    this.carregarDiarias();
    this.carregarEquipamentos();
    this.carregarAgenda();
  }

  /** Mais recentes primeiro (data decrescente; sem data vai pro fim) — a ordem original da API é o desempate. */
  private maisRecentesPrimeiro<T>(lista: readonly T[], dataDe: (item: T) => unknown): T[] {
    const texto = (item: T) => String(dataDe(item) ?? '');
    return lista
      .map((item, posicao) => ({ item, posicao }))
      .sort((a, b) => {
        const da = texto(a.item);
        const db = texto(b.item);
        if (da === db) return a.posicao - b.posicao;
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      })
      .map(({ item }) => item);
  }

  private carregarObrasEIndicadores(): void {
    this.api.listarObras().subscribe({
      next: (obras) => {
        // `status` é o campo de verdade pro andamento da obra (03/08/2026)
        // — antes disso o dashboard usava `is_confirmed` (que é só sobre a
        // EAP/orçamento estar travado) como se fosse "obra finalizada",
        // o que é enganoso: uma obra pode ter a EAP confirmada e ainda
        // estar em andamento, ou nem ter começado.
        const emAndamento = obras.filter((o) => o.status === 'em_andamento').length;
        const finalizadas = obras.filter((o) => o.status === 'finalizada').length;

        this.obrasEmAndamento.set(emAndamento);
        this.obrasFinalizadas.set(finalizadas);
        this.obrasTotais.set(obras.length);

        // Relatórios/Medição não têm endpoint global — usam as mesmas
        // primeiras N obras em aberto (mesmo recorte que "Obras em
        // aberto" já usava antes de sair do dashboard).
        const emAberto = obras.filter((o) => o.status !== 'cancelada' && o.status !== 'finalizada');
        this.carregarRelatorios(emAberto.slice(0, this.LIMITE));
        this.carregarMedicoes(emAberto.slice(0, this.LIMITE_OBRAS_MEDICAO));
        // RDO guarda só o id da obra — o nome vem desta lista.
        this.carregarRdos(obras);
      },
      error: () => {
        this.carregandoRelatorios.set(false);
        this.blocoMedicoes.carregando.set(false);
        this.blocoRdos.carregando.set(false);
      },
    });
  }

  private carregarAssinatura(): void {
    this.api.obterUsuarioAtual().subscribe({
      next: ({ user }) => {
        const empresa = dadosDaEmpresa(user);
        if (!empresa) return;

        const status = String(empresa.assinatura_status ?? '').toLowerCase();

        if (status === 'trial') {
          const dias = diasRestantes(empresa.assinatura_valida_ate);
          this.assinatura.set('Teste');
          this.assinaturaNota.set(
            dias !== null ? `${Math.max(dias, 0)} dias restantes` : 'período de teste',
          );
          return;
        }

        this.assinatura.set(status === 'ativa' ? 'Ativa' : (empresa.assinatura_status ?? '—'));
        if (empresa.assinatura_valida_ate) {
          this.assinaturaNota.set(`renova em ${formatarData(empresa.assinatura_valida_ate)}`);
        }
      },
      error: () => undefined,
    });
  }

  private carregarMapas(): void {
    this.api.listarMapas().subscribe({
      next: (mapas) => {
        // Data de início = criação do mapa (mesma coluna "Início" da página de Mapas).
        this.blocoMapas.itens.set(this.maisRecentesPrimeiro(mapas, (m) => m['created_at']));
        this.blocoMapas.carregando.set(false);
      },
      error: () => this.blocoMapas.carregando.set(false),
    });
  }

  /**
   * Empreitas + Total/Pago/Saldo (14/09/2026) — mesma fórmula já
   * confirmada com o Lucas em `EmpreitasObra` (24/08 e 06/09/2026):
   * Total = soma do contrato (Empreiteiro + Reserva) de cada item via
   * `/empreitas/resumo`; Pago = pagamentos confirmados vinculados;
   * Saldo = Total − Pago − Pendente. Como o card cruza várias obras,
   * busca o resumo de contrato uma vez por obra DISTINTA entre as
   * empreitas, em vez de uma vez só (que só funciona dentro de uma obra).
   * 15/10/2026: passou a valer pra TODAS as empreitas (o bloco agora tem
   * "Ver mais"), não só as 5 primeiras.
   */
  private carregarEmpreitas(): void {
    this.api.listarEmpreitas().subscribe({
      next: (todas) => {
        const empreitas = this.maisRecentesPrimeiro(todas, (e) => e['created_at']);
        this.blocoEmpreitas.itens.set(empreitas);

        const obraIds = [...new Set(empreitas.map((e) => String(e['obra_id'] ?? '')).filter(Boolean))];
        const resumosPorObra$ = obraIds.length
          ? forkJoin(
              obraIds.map((obraId) =>
                this.api.obterResumoContratoEmpreitas(obraId).pipe(catchError(() => of([]))),
              ),
            )
          : of([]);

        forkJoin({
          resumos: resumosPorObra$,
          pagamentos: this.api
            .listarPagamentos({ origemTipo: 'empreita' })
            .pipe(catchError(() => of([]))),
        }).subscribe(({ resumos, pagamentos }) => {
          const totalPorEmpreita = new Map<string, number>();
          for (const listaResumo of resumos) {
            for (const resumo of listaResumo) {
              const soma = resumo.itens.reduce((s, it) => s + (it.contratoEmp || 0) + (it.contratoReserva || 0), 0);
              totalPorEmpreita.set(resumo.id, soma);
            }
          }

          const pagoPorEmpreita = new Map<string, number>();
          const pendentePorEmpreita = new Map<string, number>();
          for (const bruto of pagamentos) {
            const pagamento = normalizarPagamento(bruto as Record<string, unknown>);
            const empreitaId = pagamento.origem?.refId;
            if (!empreitaId) continue;
            const alvo = pagamento.status === 'pendente' ? pendentePorEmpreita : pagoPorEmpreita;
            alvo.set(empreitaId, (alvo.get(empreitaId) ?? 0) + calcularSomaItens(pagamento));
          }

          const totais = new Map<string, TotaisEmpreita>();
          for (const empreita of empreitas) {
            const id = String(empreita['id']);
            const total = totalPorEmpreita.get(id) ?? 0;
            const pago = pagoPorEmpreita.get(id) ?? 0;
            const pendente = pendentePorEmpreita.get(id) ?? 0;
            totais.set(id, { total, pago, saldo: total - pago - pendente });
          }
          this.totaisPorEmpreita.set(totais);
          this.blocoEmpreitas.carregando.set(false);
        });
      },
      error: () => this.blocoEmpreitas.carregando.set(false),
    });
  }

  private carregarPagamentos(): void {
    this.api.listarPagamentos().subscribe({
      next: (pagamentos) => {
        const lista = pagamentos.map((p) => normalizarPagamento(p as Record<string, unknown>));
        // Últimos lançamentos primeiro: data de solicitação decrescente (pedido do Lucas, 15/10/2026).
        this.blocoPagamentos.itens.set(this.maisRecentesPrimeiro(lista, (p) => p.dataSolicitacao));
        this.blocoPagamentos.carregando.set(false);
      },
      error: () => this.blocoPagamentos.carregando.set(false),
    });
  }

  private carregarRecebimentos(): void {
    this.api.listarRecebimentos().subscribe({
      next: (recebimentos) => {
        const lista = recebimentos.map((r) => normalizarRecebimento(r as Record<string, unknown>));
        this.blocoRecebimentos.itens.set(this.maisRecentesPrimeiro(lista, (r) => r.dataSolicitacao));
        this.blocoRecebimentos.carregando.set(false);
      },
      error: () => this.blocoRecebimentos.carregando.set(false),
    });
  }

  /**
   * Diário de obra (15/10/2026) — os últimos RDOs de todas as obras (até 100,
   * o teto do endpoint), do mais recente pro mais antigo. O RDO só traz o id
   * da obra; o nome vem da lista de obras já carregada.
   */
  private carregarRdos(obras: Obra[]): void {
    const nomes = new Map(obras.map((o) => [o.id, o.obra_nome || '(sem nome)']));

    this.rdoService.listar(undefined, 100).subscribe({
      next: (lista: RdoRegistro[]) => {
        const linhas: LinhaRdo[] = lista.map((r) => ({
          id: r.id,
          obraId: r.obra_id,
          obraNome: nomes.get(r.obra_id) ?? '(sem nome)',
          numero: r.numero,
          data: r.data,
          status: r.status,
          tarefas: Array.isArray(r.tarefas) ? r.tarefas.length : 0,
          fotos: Array.isArray(r.fotos) ? r.fotos.length : 0,
        }));
        this.blocoRdos.itens.set(this.maisRecentesPrimeiro(linhas, (r) => r.data));
        this.blocoRdos.carregando.set(false);
      },
      error: () => this.blocoRdos.carregando.set(false),
    });
  }

  /** Diárias (15/10/2026) — lista geral (`GET /diarias`), mais recentes primeiro. */
  private carregarDiarias(): void {
    this.api.listarDiariasGeral().subscribe({
      next: (lista) => {
        const linhas: LinhaDiaria[] = lista.map((bruto) => {
          const d = bruto as unknown as Diaria & { obraNome?: string };
          return {
            id: d.id,
            obraId: d.obraId,
            obraNome: d.obraNome || '(sem nome)',
            profissional: d.profissionalNome || '—',
            funcao: d.profissionalFuncao || '',
            data: d.data,
            meia: !!d.meiaDiaria,
            valor: valorTotalDiaria(d),
            status: d.status,
          };
        });
        this.blocoDiarias.itens.set(this.maisRecentesPrimeiro(linhas, (d) => d.data));
        this.blocoDiarias.carregando.set(false);
      },
      error: () => this.blocoDiarias.carregando.set(false),
    });
  }

  /** Equipamentos (15/10/2026) — contratos de todas as obras, entrega mais recente primeiro. */
  private carregarEquipamentos(): void {
    this.contratosEquipamentos.listarGeral().subscribe({
      next: (lista) => {
        this.blocoEquipamentos.itens.set(this.maisRecentesPrimeiro(lista, (c) => c.data_entrega));
        this.blocoEquipamentos.carregando.set(false);
      },
      error: () => this.blocoEquipamentos.carregando.set(false),
    });
  }

  /**
   * Agenda (15/10/2026) — compromissos de 30 dias atrás a 90 à frente. Diferente
   * dos outros blocos: o que importa é o que vem aí, então os próximos aparecem
   * primeiro (do mais perto pro mais longe) e os passados depois (do mais
   * recente pro mais antigo).
   */
  private carregarAgenda(): void {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - this.DIAS_AGENDA_ATRAS);
    const fim = new Date(hoje);
    fim.setDate(fim.getDate() + this.DIAS_AGENDA_FRENTE);

    this.api.listarAgenda(isoLocal(inicio), isoLocal(fim)).subscribe({
      next: (eventos) => {
        const agora = this.agoraLocal();
        const proximos = eventos.filter((e) => e.fim >= agora).sort((a, b) => a.inicio.localeCompare(b.inicio));
        const passados = eventos.filter((e) => e.fim < agora).sort((a, b) => b.inicio.localeCompare(a.inicio));
        this.blocoAgenda.itens.set([...proximos, ...passados]);
        this.blocoAgenda.carregando.set(false);
      },
      error: () => this.blocoAgenda.carregando.set(false),
    });
  }

  protected abrirRdo(linha: LinhaRdo): void {
    void this.router.navigate(['/obras', linha.obraId, 'rdo', linha.id]);
  }

  protected abrirDiarias(linha: LinhaDiaria): void {
    void this.router.navigate(['/obras', linha.obraId, 'diarias']);
  }

  protected abrirEquipamento(contrato: LinhaEquipamento): void {
    if (!contrato.obra_id) return;
    void this.router.navigate(['/obras', contrato.obra_id, 'contratos-equipamentos']);
  }

  /** `AAAA-MM-DDTHH:mm` → `HH:mm`. */
  protected horaDe(iso: string): string {
    return iso.length >= 16 ? iso.slice(11, 16) : '';
  }

  /** Não existe `GET` global de medições — busca por obra (até `LIMITE_OBRAS_MEDICAO` obras em aberto) e junta. */
  private carregarMedicoes(obras: Obra[]): void {
    if (!obras.length) {
      this.blocoMedicoes.itens.set([]);
      this.blocoMedicoes.carregando.set(false);
      return;
    }

    forkJoin(
      obras.map((obra) =>
        this.api.listarMedicoes(obra.id).pipe(
          map((lista) =>
            lista.map((m) => ({
              id: m.id,
              obraId: obra.id,
              obraNome: obra.obra_nome || '(sem nome)',
              sequencia: m.sequencia,
              dataMedicao: m.dataMedicao,
              status: m.status,
            })),
          ),
          catchError(() => of([] as LinhaMedicao[])),
        ),
      ),
    ).subscribe((porObra) => {
      this.blocoMedicoes.itens.set(this.maisRecentesPrimeiro(porObra.flat(), (m) => m.dataMedicao));
      this.blocoMedicoes.carregando.set(false);
    });
  }

  /**
   * Orçado (EAP) x Realizado (pagamentos confirmados) x Medido (última
   * medição aprovada), por categoria — mesma lógica de
   * `relatorios.ts` (a tela de Relatórios de UMA obra), rodada aqui pra
   * cada obra do recorte. "Medido" é novo (14/09/2026, decisão do
   * Lucas): valor de cada item na última medição APROVADA, convertido
   * de "% acumulado" pra R$ usando o orçado daquele item (mesma
   * conversão de `medicao-engine.ts::pctParaValor`, já usada na tela de
   * Medição) — não existia antes um "Medido" agregado por categoria em
   * lugar nenhum do sistema.
   */
  private carregarRelatorios(obras: Obra[]): void {
    if (!obras.length) {
      this.relatorios.set([]);
      this.carregandoRelatorios.set(false);
      return;
    }

    forkJoin(obras.map((obra) => this.montarLinhaRelatorio(obra))).subscribe((linhas) => {
      this.relatorios.set(linhas);
      this.carregandoRelatorios.set(false);
    });
  }

  /**
   * Orçado x Realizado x Saldo x Medido, por categoria E por "adicional"
   * (14/09/2026, mockup do Lucas com os botões "Detalhar" e "Segmentar
   * adicionais"): cada item da EAP já tem um `adicional: boolean` de
   * verdade ("Serviço adicional, fora do escopo original") — junta tudo
   * em dois baldes, `semAdicionais`/`somenteAdicionais`, e soma os dois
   * pra formar `geral` (usado quando "Segmentar adicionais" tá
   * desligado). Pagamento e Medição não têm esse flag direto — só dá
   * pra saber olhando de qual item da EAP aquele lançamento veio
   * (`item.eapId`/`item.eapItemId`), por isso os mapas
   * `indicePorEapId`/`itensEap` são a fonte de verdade dos dois.
   */
  private montarLinhaRelatorio(obra: Obra): Observable<LinhaRelatorio> {
    return forkJoin({
      eap: this.api.obterEap(obra.id).pipe(catchError(() => of(null))),
      pagamentos: this.api.listarPagamentos({ obraId: obra.id }).pipe(catchError(() => of([]))),
      medicoes: this.api.listarMedicoes(obra.id).pipe(catchError(() => of([]))),
    }).pipe(
      switchMap(({ eap, pagamentos, medicoes }) => {
        const itensEap = Array.isArray(eap?.eapItems)
          ? aplicarNumeracaoAutomatica(eap!.eapItems.map((i) => normalizarItemEap(i as Record<string, unknown>)))
          : ([] as ItemEap[]);
        const cabecalho: CabecalhoObra = eap ? normalizarCabecalho(eap.header) : cabecalhoVazio();
        const cache = calcularCacheOrcado(itensEap, cabecalho);
        const indicePorEapId = new Map(itensEap.map((item, i) => [item.id, i]));

        const semAdicionais = mapaDeColunasZerado();
        const somenteAdicionais = mapaDeColunasZerado();
        const balde = (adicional: boolean) => (adicional ? somenteAdicionais : semAdicionais);

        // Orçado — soma direto do cache por item (grupos contribuem 0,
        // já são a soma dos filhos, ver `calcularCacheOrcado`), then
        // bucketed por `item.adicional`.
        for (let i = 0; i < itensEap.length; i++) {
          const item = itensEap[i];
          const alvo = balde(item.adicional);
          for (const t of TIPOS_CUSTO) {
            const valor = (cache.directByType[i]?.[t.chave] ?? 0) + (cache.bdiByType[i]?.[t.chave] ?? 0);
            const chave = baldeCategoria(t.chave);
            alvo[chave].orcado += valor;
            alvo['total'].orcado += valor;
          }
        }

        // Realizado — só pagamentos confirmados; item sem `eapId`
        // reconhecido (lançamento manual/legado) cai em "sem adicionais"
        // por padrão, pra não sumir da soma.
        const listaPagamentos = pagamentos
          .map((p) => normalizarPagamento(p as Record<string, unknown>))
          .filter((p) => p.status !== 'pendente');
        for (const pagamento of listaPagamentos) {
          for (const item of pagamento.itens) {
            const valor =
              item.modoValor === 'percentual'
                ? pagamento.valorTotal * ((Number(item.valor) || 0) / 100)
                : Number(item.valor) || 0;
            const indice = item.eapId ? indicePorEapId.get(item.eapId) : undefined;
            const adicional = indice !== undefined ? itensEap[indice].adicional : false;
            const chave = baldeCategoria(item.tipo);
            balde(adicional)[chave].realizado += valor;
            balde(adicional)['total'].realizado += valor;
          }
        }

        // Orçado por item (mesmo índice de `itensEap`) — necessário pra
        // converter o "% medido" de cada item em R$. Lê o snapshot
        // congelado quando existe (mesma regra de
        // `medicao.store.ts::orcadoPorItem` — item medido é sempre um
        // item-base, nunca um grupo, então não precisa replicar a
        // ramificação de grupo daquele arquivo).
        const orcadoPorItem = itensEap.map((item, i) => {
          if (item.orcadoCongelado) return item.orcadoCongelado as Record<ChaveTipo, number>;
          const total: Record<ChaveTipo, number> = {} as Record<ChaveTipo, number>;
          for (const t of TIPOS_CUSTO) {
            total[t.chave] = (cache.directByType[i]?.[t.chave] ?? 0) + (cache.bdiByType[i]?.[t.chave] ?? 0);
          }
          return total;
        });

        const montarMedido = (payload: MedicaoPayload) => {
          for (const item of payload.itens) {
            const indice = indicePorEapId.get(item.eapItemId);
            if (indice === undefined) continue;
            const adicional = itensEap[indice].adicional;
            for (const t of TIPOS_CUSTO) {
              const pct = item.valores[t.chave]?.valor;
              if (!pct) continue;
              const valor = pctParaValor(pct, orcadoPorItem[indice][t.chave] ?? 0);
              const chave = baldeCategoria(t.chave);
              balde(adicional)[chave].medido += valor;
              balde(adicional)['total'].medido += valor;
            }
          }
        };

        const linhaBase: LinhaRelatorio = {
          obraId: obra.id,
          obraNumber: obra.map_number || '',
          obraNome: obra.obra_nome || '(sem nome)',
          cliente: obra.cliente || '—',
          dataBase: obra.data_base ? formatarData(obra.data_base) : '—',
          statusObra: rotuloStatusObra(obra.status),
          statusEap: obra.is_confirmed ? 'Confirmada' : 'Aberta',
          semAdicionais,
          somenteAdicionais,
          geral: mapaDeColunasZerado(),
        };

        const ultimaAprovada = medicoes
          .filter((m) => m.status === 'aprovada')
          .sort((a, b) => (b.dataMedicao ?? '').localeCompare(a.dataMedicao ?? ''))[0];

        if (!ultimaAprovada) {
          return of(this.fecharLinha(linhaBase));
        }

        return this.api.obterMedicao(ultimaAprovada.id).pipe(
          catchError(() => of(null)),
          map((payload) => {
            if (payload) montarMedido(payload);
            return this.fecharLinha(linhaBase);
          }),
        );
      }),
    );
  }

  /** Fecha o Saldo (Orçado − Realizado) de cada balde e soma os dois baldes em `geral`. */
  private fecharLinha(linha: LinhaRelatorio): LinhaRelatorio {
    for (const chave of COLUNAS_RELATORIO) {
      linha.semAdicionais[chave].saldo = linha.semAdicionais[chave].orcado - linha.semAdicionais[chave].realizado;
      linha.somenteAdicionais[chave].saldo =
        linha.somenteAdicionais[chave].orcado - linha.somenteAdicionais[chave].realizado;

      linha.geral[chave] = {
        orcado: linha.semAdicionais[chave].orcado + linha.somenteAdicionais[chave].orcado,
        realizado: linha.semAdicionais[chave].realizado + linha.somenteAdicionais[chave].realizado,
        saldo: linha.semAdicionais[chave].saldo + linha.somenteAdicionais[chave].saldo,
        medido: linha.semAdicionais[chave].medido + linha.somenteAdicionais[chave].medido,
      };
    }
    return linha;
  }

  /** Percentual de uma métrica em relação ao Orçado do mesmo balde/categoria — "Orçado" sempre dá 100%. */
  protected pct(m: Metricas, campo: keyof Metricas): number {
    return m.orcado > 0 ? (m[campo] / m.orcado) * 100 : 0;
  }

  protected formatarPercentual(valor: number): string {
    return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  /** Ordem fixa Orçado → Realizado → Saldo → Medido (mockup do Lucas, 14/09/2026). */
  protected readonly ordemMetricas: ReadonlyArray<{ campo: keyof Metricas; rotulo: string }> = [
    { campo: 'orcado', rotulo: 'Orçado' },
    { campo: 'realizado', rotulo: 'Realizado' },
    { campo: 'saldo', rotulo: 'Saldo' },
    { campo: 'medido', rotulo: 'Medido' },
  ];

  /**
   * Uma "banda" da linha: 1 banda ("Geral") quando "Segmentar
   * adicionais" tá desligado, 2 quando ligado (Sem adicionais /
   * Somente adicionais, a segunda destacada). Cada banda carrega o
   * mapa de todas as colunas (categorias + total) — `colunasParaExibir()`
   * decide quais delas de fato aparecem.
   */
  protected bandasDetalhe(
    linha: LinhaRelatorio,
  ): Array<{ rotulo: string; dados: Record<ChaveColuna, Metricas>; destaque: boolean }> {
    if (!this.segmentarAdicionais()) {
      return [{ rotulo: 'Geral', dados: linha.geral, destaque: false }];
    }
    return [
      { rotulo: 'Sem adicionais', dados: linha.semAdicionais, destaque: false },
      { rotulo: 'Somente adicionais', dados: linha.somenteAdicionais, destaque: true },
    ];
  }

  /**
   * "Detalhar" (14/09/2026, redesenho depois dos 4 mockups definitivos
   * do Lucas) não muda a estrutura da linha — só troca quais colunas
   * aparecem depois do rótulo das métricas: sem Detalhar é só "Total";
   * com Detalhar entra uma coluna por categoria antes do Total.
   */
  protected colunasParaExibir(): ReadonlyArray<{ chave: ChaveColuna; rotulo: string }> {
    const total = { chave: 'total' as const, rotulo: 'Total' };
    return this.detalharRelatorios() ? [...CATEGORIAS_RELATORIO, total] : [total];
  }

  // ---- Popups ----
  protected abrirPagamentosVinculados(tipo: 'mapa' | 'empreita', refId: string, titulo: string): void {
    this.popupPagamentosVinculados.set({ tipo, refId, titulo });
  }

  protected fecharPagamentosVinculados(): void {
    this.popupPagamentosVinculados.set(null);
  }

  protected abrirAnexos(tipo: 'pagamento' | 'recebimento', id: string): void {
    this.popupAnexos.set({ tipo, id });
  }

  protected fecharAnexos(): void {
    this.popupAnexos.set(null);
  }

  // ---- Leitura tolerante dos campos (snake_case novo / camelCase antigo) ----
  protected campo(registro: Record<string, unknown>, ...chaves: string[]): string {
    for (const chave of chaves) {
      const valor = registro?.[chave];
      if (valor !== undefined && valor !== null && valor !== '') return String(valor);
    }
    return '—';
  }

  protected numero(registro: Record<string, unknown>, ...chaves: string[]): number {
    for (const chave of chaves) {
      const valor = registro?.[chave];
      if (typeof valor === 'number') return valor;
    }
    return 0;
  }

  /** "Status do mapa" do mockup — o Mapa não tem `status` de verdade, só `is_confirmed`. */
  protected statusMapa(mapa: Record<string, unknown>): string {
    return mapa['is_confirmed'] ? 'Finalizado' : 'Em aberto';
  }

  /** Mesma leitura tolerante de `campo()`, mas formatando como data (ou '—' se nenhuma existir/for inválida). */
  protected dataDe(registro: Record<string, unknown>, ...chaves: string[]): string {
    for (const chave of chaves) {
      const valor = registro?.[chave];
      if (valor !== undefined && valor !== null && valor !== '') return formatarData(String(valor));
    }
    return '—';
  }
}
