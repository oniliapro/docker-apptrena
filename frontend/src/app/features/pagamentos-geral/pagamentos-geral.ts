import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Obra, Pagamento } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda, hojeIso } from '../../core/utils/formato';
import { exportarTabelaXlsx } from '../../shared/exportar-xlsx/exportar-xlsx';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { copiarParaAreaDeTransferencia, SelecaoMultipla } from '../../shared/selecao-lista/selecao-lista';
import { SeletorObra } from '../../shared/seletor-obra/seletor-obra';
import {
  gerarId,
  gerarNumeroPagamento,
  normalizarPagamento,
  paraPayloadApi,
} from '../pagamentos/pagamentos-calc';
import { Pagamento as PagamentoParaCriar } from '../pagamentos/pagamentos.models';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';
import { dataDentroDoIntervalo, valoresDistintos } from '../../shared/filtros/filtros';

type ColunaPagamentoGeral =
  | 'obra'
  | 'numero'
  | 'dataSolicitacao'
  | 'fornecedor'
  | 'descricao'
  | 'origem'
  | 'valorTotal'
  | 'status';

/**
 * Lista geral de Pagamentos — todos os lançamentos de todas as obras
 * (item 4, 03/08/2026). Só existe porque Pagamentos migrou pro endpoint
 * relacional `/api/pagamentos` no mesmo dia: antes disso cada obra tinha
 * sua própria chave-valor isolada, sem jeito de listar tudo junto.
 *
 * O "Ver" de cada linha não abre o pagamento em si (não existe uma
 * página própria pra isso), e sim a página que originou o lançamento —
 * exatamente o que foi pedido: o Mapa ou a Empreita que geraram o
 * pagamento automaticamente, ou a aba Pagamentos da obra para os
 * lançamentos manuais (onde ele já aparece na lista, pronto pra editar).
 */
