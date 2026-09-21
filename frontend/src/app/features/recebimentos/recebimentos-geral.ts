import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Obra, Recebimento } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda, hojeIso } from '../../core/utils/formato';
import { parsearNumeroBR } from '../../shared/numero/parse-numero';
import { exportarTabelaXlsx } from '../../shared/exportar-xlsx/exportar-xlsx';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { copiarParaAreaDeTransferencia, SelecaoMultipla } from '../../shared/selecao-lista/selecao-lista';
import { SeletorObra } from '../../shared/seletor-obra/seletor-obra';
import {
  gerarId,
  gerarNumeroRecebimento,
  normalizarRecebimento,
  paraPayloadApi,
} from './recebimentos-calc';
import { Recebimento as RecebimentoParaCriar } from './recebimentos.models';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';
import { dataDentroDoIntervalo, valoresDistintos } from '../../shared/filtros/filtros';

type ColunaRecebimentoGeral =
  | 'obra'
  | 'numero'
  | 'dataSolicitacao'
  | 'cliente'
  | 'descricao'
  | 'origem'
  | 'valorTotal'
  | 'status';

/**
 * Lista geral de Recebimentos — mirror de `pagamentos-geral.ts`
 * (01/09/2026, pedido do Lucas: "funciona exatamente como os
 * pagamentos"). Todos os lançamentos de todas as obras.
 *
 * O "Ver" de cada linha manda pra Medição que gerou o recebimento
 * (quando automático) ou pra aba Recebimentos da própria obra (manual).
 */
