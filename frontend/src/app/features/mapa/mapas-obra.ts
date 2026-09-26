import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';

import { Mapa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { normalizarPagamento, paraPayloadApi } from '../pagamentos/pagamentos-calc';
import { EditarPagamentoModal, EventoSalvarPagamento } from '../pagamentos/editar-pagamento-modal/editar-pagamento-modal';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';
import { dataDentroDoIntervalo, valoresDistintos } from '../../shared/filtros/filtros';
import { AcoesPagamento, aplicarAlteracaoEmMapa } from '../../shared/pagamentos-vinculados-popup/acoes-pagamento';
import { BarraSelecao, AcaoLista } from '../../shared/barra-selecao/barra-selecao';
import {
  SelecaoMultipla,
  avisarFalhasDeExclusao,
  confirmarExclusaoEmLote,
  copiarParaAreaDeTransferencia,
  excluirEmLote,
} from '../../shared/selecao-lista/selecao-lista';
import { proximoNumeroMapa } from './mapa-numero';

type ColunaMapaObra =
  | 'codigo'
  | 'numero'
  | 'descricao'
  | 'status'
  | 'inicio'
  | 'finalizacao'
  | 'responsavelMapa'
  | 'total'
  | 'pagamentos';

/**
 * Lista de mapas de UMA obra, com criação de mapas novos.
 *
 * Substitui, dentro da obra, o antigo editor único de mapa (que
 * assumia "1 mapa por obra" e persistia na ponte chave-valor). Agora uma
 * obra pode ter vários mapas nomeados — cada um é um registro de verdade
 * em `/mapas`, e esta tela é o índice deles (task "várias por obra",
 * 31/07/2026).
 */
@Component({
  selector: 'app-mapas-obra',
  imports: [ReactiveFormsModule, RedimensionarColunas, EditarPagamentoModal, BarraSelecao],
  templateUrl: './mapas-obra.html',
  styleUrl: './mapas-obra.scss',
})
export class MapasObra implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly mapas = signal<Mapa[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarData = formatarData;
  protected readonly formatarMoeda = formatarMoeda;

  protected readonly formularioAberto = signal(false);
  protected readonly salvando = signal(false);

  protected readonly formulario = this.fb.nonNullable.group({
    numeroMapa: [''],
    descricao: ['', [Validators.required]],
    responsavelObra: [''],
    responsavelMapa: ['', [Validators.required]],
  });

  /**
   * Responsável cadastrado na própria obra — fonte do preenchimento
   * automático de "Responsável da obra" ao criar um mapa (20/08/2026,
   * pedido do Lucas): antes era digitado à mão a cada mapa novo, agora
   * vem direto do cadastro da obra, sem repetir digitação nem risco de
   * inconsistência entre mapas da mesma obra.
   */
  private readonly obraResponsavel = signal('');

  ngOnInit(): void {
    this.carregar();
    this.api.obterObra(this.obraId()).subscribe({
      next: (obra) => this.obraResponsavel.set(obra.responsavel ?? ''),
      error: () => {},
    });
  }

  /**
   * Pagamentos gerados a partir de cada mapa desta obra —
   * `mapaId -> Pagamento[]`. Alimenta a coluna "Pagtos." (contagem +
   * popup com a lista), no mesmo padrão da lista geral de Mapas. Até
   * 19/08/2026 também alimentava o "Total" (soma dos pagamentos já
   * gerados) — trocado pra `total_mapa` (ver `total()`), mesma correção
   * já feita na lista geral em 16/08: um mapa sem "Gerar Pagamento" ainda
   * ficava com Total zerado mesmo tendo itens e preços preenchidos.
   */
  protected readonly pagamentosPorMapa = signal<Map<string, Pagamento[]>>(new Map());

  /** Mapa cujo popup de pagamentos está aberto — null quando fechado. */
  protected readonly popupMapa = signal<Mapa | null>(null);

  /**
   * Pagamento aberto no popup de "lançamento" (06/09/2026, corrige bug:
   * clicar em "Ver" num pagamento vinculado ao mapa só fechava o popup e
   * navegava pra lista geral de Pagamentos da obra, ignorando qual
   * pagamento tinha sido clicado). `null` = fechado. Reaproveita o MESMO
   * `EditarPagamentoModal` de `Pagamentos` — sem precisar do
   * `PagamentosStore` (obra-scoped, só existe dentro da tela de
   * Pagamentos): salvar aqui chama `ApiService.atualizarPagamento`
   * direto, com a mesma função pura (`paraPayloadApi`) que o store usa.
   */
  private readonly acoesPagamento = new AcoesPagamento(
    this.api,
    (alteracao) => this.pagamentosPorMapa.update((mapa) => aplicarAlteracaoEmMapa(mapa, alteracao)),
    () => this.obraId(),
  );
  protected readonly pagamentoEmEdicao = this.acoesPagamento.emEdicao;

  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaMapaObra> | null>(null);
  protected readonly setaOrdenacao = setaOrdenacao;
  protected readonly busca = signal('');

  /** Filtro por período de finalização — mesmo padrão da lista geral de Mapas (19/08/2026). */
  protected readonly filtroFinalizacaoDe = signal('');
  protected readonly filtroFinalizacaoAte = signal('');

  /** Filtros novos (20/08/2026, pedido do Lucas) — Status, Início e Responsável da cotação. */
  protected readonly filtroStatus = signal<'' | 'em_edicao' | 'finalizado'>('');
  protected readonly filtroInicioDe = signal('');
  protected readonly filtroInicioAte = signal('');
  protected readonly filtroResponsavel = signal('');

  protected readonly responsaveisDisponiveis = computed(() =>
    valoresDistintos(this.mapas(), (mapa) => this.responsavelCotacao(mapa)),
  );

  protected alternarOrdenacaoColuna(coluna: ColunaMapaObra): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroFinalizacaoDe(evento: Event): void {
    this.filtroFinalizacaoDe.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroFinalizacaoAte(evento: Event): void {
    this.filtroFinalizacaoAte.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroStatus(evento: Event): void {
    this.filtroStatus.set((evento.target as HTMLSelectElement).value as '' | 'em_edicao' | 'finalizado');
  }

  protected mudarFiltroInicioDe(evento: Event): void {
    this.filtroInicioDe.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroInicioAte(evento: Event): void {
    this.filtroInicioAte.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroResponsavel(evento: Event): void {
    this.filtroResponsavel.set((evento.target as HTMLSelectElement).value);
  }

  protected readonly listaOrdenada = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const de = this.filtroFinalizacaoDe();
    const ate = this.filtroFinalizacaoAte();
    const status = this.filtroStatus();
    const inicioDe = this.filtroInicioDe();
    const inicioAte = this.filtroInicioAte();
    const responsavel = this.filtroResponsavel();

    const filtrada = this.mapas().filter((mapa) => {
      if (!dataDentroDoIntervalo(mapa['confirmed_at'] as string | null, de, ate)) return false;
      if (!dataDentroDoIntervalo(mapa['created_at'] as string | null, inicioDe, inicioAte)) return false;
      if (status === 'finalizado' && !mapa['is_confirmed']) return false;
      if (status === 'em_edicao' && mapa['is_confirmed']) return false;
      if (responsavel && this.responsavelCotacao(mapa) !== responsavel) return false;
      if (!termo) return true;
      return [this.numero(mapa), this.descricao(mapa)].join(' ').toLowerCase().includes(termo);
    });

    return ordenarPor(filtrada, this.ordenacao(), (mapa, coluna) => {
      switch (coluna) {
        case 'codigo': return this.codigo(mapa);
        case 'numero': return this.numero(mapa);
        case 'descricao': return this.descricao(mapa);
        case 'status': return this.statusMapa(mapa);
        case 'inicio': return mapa['created_at'] as string | null;
        case 'finalizacao': return mapa['confirmed_at'] as string | null;
        case 'responsavelMapa': return this.responsavelCotacao(mapa);
        case 'total': return this.total(mapa);
        case 'pagamentos': return this.quantidadePagamentos(mapa);
      }
    });
  });

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarMapas(this.obraId()).subscribe({
      next: (mapas) => {
        this.mapas.set(mapas);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os mapas.');
        this.carregando.set(false);
      },
    });

    this.api
      .listarPagamentos({ obraId: this.obraId() })
      .pipe(catchError(() => of([])))
      .subscribe((lista) => {
        const porMapa = new Map<string, Pagamento[]>();
        for (const bruto of lista) {
          const pagamento = normalizarPagamento(bruto as Record<string, unknown>);
          const origem = pagamento.origem;
          if (origem?.tipo !== 'mapa' || !origem.refId) continue;
          const atual = porMapa.get(origem.refId) ?? [];
          atual.push(pagamento);
          porMapa.set(origem.refId, atual);
        }
        this.pagamentosPorMapa.set(porMapa);
      });
  }

  protected codigo(mapa: Mapa): string {
    return String(mapa['codigo'] ?? '—');
  }

  protected numero(mapa: Mapa): string {
    return String(mapa['numero_mapa'] ?? '—');
  }

  protected descricao(mapa: Mapa): string {
    return String(mapa['descricao'] ?? '—');
  }

  /** "Finalizado"/"Em edição" — mesmo rótulo já usado no editor do mapa (mapa.html). */
  protected statusMapa(mapa: Mapa): string {
    return mapa['is_confirmed'] ? 'Finalizado' : 'Em edição';
  }

  /** Coluna "Início" — `created_at`, o mesmo timestamp que já alimenta "Início do mapa" no editor. */
  protected dataInicio(mapa: Mapa): string {
    const bruto = mapa['created_at'];
    return bruto ? formatarData(String(bruto)) : '—';
  }

  protected responsavelCotacao(mapa: Mapa): string {
    return String(mapa['responsavel_mapa'] ?? '—');
  }

  /**
   * Coluna "Finalização" — passou a ler `confirmed_at` (04/08/2026), o
   * timestamp automático de quando o mapa foi finalizado (botão
   * "Finalizar mapa" no editor). O antigo `data_finalizacao` era digitado
   * à mão e não tinha relação garantida com o mapa estar de fato pronto.
   */
  protected dataFinalizacao(mapa: Mapa): string {
    const bruto = mapa['confirmed_at'];
    return bruto ? formatarData(String(bruto)) : '—';
  }

  /**
   * Valor efetivo total do mapa — `total_mapa`, calculado e gravado pelo
   * editor a cada mudança. Mesma correção da lista geral de Mapas
   * (16/08/2026): somar só pagamentos já gerados deixava a coluna zerada
   * em qualquer mapa ainda sem "Gerar Pagamento".
   */
  protected total(mapa: Mapa): number {
    return Number(mapa['total_mapa']) || 0;
  }

  protected pagamentosDoMapa(mapa: Mapa): Pagamento[] {
    return this.pagamentosPorMapa().get(mapa.id) ?? [];
  }

  protected quantidadePagamentos(mapa: Mapa): number {
    return this.pagamentosDoMapa(mapa).length;
  }

  protected abrirPopupPagamentos(mapa: Mapa, evento: Event): void {
    evento.stopPropagation();
    if (!this.quantidadePagamentos(mapa)) return;
    this.popupMapa.set(mapa);
  }

  protected fecharPopupPagamentos(): void {
    this.popupMapa.set(null);
  }

  protected irParaPagamentos(): void {
    this.fecharPopupPagamentos();
    void this.router.navigate(['/obras', this.obraId(), 'pagamentos']);
  }

  protected abrirPagamento(pagamento: Pagamento): void {
    this.acoesPagamento.abrir(pagamento);
  }

  protected excluirPagamentoDoEditor(pagamento: Pagamento): void {
    this.acoesPagamento.excluirDoEditor(pagamento);
  }

  protected fecharPagamento(): void {
    this.acoesPagamento.fechar();
  }

  /**
   * `EventoSalvarPagamento.anexoNotaPendente` nunca vem preenchido aqui —
   * só existe pra pagamentos sendo CRIADOS (`modoNovo()`), e o popup do
   * Mapa só abre pagamentos que já existem (nunca cria um novo).
   */
  protected salvarPagamento(evento: EventoSalvarPagamento): void {
    this.acoesPagamento.salvar(evento);
  }

  /** Botões ✔ e ✖ de cada linha do popup (21/09/2026). */
  protected confirmarPagamento(pagamento: Pagamento): void {
    this.acoesPagamento.confirmar(pagamento);
  }

  protected excluirPagamento(pagamento: Pagamento): void {
    this.acoesPagamento.excluir(pagamento);
  }

  protected abrir(mapa: Mapa): void {
    void this.router.navigate(['/obras', this.obraId(), 'mapas', mapa.id]);
  }

  // ------------------------------------------------------------------
  // Formulário — Novo mapa
  // ------------------------------------------------------------------
  protected novo(): void {
    this.formulario.reset({
      numeroMapa: proximoNumeroMapa(this.mapas()),
      responsavelObra: this.obraResponsavel(),
    });
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

    // Cliente e datas não são mais digitados aqui (04/08/2026, pedido do
    // Lucas): o editor do mapa puxa o cliente automaticamente da obra
    // (`MapaStore.carregarObra`) e as datas de início/finalização são
    // preenchidas pelo próprio sistema (created_at / confirmed_at).
    const payload = {
      obra_id: this.obraId(),
      numero_mapa: v.numeroMapa.trim(),
      descricao: v.descricao.trim(),
      responsavel_obra: v.responsavelObra.trim(),
      responsavel_mapa: v.responsavelMapa.trim(),
      frete_particular: 0,
      modo_manual: false,
    };

    this.salvando.set(true);
    this.api.criarMapa(payload).subscribe({
      next: (mapa) => {
        this.salvando.set(false);
        this.fechar();
        this.router.navigate(['/obras', this.obraId(), 'mapas', mapa.id]);
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível criar o mapa.');
      },
    });
  }

  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  // ------------------------------------------------------------------
  // Seleção múltipla + "Copiar mensagem" pro WhatsApp (02/09/2026, pedido
  // do Lucas). Formato provisório — o Lucas vai mandar o padrão exato de
  // mensagem que quer; até lá, uma linha por mapa com os dados principais.
  // ------------------------------------------------------------------
  protected readonly selecao = new SelecaoMultipla<Mapa>((mapa) => mapa.id);

  // ---- Seleção (20/09/2026): clicar na linha abre o mapa; marcar habilita "Abrir" (com 1) e "Excluir". ----
  protected readonly selecionados = computed(() => this.selecao.selecionados(this.listaOrdenada()));
  protected readonly acoesLista: AcaoLista[] = [{ chave: 'excluir', rotulo: 'Excluir', perigo: true }];

  protected abrirSelecionado(): void {
    const [primeiro] = this.selecionados();
    if (primeiro) this.abrir(primeiro);
  }

  /** Botão ✖ da linha (21/09/2026): exclui só este mapa, com a confirmação de sempre. */
  protected removerUm(mapa: Mapa): void {
    if (!window.confirm(`Excluir o mapa "${this.descricao(mapa)}"?`)) return;

    this.api.excluirMapa(mapa.id).subscribe({
      next: () => this.mapas.update((lista) => lista.filter((m) => m.id !== mapa.id)),
      error: () => window.alert('Não foi possível excluir o mapa.'),
    });
  }

  protected aoAcaoLista(chave: string): void {
    if (chave !== 'excluir') return;
    const alvos = this.selecionados();
    if (
      !alvos.length ||
      !confirmarExclusaoEmLote(
        alvos.length,
        'mapa',
        'mapas',
        'Pagamentos já gerados a partir deles não são apagados.',
        alvos.map((m) => this.descricao(m) || this.numero(m)),
      )
    ) {
      return;
    }

    excluirEmLote(alvos, (mapa) => this.api.excluirMapa(mapa.id)).subscribe(({ excluidos, falhas }) => {
      const ids = new Set(excluidos.map((m) => m.id));
      this.mapas.update((lista) => lista.filter((m) => !ids.has(m.id)));
      this.selecao.limpar();
      avisarFalhasDeExclusao(falhas, 'mapa(s)', (m) => this.descricao(m) || this.numero(m));
    });
  }

  protected readonly copiado = signal(false);

  protected async copiarMensagem(): Promise<void> {
    const selecionados = this.selecao.selecionados(this.listaOrdenada());
    if (!selecionados.length) return;

    const linhas = selecionados.map(
      (mapa) => `• Nº ${this.numero(mapa)} — ${this.descricao(mapa)} — ${this.formatarMoeda(this.total(mapa))} — ${this.statusMapa(mapa)}`,
    );
    const totalGeral = selecionados.reduce((soma, mapa) => soma + this.total(mapa), 0);
    const mensagem = [
      `*Mapas (${selecionados.length})*`,
      ...linhas,
      '',
      `Total: ${this.formatarMoeda(totalGeral)}`,
    ].join('\n');

    const ok = await copiarParaAreaDeTransferencia(mensagem);
    if (!ok) {
      window.alert('Não foi possível copiar — copie manualmente o texto abaixo:\n\n' + mensagem);
      return;
    }
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2000);
  }
}