@Component({
  selector: 'app-pagamentos-geral',
  imports: [RouterLink, RedimensionarColunas, ReactiveFormsModule, SeletorObra],
  templateUrl: './pagamentos-geral.html',
  styleUrl: './pagamentos-geral.scss',
})
export class PagamentosGeral implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly pagamentos = signal<Pagamento[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;

  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaPagamentoGeral> | null>(null);
  protected readonly setaOrdenacao = setaOrdenacao;
  protected readonly busca = signal('');
  protected readonly filtroStatus = signal<'todos' | 'pendente' | 'confirmado'>('todos');
  protected readonly filtroObra = signal('');
  protected readonly filtroOrigem = signal<'todos' | 'manual' | 'mapa' | 'empreita'>('todos');
  protected readonly filtroDataDe = signal('');
  protected readonly filtroDataAte = signal('');

  protected readonly obrasDisponiveis = computed(() =>
    valoresDistintos(this.pagamentos(), (p) => this.obraNumber(p)).filter((v) => v !== '—'),
  );

  protected alternarOrdenacaoColuna(coluna: ColunaPagamentoGeral): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroStatus(evento: Event): void {
    this.filtroStatus.set((evento.target as HTMLSelectElement).value as 'todos' | 'pendente' | 'confirmado');
  }

  protected mudarFiltroObra(evento: Event): void {
    this.filtroObra.set((evento.target as HTMLSelectElement).value);
  }

  protected mudarFiltroOrigem(evento: Event): void {
    this.filtroOrigem.set((evento.target as HTMLSelectElement).value as 'todos' | 'manual' | 'mapa' | 'empreita');
  }

  protected mudarFiltroDataDe(evento: Event): void {
    this.filtroDataDe.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroDataAte(evento: Event): void {
    this.filtroDataAte.set((evento.target as HTMLInputElement).value);
  }

  private readonly listaFiltrada = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const status = this.filtroStatus();
    const obra = this.filtroObra();
    const origem = this.filtroOrigem();
    const de = this.filtroDataDe();
    const ate = this.filtroDataAte();

    return this.pagamentos().filter((p) => {
      if (status !== 'todos' && (p['status'] as string) !== status) return false;
      if (obra && this.obraNumber(p) !== obra) return false;
      if (origem !== 'todos' && this.origemRotulo(p).toLowerCase() !== origem) return false;
      if (!dataDentroDoIntervalo(p['dataSolicitacao'] as string | null, de, ate)) return false;
      if (!termo) return true;
      return [this.obraNumber(p), this.numero(p), this.fornecedor(p), this.descricao(p)]
        .join(' ')
        .toLowerCase()
        .includes(termo);
    });
  });

  protected readonly listaOrdenada = computed(() =>
    ordenarPor(this.listaFiltrada(), this.ordenacao(), (p, coluna) => {
      switch (coluna) {
        case 'obra': return this.obraNumber(p);
        case 'numero': return this.numero(p);
        case 'dataSolicitacao': return p['dataSolicitacao'] as string | null;
        case 'fornecedor': return this.fornecedor(p);
        case 'descricao': return this.descricao(p);
        case 'origem': return this.origemRotulo(p);
        case 'valorTotal': return this.valorTotal(p);
        case 'status': return p['status'] as string | null;
      }
    }),
  );

  ngOnInit(): void {
    this.carregar();
    this.api.listarObras().subscribe({
      next: (obras) => this.obras.set(obras),
      error: () => {},
    });
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    // Sem filtros: todos os pagamentos da empresa, de todas as obras.
    this.api.listarPagamentos().subscribe({
      next: (pagamentos) => {
        this.pagamentos.set(pagamentos);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os pagamentos.');
        this.carregando.set(false);
      },
    });
  }

  // ------------------------------------------------------------------
  // Formulário — Novo pagamento (26/08/2026, pedido do Lucas: criar
  // direto da lista geral, escolhendo a obra ali mesmo). Diferente de
  // Mapa/Empreita, um pagamento exige pelo menos 1 item cujo valor bata
  // com o total (`PagamentoController::syncCompleto`) — aqui a criação
  // fica deliberadamente mínima (1 item, sem tipo/etapa ainda) e manda o
  // usuário terminar de detalhar na aba Pagamentos da própria obra, que
  // já tem o editor completo de itens.
  // ------------------------------------------------------------------
  protected readonly obras = signal<Obra[]>([]);
  protected readonly formularioAberto = signal(false);
  protected readonly salvando = signal(false);
  protected readonly obraSelecionadaId = signal('');

  protected readonly formulario = this.fb.nonNullable.group({
    fornecedor: [''],
    descricao: ['', [Validators.required]],
    valorTotal: [0, [Validators.required, Validators.min(0.01)]],
  });

  protected novo(): void {
    this.obraSelecionadaId.set('');
    this.formulario.reset({ fornecedor: '', descricao: '', valorTotal: 0 });
    this.formularioAberto.set(true);
  }

  protected fecharFormulario(): void {
    this.formularioAberto.set(false);
  }

  protected mudarObraSelecionada(obraId: string): void {
    this.obraSelecionadaId.set(obraId);
  }

  protected temErroFormulario(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  protected salvarNovo(): void {
    const obraId = this.obraSelecionadaId();
    if (!obraId) {
      window.alert('Escolha a obra antes de salvar.');
      return;
    }
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const v = this.formulario.getRawValue();
    const pagamentosDaObra = this.pagamentos()
      .filter((p) => String(p['obraId'] ?? '') === obraId)
      .map((p) => normalizarPagamento(p as Record<string, unknown>));

    const novo: PagamentoParaCriar = {
      id: gerarId(),
      numeroPagamento: gerarNumeroPagamento(pagamentosDaObra),
      obraNumber: '',
      dataSolicitacao: hojeIso(),
      dataPagamento: '',
      fornecedor: v.fornecedor.trim(),
      descricao: v.descricao.trim(),
      valorTotal: v.valorTotal,
      itens: [
        {
          id: gerarId(),
          descricao: v.descricao.trim(),
          tipo: '',
          eapId: '',
          valor: v.valorTotal,
          modoValor: 'valor',
        },
      ],
      origem: null,
      status: 'confirmado',
    };

    this.salvando.set(true);
    this.api.criarPagamento(paraPayloadApi(novo, obraId)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.fecharFormulario();
        this.router.navigate(['/obras', obraId, 'pagamentos']);
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível criar o pagamento.');
      },
    });
  }

  protected obraNumber(p: Pagamento): string {
    return String(p['obraNumber'] ?? '—') || '—';
  }

  protected numero(p: Pagamento): string {
    return String(p['numeroPagamento'] ?? '—') || '—';
  }

  protected fornecedor(p: Pagamento): string {
    return String(p['fornecedor'] ?? '—') || '—';
  }

  protected descricao(p: Pagamento): string {
    return String(p['descricao'] ?? '—') || '—';
  }

  protected valorTotal(p: Pagamento): number {
    return Number(p['valorTotal'] ?? 0);
  }

  protected dataSolicitacao(p: Pagamento): string {
    return this.formatarData(String(p['dataSolicitacao'] ?? '')) || '—';
  }

  protected pendente(p: Pagamento): boolean {
    return p['status'] === 'pendente';
  }

  private origem(p: Pagamento): { tipo?: string; refId?: string } | null {
    return (p['origem'] as { tipo?: string; refId?: string } | null) ?? null;
  }

  /** Rótulo de onde o pagamento nasceu — Manual, Mapa ou Empreita. */
  protected origemRotulo(p: Pagamento): string {
    const tipo = this.origem(p)?.tipo;
    if (tipo === 'mapa') return 'Mapa';
    if (tipo === 'empreita') return 'Empreita';
    return 'Manual';
  }

  /**
   * Exporta a lista JÁ FILTRADA/ordenada pra planilha Excel (31/08/2026,
   * pedido do Lucas) — reflete os mesmos filtros aplicados na tela
   * (`listaOrdenada`), não a lista inteira sem filtro nenhum.
   */
  protected readonly exportandoXlsx = signal(false);

  protected async exportarXlsx(): Promise<void> {
    this.exportandoXlsx.set(true);
    try {
      await exportarTabelaXlsx(
        'Pagamentos',
        [
          { header: 'Obra', key: 'obra', width: 14 },
          { header: 'Nº', key: 'numero', width: 12 },
          { header: 'Solicitação', key: 'dataSolicitacao', width: 14 },
          { header: 'Fornecedor', key: 'fornecedor', width: 24 },
          { header: 'Descrição', key: 'descricao', width: 34 },
          { header: 'Origem', key: 'origem', width: 12 },
          { header: 'Total (R$)', key: 'total', width: 16 },
          { header: 'Status', key: 'status', width: 12 },
        ],
        this.listaOrdenada().map((p) => ({
          obra: this.obraNumber(p),
          numero: this.numero(p),
          dataSolicitacao: this.dataSolicitacao(p),
          fornecedor: this.fornecedor(p),
          descricao: this.descricao(p),
          origem: this.origemRotulo(p),
          total: this.valorTotal(p),
          status: this.pendente(p) ? 'Pendente' : 'Confirmado',
        })),
        'pagamentos.xlsx',
      );
    } catch {
      window.alert('Não foi possível gerar a planilha.');
    } finally {
      this.exportandoXlsx.set(false);
    }
  }

  /**
   * Rota da página que gerou o lançamento: o Mapa ou a Empreita, quando
   * automático; a aba Pagamentos da própria obra, quando manual (não
   * existe uma página "de origem" separada pra um lançamento digitado à
   * mão — a lista da obra já mostra ele pronto pra editar).
   */
  protected rotaOrigem(p: Pagamento): unknown[] {
    const obraId = String(p['obraId'] ?? '');
    const origem = this.origem(p);

    if (origem?.tipo === 'mapa' && origem.refId) {
      return ['/obras', obraId, 'mapas', origem.refId];
    }
    if (origem?.tipo === 'empreita' && origem.refId) {
      return ['/obras', obraId, 'empreitas', origem.refId];
    }
    return ['/obras', obraId, 'pagamentos'];
  }

  // ------------------------------------------------------------------
  // Seleção múltipla + "Copiar mensagem" pro WhatsApp (02/09/2026, pedido
  // do Lucas). Formato provisório — mesmo esquema de `Pagamentos`.
  // ------------------------------------------------------------------
  protected readonly selecao = new SelecaoMultipla<Pagamento>((p) => String(p['id'] ?? ''));
  protected readonly copiado = signal(false);

  protected async copiarMensagem(): Promise<void> {
    const selecionados = this.selecao.selecionados(this.listaOrdenada());
    if (!selecionados.length) return;

    const linhas = selecionados.map(
      (p) =>
        `• Obra ${this.obraNumber(p)} — Nº ${this.numero(p)} — ${this.fornecedor(p)} — ${this.formatarMoeda(this.valorTotal(p))} — ${this.pendente(p) ? 'Pendente' : 'Confirmado'}`,
    );
    const totalGeral = selecionados.reduce((soma, p) => soma + this.valorTotal(p), 0);
    const mensagem = [
      `*Pagamentos (${selecionados.length})*`,
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
