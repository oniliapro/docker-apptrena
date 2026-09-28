import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { Empreita, Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda, hojeIso } from '../../core/utils/formato';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { SeletorObra } from '../../shared/seletor-obra/seletor-obra';
import { BarraFixa } from '../../shared/barra-fixa/barra-fixa';
import { AcaoLista, BarraSelecao } from '../../shared/barra-selecao/barra-selecao';
import {
  SelecaoMultipla,
  avisarFalhasDeExclusao,
  confirmarExclusaoEmLote,
  excluirEmLote,
} from '../../shared/selecao-lista/selecao-lista';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';
import { EmpreitaPagamentosPopup } from '../empreita/empreita-pagamentos-popup';
import { ResumoContratoEmpreita } from '../empreita/empreita.models';
import { normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';

type ColunaEmpreitaGeral =
  | 'obra'
  | 'numero'
  | 'descricao'
  | 'empreiteiro'
  | 'total'
  | 'totalPago'
  | 'saldo'
  | 'medicao'
  | 'medicaoFinanceira'
  | 'valorUltimaSolicitacao'
  | 'ultimaSolicitacao';

/**
 * Lista geral de Empreitas — todas as obras (28/09/2026, pedido do Lucas:
 * "ajustar layout da página geral de Empreitas pra bater com o da aba
 * Empreitas da obra"). Mesma tabela/colunas/cálculos de `EmpreitasObra`
 * (Total, Pago, Saldo, medição física/financeira, "Detalhar", seleção
 * múltipla, popup de pagamentos registrados), com uma coluna Obra a mais —
 * mesma relação que a página geral de Contratos de equipamentos tem com a
 * aba da obra.
 *
 * Os cálculos de `EmpreitasObra` (total/saldo/% medição) partem de
 * `resumoContrato` (GET /empreitas/resumo?obra_id=, por UMA obra) e dos
 * pagamentos daquela obra — aqui busca os dois POR OBRA (uma chamada por
 * obra distinta entre as empreitas carregadas, via `forkJoin`) e junta tudo
 * num só `Map`; os `computed()` que derivam total/saldo/medição são os
 * MESMOS da aba (cópia fiel), porque não dependem de qual obra é qual.
 *
 * Fora do escopo de propósito, igual ficou "criar novo" só na aba de
 * Contratos de equipamentos: as ações que precisam da EAP de uma obra
 * específica (copiar solicitação/resumo pro WhatsApp, PDF do profissional,
 * lançar reservas, realizar medição, fechar período) — pedem contexto de
 * uma obra só, e aqui a seleção pode cruzar várias. Ficam só na aba.
 */
@Component({
  selector: 'app-empreitas',
  imports: [ReactiveFormsModule, RedimensionarColunas, SeletorObra, BarraFixa, BarraSelecao, EmpreitaPagamentosPopup],
  templateUrl: './empreitas.html',
  styleUrl: '../empreita/empreitas-obra.scss',
})
export class Empreitas implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly empreitas = signal<Empreita[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;

  private readonly resumoContrato = signal<ResumoContratoEmpreita[]>([]);
  private readonly pagamentosPorEmpreita = signal<Map<string, Pagamento[]>>(new Map());

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

    this.api.listarEmpreitas().subscribe({
      next: (empreitas) => {
        this.empreitas.set(empreitas);

        const obraIds = [...new Set(empreitas.map((e) => this.obraId(e)).filter(Boolean))];
        if (!obraIds.length) {
          this.resumoContrato.set([]);
          this.pagamentosPorEmpreita.set(new Map());
          this.carregando.set(false);
          return;
        }

        forkJoin({
          resumos: forkJoin(
            obraIds.map((id) =>
              this.api.obterResumoContratoEmpreitas(id).pipe(catchError(() => of([] as ResumoContratoEmpreita[]))),
            ),
          ),
          pagamentosBrutos: forkJoin(
            obraIds.map((id) =>
              this.api.listarPagamentos({ obraId: id, origemTipo: 'empreita' }).pipe(catchError(() => of([]))),
            ),
          ),
        }).subscribe(({ resumos, pagamentosBrutos }) => {
          this.resumoContrato.set(resumos.flat());

          const porEmpreita = new Map<string, Pagamento[]>();
          for (const bruto of pagamentosBrutos.flat()) {
            const pagamento = normalizarPagamento(bruto as Record<string, unknown>);
            const empreitaId = pagamento.origem?.tipo === 'empreita' ? pagamento.origem.refId : null;
            if (!empreitaId) continue;
            const lista = porEmpreita.get(empreitaId) ?? [];
            lista.push(pagamento);
            porEmpreita.set(empreitaId, lista);
          }
          this.pagamentosPorEmpreita.set(porEmpreita);

          this.carregando.set(false);
        });
      },
      error: () => {
        this.erro.set('Não foi possível carregar as empreitas.');
        this.carregando.set(false);
      },
    });
  }

  // ------------------------------------------------------------------
  // Cálculos — cópia fiel de `EmpreitasObra` (dependem só de
  // `resumoContrato`/`pagamentosPorEmpreita`, não de qual obra é qual).
  // ------------------------------------------------------------------

  private readonly totalPorEmpreita = computed(() => {
    const mapa = new Map<string, number>();
    for (const r of this.resumoContrato()) {
      const soma = r.itens.reduce((s, it) => s + (it.contratoEmp || 0) + (it.contratoReserva || 0), 0);
      mapa.set(r.id, soma);
    }
    return mapa;
  });

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

  private readonly pctFisicoDetalhadoPorEmpreita = computed(() => {
    type Par = { acumulado: number; atual: number } | null;
    const mapa = new Map<string, { emp: Par; reserva: Par }>();
    for (const r of this.resumoContrato()) {
      const soma = (campo: 'contratoEmp' | 'contratoReserva'): Par => {
        let acum = 0;
        let atualSoma = 0;
        let peso = 0;
        for (const item of r.itens) {
          const contrato = item[campo] || 0;
          if (contrato <= 0) continue;
          const acumulado = item.medicaoAcum ?? 0;
          acum += acumulado * contrato;
          atualSoma += (item.medicaoAtual ?? acumulado) * contrato;
          peso += contrato;
        }
        return peso > 0 ? { acumulado: acum / peso, atual: atualSoma / peso } : null;
      };
      mapa.set(r.id, { emp: soma('contratoEmp'), reserva: soma('contratoReserva') });
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

  private readonly pendenteDetalhadoPorEmpreita = computed(() => {
    const mapa = new Map<string, { emp: number; reserva: number }>();
    for (const [id, lista] of this.pagamentosPorEmpreita()) {
      let emp = 0;
      let reserva = 0;
      for (const pagamento of lista) {
        if (pagamento.status !== 'pendente') continue;
        for (const item of pagamento.itens) {
          if (item.parcela === 'reserva') reserva += Number(item.valor) || 0;
          else if (item.parcela === 'empreiteiro') emp += Number(item.valor) || 0;
        }
      }
      mapa.set(id, { emp, reserva });
    }
    return mapa;
  });

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

  protected readonly detalhar = signal(false);

  protected alternarDetalhar(): void {
    this.detalhar.update((v) => !v);
  }

  protected obra(empreita: Empreita): string {
    return String(empreita['obra_nome'] ?? '—');
  }

  protected obraId(empreita: Empreita): string {
    return String(empreita['obra_id'] ?? '');
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

  protected contratoAssinado(empreita: Empreita): boolean {
    return Boolean(empreita['contrato_assinado']);
  }

  protected total(empreita: Empreita): number {
    return this.totalPorEmpreita().get(empreita.id) ?? 0;
  }

  protected temMedicaoFisica(empreita: Empreita): boolean {
    return this.pctFisicoPorEmpreita().get(empreita.id) !== null;
  }

  protected pctFisicoAcumulado(empreita: Empreita): number {
    return this.pctFisicoPorEmpreita().get(empreita.id)?.acumulado ?? 0;
  }

  protected pctFisicoAtual(empreita: Empreita): number {
    return this.pctFisicoPorEmpreita().get(empreita.id)?.atual ?? 0;
  }

  protected pctFinanceiroPago(empreita: Empreita): number {
    const total = this.total(empreita);
    return total > 0 ? (this.totalPago(empreita) / total) * 100 : 0;
  }

  protected pctFinanceiroTotal(empreita: Empreita): number {
    const total = this.total(empreita);
    if (total <= 0) return 0;
    const pendente = this.pendentePorEmpreita().get(empreita.id) ?? 0;
    return ((this.totalPago(empreita) + pendente) / total) * 100;
  }

  protected fisicoParcela(empreita: Empreita, parcela: 'emp' | 'reserva'): { acumulado: number; atual: number } | null {
    return this.pctFisicoDetalhadoPorEmpreita().get(empreita.id)?.[parcela] ?? null;
  }

  protected financeiroParcela(empreita: Empreita, parcela: 'emp' | 'reserva'): { pago: number; total: number } | null {
    const contrato = parcela === 'emp' ? this.totalEmp(empreita) : this.totalReserva(empreita);
    if (contrato <= 0) return null;
    const pago = parcela === 'emp' ? this.pagoEmp(empreita) : this.pagoReserva(empreita);
    const pendente = this.pendenteDetalhadoPorEmpreita().get(empreita.id)?.[parcela === 'emp' ? 'emp' : 'reserva'] ?? 0;
    return { pago: (pago / contrato) * 100, total: ((pago + pendente) / contrato) * 100 };
  }

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

  protected saldo(empreita: Empreita): number {
    const pendente = this.pendentePorEmpreita().get(empreita.id) ?? 0;
    return this.total(empreita) - this.totalPago(empreita) - pendente;
  }

  protected saldoEmp(empreita: Empreita): number {
    const totalEmp = this.totalDetalhadoPorEmpreita().get(empreita.id)?.emp ?? 0;
    const pagoEmp = this.pagoDetalhadoPorEmpreita().get(empreita.id)?.emp ?? 0;
    const pendenteEmp = this.pendenteDetalhadoPorEmpreita().get(empreita.id)?.emp ?? 0;
    return totalEmp - pagoEmp - pendenteEmp;
  }

  protected saldoReserva(empreita: Empreita): number {
    const totalReserva = this.totalDetalhadoPorEmpreita().get(empreita.id)?.reserva ?? 0;
    const pagoReserva = this.pagoDetalhadoPorEmpreita().get(empreita.id)?.reserva ?? 0;
    const pendenteReserva = this.pendenteDetalhadoPorEmpreita().get(empreita.id)?.reserva ?? 0;
    return totalReserva - pagoReserva - pendenteReserva;
  }

  protected valorUltimaSolicitacao(empreita: Empreita): number {
    return this.ultimaSolicitacaoPorEmpreita().get(empreita.id)?.valorTotal ?? 0;
  }

  protected dataUltimaSolicitacao(empreita: Empreita): string {
    return this.ultimaSolicitacaoPorEmpreita().get(empreita.id)?.dataSolicitacao ?? '';
  }

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

  protected medicaoEmAberto(empreita: Empreita): boolean {
    const iniciado = empreita['pagamento_iniciado'];
    const habilitada = empreita['medicao_habilitada'];
    return (iniciado === true || iniciado === 1) && (habilitada === false || habilitada === 0);
  }

  // ------------------------------------------------------------------
  // Ordenação/busca — igual à aba, com "obra" a mais.
  // ------------------------------------------------------------------
  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaEmpreitaGeral> | null>(null);
  protected readonly setaOrdenacao = setaOrdenacao;
  protected readonly busca = signal('');

  protected alternarOrdenacaoColuna(coluna: ColunaEmpreitaGeral): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  private readonly listaFiltrada = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    if (!termo) return this.empreitas();
    return this.empreitas().filter((e) =>
      [this.obra(e), this.numero(e), this.descricao(e), this.empreiteiro(e)].join(' ').toLowerCase().includes(termo),
    );
  });

  protected readonly listaOrdenada = computed(() =>
    ordenarPor(this.listaFiltrada(), this.ordenacao(), (e, coluna) => {
      switch (coluna) {
        case 'obra': return this.obra(e);
        case 'numero': return this.numero(e);
        case 'descricao': return this.descricao(e);
        case 'empreiteiro': return this.empreiteiro(e);
        case 'total': return this.total(e);
        case 'totalPago': return this.totalPago(e);
        case 'saldo': return this.saldo(e);
        case 'medicao': return this.temMedicaoFisica(e) ? this.pctFisicoAtual(e) : null;
        case 'medicaoFinanceira': return this.total(e) > 0 ? this.pctFinanceiroTotal(e) : null;
        case 'valorUltimaSolicitacao': return this.dataUltimaSolicitacao(e) ? this.valorUltimaSolicitacao(e) : null;
        case 'ultimaSolicitacao': return this.dataUltimaSolicitacao(e);
      }
    }),
  );

  protected readonly totaisBarra = computed(() => {
    const lista = this.listaOrdenada();
    const base = this.selecao.temSelecao() ? this.selecao.selecionados(lista) : lista;
    let total = 0;
    let pago = 0;
    let saldo = 0;
    let totalEmp = 0;
    let totalReserva = 0;
    let pagoEmp = 0;
    let pagoReserva = 0;
    let saldoEmp = 0;
    let saldoReserva = 0;
    for (const empreita of base) {
      total += this.total(empreita);
      pago += this.totalPago(empreita);
      saldo += this.saldo(empreita);
      totalEmp += this.totalEmp(empreita);
      totalReserva += this.totalReserva(empreita);
      pagoEmp += this.pagoEmp(empreita);
      pagoReserva += this.pagoReserva(empreita);
      saldoEmp += this.saldoEmp(empreita);
      saldoReserva += this.saldoReserva(empreita);
    }
    return { quantidade: base.length, total, pago, saldo, totalEmp, totalReserva, pagoEmp, pagoReserva, saldoEmp, saldoReserva };
  });

  // ------------------------------------------------------------------
  // Popup de pagamentos registrados — mesmo componente autocontido da aba
  // (recebe empreitaId/obraId explícitos, então funciona igual cruzando obras).
  // ------------------------------------------------------------------
  protected readonly pagamentosModalEmpreita = signal<Empreita | null>(null);

  protected abrirRegistrados(empreita: Empreita): void {
    this.pagamentosModalEmpreita.set(empreita);
  }

  protected abrirPagamentos(empreita: Empreita, evento: Event): void {
    evento.stopPropagation();
    this.pagamentosModalEmpreita.set(empreita);
  }

  protected fecharPagamentos(): void {
    this.pagamentosModalEmpreita.set(null);
  }

  protected recarregarLista(): void {
    this.carregar();
  }

  protected abrir(empreita: Empreita): void {
    void this.router.navigate(['/obras', this.obraId(empreita), 'empreitas', empreita.id]);
  }

  protected abrirEditor(empreita: Empreita, realizarMedicao = false): void {
    if (!realizarMedicao) {
      this.abrir(empreita);
      return;
    }
    void this.router.navigate(['/obras', this.obraId(empreita), 'empreitas', empreita.id], {
      queryParams: { realizarMedicao: 1 },
    });
  }

  // ------------------------------------------------------------------
  // Seleção — só "Abrir"/"Excluir" (as ações que dependem de EAP de uma
  // obra só ficam na aba, ver comentário no topo do arquivo).
  // ------------------------------------------------------------------
  protected readonly selecao = new SelecaoMultipla<Empreita>((empreita) => empreita.id);
  protected readonly selecionadas = computed(() => this.selecao.selecionados(this.listaOrdenada()));
  protected readonly acoesLista: AcaoLista[] = [{ chave: 'excluir', rotulo: 'Excluir', perigo: true }];

  protected abrirSelecionada(): void {
    const [primeira] = this.selecionadas();
    if (primeira) this.abrir(primeira);
  }

  protected removerUm(empreita: Empreita): void {
    if (!window.confirm(`Excluir a empreita "${this.descricao(empreita)}"?`)) return;

    this.api.excluirEmpreita(empreita.id).subscribe({
      next: () => this.empreitas.update((lista) => lista.filter((e) => e.id !== empreita.id)),
      error: () => window.alert('Não foi possível excluir a empreita.'),
    });
  }

  protected aoAcaoLista(chave: string): void {
    if (chave !== 'excluir') return;
    const alvos = this.selecionadas();
    if (
      !alvos.length ||
      !confirmarExclusaoEmLote(
        alvos.length,
        'empreita',
        'empreitas',
        'Os serviços, medições e pagamentos lançados nelas deixam de aparecer aqui.',
        alvos.map((e) => this.descricao(e)),
      )
    ) {
      return;
    }

    excluirEmLote(alvos, (empreita) => this.api.excluirEmpreita(empreita.id)).subscribe(({ excluidos, falhas }) => {
      const ids = new Set(excluidos.map((e) => e.id));
      this.empreitas.update((lista) => lista.filter((e) => !ids.has(e.id)));
      this.selecao.limpar();
      avisarFalhasDeExclusao(falhas, 'empreita(s)', (e) => this.descricao(e));
    });
  }

  // ------------------------------------------------------------------
  // Formulário — Nova empreita (com seletor de obra, já que aqui não tem
  // uma obra fixa; mesmo formulário da aba, um campo a mais).
  // ------------------------------------------------------------------
  protected readonly obras = signal<Obra[]>([]);
  protected readonly formularioAberto = signal(false);
  protected readonly salvando = signal(false);
  protected readonly obraSelecionadaId = signal('');

  protected readonly formulario = this.fb.nonNullable.group({
    descricaoEmpreita: ['', [Validators.required]],
    empreiteiro: [''],
    dataMedicao: [''],
  });

  protected novo(): void {
    this.obraSelecionadaId.set('');
    this.formulario.reset({ descricaoEmpreita: '', empreiteiro: '', dataMedicao: hojeIso() });
    this.formularioAberto.set(true);
  }

  protected fechar(): void {
    this.formularioAberto.set(false);
  }

  protected mudarObraSelecionada(obraId: string): void {
    this.obraSelecionadaId.set(obraId);
  }

  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  protected salvar(): void {
    if (!this.obraSelecionadaId()) {
      window.alert('Escolha a obra antes de salvar.');
      return;
    }
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const v = this.formulario.getRawValue();
    const obraId = this.obraSelecionadaId();
    const payload = {
      obra_id: obraId,
      descricao_empreita: v.descricaoEmpreita.trim(),
      empreiteiro: v.empreiteiro.trim(),
      medicao_date: v.dataMedicao || null,
    };

    this.salvando.set(true);
    this.api.criarEmpreita(payload).subscribe({
      next: (empreita) => {
        this.salvando.set(false);
        this.fechar();
        this.router.navigate(['/obras', obraId, 'empreitas', empreita.id]);
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível criar a empreita.');
      },
    });
  }
}
