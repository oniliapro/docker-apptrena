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
  imports: [RouterLink, PagamentosVinculadosPopup, AnexosLancamento, EditarPagamentoModal, EditarRecebimentoModal],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly formatarData = formatarData;
  protected readonly formatarMoeda = formatarMoeda;

  // ---- Indicadores ----
  protected readonly obrasEmAndamento = signal<string | number>('—');
  protected readonly obrasTotais = signal<number | null>(null);
  protected readonly obrasFinalizadas = signal<string | number>('—');
  protected readonly assinatura = signal('—');
  protected readonly assinaturaNota = signal('');

  // ---- Listas ----
  protected readonly mapas = signal<Mapa[]>([]);
  protected readonly empreitas = signal<Empreita[]>([]);
  protected readonly totaisPorEmpreita = signal<Map<string, TotaisEmpreita>>(new Map());
  protected readonly pagamentos = signal<Pagamento[]>([]);
  protected readonly recebimentos = signal<Recebimento[]>([]);
  protected readonly medicoes = signal<LinhaMedicao[]>([]);
  protected readonly relatorios = signal<LinhaRelatorio[]>([]);
  protected readonly detalharRelatorios = signal(false);
  protected readonly segmentarAdicionais = signal(false);

  protected readonly carregandoMapas = signal(true);
  protected readonly carregandoEmpreitas = signal(true);
  protected readonly carregandoPagamentos = signal(true);
  protected readonly carregandoRecebimentos = signal(true);
  protected readonly carregandoMedicoes = signal(true);
  protected readonly carregandoRelatorios = signal(true);

  // ---- Editar ao clicar num item dos cards (21/09/2026) ----
  private readonly acoesPagamento = new AcoesPagamento(this.api, (alteracao) =>
    this.pagamentos.update((lista) =>
      alteracao.tipo === 'excluido'
        ? lista.filter((p) => p.id !== alteracao.id)
        : lista.map((p) => (p.id === alteracao.pagamento.id ? { ...p, ...alteracao.pagamento } : p)),
    ),
  );
  protected readonly pagamentoEmEdicao = this.acoesPagamento.emEdicao;
  protected readonly snapshotEapPagamento = this.acoesPagamento.snapshotEap;

  private readonly acoesRecebimento = new AcoesRecebimento(this.api, (alteracao) =>
    this.recebimentos.update((lista) =>
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

  /** Quantos itens cada card mostra antes do "ver mais". */
  private readonly LIMITE = 5;

  ngOnInit(): void {
    this.carregarObrasEIndicadores();
    this.carregarAssinatura();
    this.carregarMapas();
    this.carregarEmpreitas();
    this.carregarPagamentos();
    this.carregarRecebimentos();
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
        const emAberto = obras
          .filter((o) => o.status !== 'cancelada' && o.status !== 'finalizada')
          .slice(0, this.LIMITE);
        this.carregarRelatorios(emAberto);
        this.carregarMedicoes(emAberto);
      },
      error: () => {
        this.carregandoRelatorios.set(false);
        this.carregandoMedicoes.set(false);
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
        this.mapas.set(mapas.slice(0, this.LIMITE));
        this.carregandoMapas.set(false);
      },
      error: () => this.carregandoMapas.set(false),
    });
  }

  /**
   * Empreitas + Total/Pago/Saldo (14/09/2026) — mesma fórmula já
   * confirmada com o Lucas em `EmpreitasObra` (24/08 e 06/09/2026):
   * Total = soma do contrato (Empreiteiro + Reserva) de cada item via
   * `/empreitas/resumo`; Pago = pagamentos confirmados vinculados;
   * Saldo = Total − Pago − Pendente. Como o card cruza várias obras,
   * busca o resumo de contrato uma vez por obra DISTINTA entre as
   * empreitas mostradas, em vez de uma vez só (que só funciona
   * dentro de uma obra).
   */
  private carregarEmpreitas(): void {
    this.api.listarEmpreitas().subscribe({
      next: (todas) => {
        const empreitas = todas.slice(0, this.LIMITE);
        this.empreitas.set(empreitas);

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
          this.carregandoEmpreitas.set(false);
        });
      },
      error: () => this.carregandoEmpreitas.set(false),
    });
  }

  private carregarPagamentos(): void {
    this.api.listarPagamentos().subscribe({
      next: (pagamentos) => {
        this.pagamentos.set(
          pagamentos.slice(0, this.LIMITE).map((p) => normalizarPagamento(p as Record<string, unknown>)),
        );
        this.carregandoPagamentos.set(false);
      },
      error: () => this.carregandoPagamentos.set(false),
    });
  }

  private carregarRecebimentos(): void {
    this.api.listarRecebimentos().subscribe({
      next: (recebimentos) => {
        this.recebimentos.set(
          recebimentos.slice(0, this.LIMITE).map((r) => normalizarRecebimento(r as Record<string, unknown>)),
        );
        this.carregandoRecebimentos.set(false);
      },
      error: () => this.carregandoRecebimentos.set(false),
    });
  }

  /** Não existe `GET` global de medições — busca por obra (mesmo recorte de obras do card Relatórios) e junta. */
  private carregarMedicoes(obras: Obra[]): void {
    if (!obras.length) {
      this.medicoes.set([]);
      this.carregandoMedicoes.set(false);
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
      const todas = porObra
        .flat()
        .sort((a, b) => (b.dataMedicao ?? '').localeCompare(a.dataMedicao ?? ''))
        .slice(0, this.LIMITE);
      this.medicoes.set(todas);
      this.carregandoMedicoes.set(false);
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