@Component({
  selector: 'app-recebimentos-geral',
  imports: [RouterLink, RedimensionarColunas, ReactiveFormsModule, SeletorObra],
  templateUrl: './recebimentos-geral.html',
  styleUrl: './recebimentos-geral.scss',
})
export class RecebimentosGeral implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly recebimentos = signal<Recebimento[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;

  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaRecebimentoGeral> | null>(null);
  protected readonly setaOrdenacao = setaOrdenacao;
  protected readonly busca = signal('');
  protected readonly filtroStatus = signal<'todos' | 'pendente' | 'confirmado'>('todos');
  protected readonly filtroObra = signal('');
  protected readonly filtroOrigem = signal<'todos' | 'manual' | 'medicao'>('todos');
  protected readonly filtroDataDe = signal('');
  protected readonly filtroDataAte = signal('');

  protected readonly obrasDisponiveis = computed(() =>
    valoresDistintos(this.recebimentos(), (r) => this.obraNumber(r)).filter((v) => v !== '—'),
  );

  protected alternarOrdenacaoColuna(coluna: ColunaRecebimentoGeral): void {
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
    this.filtroOrigem.set((evento.target as HTMLSelectElement).value as 'todos' | 'manual' | 'medicao');
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

    return this.recebimentos().filter((r) => {
      if (status !== 'todos' && (r['status'] as string) !== status) return false;
      if (obra && this.obraNumber(r) !== obra) return false;
      if (origem !== 'todos' && this.origemRotulo(r).toLowerCase() !== origem) return false;
      if (!dataDentroDoIntervalo(r['dataSolicitacao'] as string | null, de, ate)) return false;
      if (!termo) return true;
      return [this.obraNumber(r), this.numero(r), this.cliente(r), this.descricao(r)]
        .join(' ')
        .toLowerCase()
        .includes(termo);
    });
  });

  protected readonly listaOrdenada = computed(() =>
    ordenarPor(this.listaFiltrada(), this.ordenacao(), (r, coluna) => {
      switch (coluna) {
        case 'obra': return this.obraNumber(r);
        case 'numero': return this.numero(r);
        case 'dataSolicitacao': return r['dataSolicitacao'] as string | null;
        case 'cliente': return this.cliente(r);
        case 'descricao': return this.descricao(r);
        case 'origem': return this.origemRotulo(r);
        case 'valorTotal': return this.valorTotal(r);
        case 'status': return r['status'] as string | null;
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

    this.api.listarRecebimentos().subscribe({
      next: (recebimentos) => {
        this.recebimentos.set(recebimentos);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os recebimentos.');
        this.carregando.set(false);
      },
    });
  }

  // ------------------------------------------------------------------
  // Formulário — Novo recebimento (mirror de `pagamentos-geral.ts`)
  // ------------------------------------------------------------------
  protected readonly obras = signal<Obra[]>([]);
  protected readonly formularioAberto = signal(false);
  protected readonly salvando = signal(false);
  protected readonly obraSelecionadaId = signal('');

  protected readonly formulario = this.fb.nonNullable.group({
    cliente: [''],
    descricao: ['', [Validators.required]],
    valorTotal: [0, [Validators.required, Validators.min(0.01)]],
  });

  protected novo(): void {
    this.obraSelecionadaId.set('');
    this.formulario.reset({ cliente: '', descricao: '', valorTotal: 0 });
    this.formularioAberto.set(true);
  }

  protected fecharFormulario(): void {
    this.formularioAberto.set(false);
  }

  protected mudarObraSelecionada(obraId: string): void {
    this.obraSelecionadaId.set(obraId);
  }

  /** Campo de valor em texto (aceita `=conta`, ver `FormulaCamposService`): grava o número no formulário. */
  protected definirValorTotal(evento: Event): void {
    const controle = this.formulario.controls.valorTotal;
    controle.setValue(parsearNumeroBR((evento.target as HTMLInputElement).value));
    controle.markAsTouched();
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
    const recebimentosDaObra = this.recebimentos()
      .filter((r) => String(r['obraId'] ?? '') === obraId)
      .map((r) => normalizarRecebimento(r as Record<string, unknown>));

    const novo: RecebimentoParaCriar = {
      id: gerarId(),
      numeroRecebimento: gerarNumeroRecebimento(recebimentosDaObra),
      obraNumber: '',
      dataSolicitacao: hojeIso(),
      dataRecebimento: '',
      cliente: v.cliente.trim(),
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
    this.api.criarRecebimento(paraPayloadApi(novo, obraId)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.fecharFormulario();
        this.router.navigate(['/obras', obraId, 'recebimentos']);
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível criar o recebimento.');
      },
    });
  }

  protected obraNumber(r: Recebimento): string {
    return String(r['obraNumber'] ?? '—') || '—';
  }

  protected numero(r: Recebimento): string {
    return String(r['numeroRecebimento'] ?? '—') || '—';
  }

  protected cliente(r: Recebimento): string {
    return String(r['cliente'] ?? '—') || '—';
  }

  protected descricao(r: Recebimento): string {
    return String(r['descricao'] ?? '—') || '—';
  }

  protected valorTotal(r: Recebimento): number {
    return Number(r['valorTotal'] ?? 0);
  }

  protected dataSolicitacao(r: Recebimento): string {
    return this.formatarData(String(r['dataSolicitacao'] ?? '')) || '—';
  }

  protected pendente(r: Recebimento): boolean {
    return r['status'] === 'pendente';
  }

  private origem(r: Recebimento): { tipo?: string; refId?: string } | null {
    return (r['origem'] as { tipo?: string; refId?: string } | null) ?? null;
  }

  /** Rótulo de onde o recebimento nasceu — Manual ou Medição. */
  protected origemRotulo(r: Recebimento): string {
    const tipo = this.origem(r)?.tipo;
    if (tipo === 'medicao') return 'Medição';
    return 'Manual';
  }

  /**
   * Exporta a lista JÁ FILTRADA/ordenada pra planilha Excel — mesmo
   * padrão de `pagamentos-geral.ts::exportarXlsx`.
   */
  protected readonly exportandoXlsx = signal(false);

  protected async exportarXlsx(): Promise<void> {
    this.exportandoXlsx.set(true);
    try {
      await exportarTabelaXlsx(
        'Recebimentos',
        [
          { header: 'Obra', key: 'obra', width: 14 },
          { header: 'Nº', key: 'numero', width: 12 },
          { header: 'Solicitação', key: 'dataSolicitacao', width: 14 },
          { header: 'Cliente', key: 'cliente', width: 24 },
          { header: 'Descrição', key: 'descricao', width: 34 },
          { header: 'Origem', key: 'origem', width: 12 },
          { header: 'Total (R$)', key: 'total', width: 16 },
          { header: 'Status', key: 'status', width: 12 },
        ],
        this.listaOrdenada().map((r) => ({
          obra: this.obraNumber(r),
          numero: this.numero(r),
          dataSolicitacao: this.dataSolicitacao(r),
          cliente: this.cliente(r),
          descricao: this.descricao(r),
          origem: this.origemRotulo(r),
          total: this.valorTotal(r),
          status: this.pendente(r) ? 'Pendente' : 'Confirmado',
        })),
        'recebimentos.xlsx',
      );
    } catch {
      window.alert('Não foi possível gerar a planilha.');
    } finally {
      this.exportandoXlsx.set(false);
    }
  }

  /**
   * Rota da página que gerou o lançamento: a Medição, quando automático;
   * a aba Recebimentos da própria obra, quando manual.
   */
  protected rotaOrigem(r: Recebimento): unknown[] {
    const obraId = String(r['obraId'] ?? '');
    const origem = this.origem(r);

    if (origem?.tipo === 'medicao' && origem.refId) {
      return ['/obras', obraId, 'medicoes', origem.refId];
    }
    return ['/obras', obraId, 'recebimentos'];
  }

  // ------------------------------------------------------------------
  // Seleção múltipla + "Copiar mensagem" pro WhatsApp (02/09/2026, pedido
  // do Lucas). Formato provisório — mesmo esquema de `Pagamentos`.
  // ------------------------------------------------------------------
  protected readonly selecao = new SelecaoMultipla<Recebimento>((r) => String(r['id'] ?? ''));
  protected readonly copiado = signal(false);

  protected async copiarMensagem(): Promise<void> {
    const selecionados = this.selecao.selecionados(this.listaOrdenada());
    if (!selecionados.length) return;

    const linhas = selecionados.map(
      (r) =>
        `• Obra ${this.obraNumber(r)} — Nº ${this.numero(r)} — ${this.cliente(r)} — ${this.formatarMoeda(this.valorTotal(r))} — ${this.pendente(r) ? 'Pendente' : 'Confirmado'}`,
    );
    const totalGeral = selecionados.reduce((soma, r) => soma + this.valorTotal(r), 0);
    const mensagem = [
      `*Recebimentos (${selecionados.length})*`,
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
