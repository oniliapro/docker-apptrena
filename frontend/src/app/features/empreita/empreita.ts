import { Component, HostListener, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';

import { ApiService } from '../../core/services/api.service';
import { BarraSelecao, AcaoLista } from '../../shared/barra-selecao/barra-selecao';
import { SelecaoMultipla, confirmarExclusaoEmLote } from '../../shared/selecao-lista/selecao-lista';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { AnexosLancamento } from '../../shared/anexos-lancamento/anexos-lancamento';
import { NavegacaoTabela } from '../../shared/navegacao-tabela/navegacao-tabela';
import { FormulaCampo, FormulasContexto } from '../../shared/numero/formulas-guardadas';
import { Autocomplete, OpcaoAutocomplete } from '../../shared/autocomplete/autocomplete';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { ContratoModelo } from '../configuracoes/contrato-modelos/contrato-modelo.models';
import { Empreiteiro as EmpreiteiroCadastro } from '../cadastros/cadastros.models';
import { CHAVE_EMPREITEIROS, normalizarEmpreiteiro } from '../cadastros/empreiteiros/empreiteiros';
import { ChaveTipo, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
import { parsearBR } from '../pagamentos/pagamentos-calc';
import { nomeArquivoPdf } from '../../shared/pdf-nome-arquivo';
import {
  SituacaoMedicaoLinha,
  classificarSituacaoMedicao,
  limitarPercentual,
  pctParaQtde,
  pctParaValorContrato,
  qtdeParaPct,
  valorContratoParaPct,
} from './empreita-engine';
import { exportarEmpreitaXlsx, LinhaExportEmpreita } from './empreita-exportar';
import {
  CHAVES_OPCOES_PDF_EMPREITA,
  COLUNAS_PDF_EMPREITA_TODAS,
  ColunasPdfEmpreita,
  DICAS_OPCOES_PDF_EMPREITA,
  OpcoesPdfEmpreita,
  ROTULOS_OPCOES_PDF_EMPREITA,
  chavesColunasDisponiveis,
  opcoesDoSimplificado,
  rotuloColunaPdfEmpreita,
} from './empreita-pdf-opcoes';
import { EmpreitaStore } from './empreita.store';
import { CabecalhoEmpreita, ItemEmpreita, LinhaEmpreitaEstendida, UnidadeMedicao } from './empreita.models';

/**
 * Empreita — serviços contratados e suas medições.
 *
 * Cada serviço aponta para um item da EAP (usado só como referência de
 * orçado, para comparação) e pertence a UMA categoria de custo só
 * (`item.tipo` — 25/08/2026, pedido do Lucas: "cada item da lista só vai
 * ter um tipo"; se precisar de duas categorias no mesmo item da EAP,
 * lança dois serviços). O contrato — empreita e reserva — é lançado pelo
 * usuário (task #45, 28/07/2026): o sistema não distribui esse valor
 * automaticamente. A medição é em percentual, e o que se paga é o avanço
 * em relação ao acumulado.
 *
 * Layout redesenhado em 25/08/2026 (pedido do Lucas): além de
 * Contrato/Medição, a tabela mostra Já pago (acumulado dos pagamentos
 * confirmados), o rascunho editável de Pagamento do período, e o Saldo
 * após pagamento — cada bloco é UMA coluna só, com os campos que antes
 * eram colunas próprias empilhados dentro da célula (`.subcampo`), tudo
 * colorido azul/vermelho conforme positivo/negativo. O "Saldo disp." do
 * Contrato considera as OUTRAS empreitas da mesma obra
 * (`EmpreitaStore.saldoDispPorEap` → `calcularSaldoDisponivelPorEap` na
 * engine) — uma empreita nunca é bloqueada por falta de saldo, só fica
 * vermelha.
 */
@Component({
  selector: 'app-empreita',
  imports: [NavegacaoTabela, RedimensionarColunas, Autocomplete, BarraSelecao, FormulaCampo, AnexosLancamento],
  providers: [EmpreitaStore, FormulasContexto],
  templateUrl: './empreita.html',
  styleUrl: './empreita.scss',
})
export class Empreita implements OnInit {
  protected readonly store = inject(EmpreitaStore);
  /** Fórmulas guardadas dos campos de valor (ver `formulas-guardadas.ts`). */
  private readonly formulas = inject(FormulasContexto);
  private readonly api = inject(ApiService);
  private readonly armazenamento = inject(ArmazenamentoService);
  private readonly router = inject(Router);
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;
  protected readonly tiposCusto = TIPOS_CUSTO;

  /** Empreiteiro por `<select>` (03/09/2026, pedido do Lucas) — só os ATIVOS do cadastro. */
  protected readonly empreiteirosCadastro = signal<EmpreiteiroCadastro[]>([]);
  protected readonly empreiteirosAtivos = computed(() =>
    this.empreiteirosCadastro()
      .filter((e) => e.ativo !== false)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  );

  private carregarEmpreiteiros(): void {
    this.armazenamento.ler(CHAVE_EMPREITEIROS).subscribe({
      next: (bruto) => {
        if (!bruto) return;
        try {
          const dados = JSON.parse(bruto);
          if (Array.isArray(dados)) this.empreiteirosCadastro.set(dados.map((d) => normalizarEmpreiteiro(d)));
        } catch {
          // ignora — cadastro fica vazio, o select só mostra "(nenhum)"
        }
      },
      error: () => this.empreiteirosCadastro.set([]),
    });
  }

  /** Estado do botão "Baixar PDF" (23/08/2026) — ver EmpreitaPdfController. */
  protected readonly gerandoPdf = signal(false);
  protected readonly erroPdf = signal<string | null>(null);

  /**
   * "Simplificar" (01/09/2026, pedido do Lucas) — esconde as colunas
   * Empreiteiro/Reserva de todos os blocos (Contrato, Já pago, Pagamento,
   * Saldo após pagamento) e mostra só o Total, tanto na tela ao vivo
   * quanto no PDF gerado (o popup de `baixarPdf()` já abre com Empreiteiro/
   * Reserva desmarcados quando está ligado). Não persiste nada — vale só
   * pra esta visita/geração. Nasce LIGADO desde 25/09/2026 (pedido do
   * Lucas); desmarcar mostra as colunas de novo.
   */
  protected readonly simplificado = signal(true);

  protected alternarSimplificado(): void {
    this.simplificado.update((v) => !v);
  }

  /**
   * Id da obra — vem do param `:id` da rota avó (/obras/:id), herdado
   * via `withRouterConfig({ paramsInheritanceStrategy: 'always' })` em
   * app.config.ts. Mesmo mecanismo usado pela EAP. Usado aqui só para
   * buscar a EAP de referência — a própria empreita é identificada por
   * `empreitaId`.
   */
  readonly obraId = input.required<string>({ alias: 'id' });

  /** Id da empreita — vem do param `:empreitaId` da própria rota. */
  readonly empreitaId = input.required<string>({ alias: 'empreitaId' });

  /**
   * Colunas fixas da tabela — 25/08/2026, pedido do Lucas: enquanto
   * "Realizar pagamento" não foi clicado, só #/Serviço/Tipo/Etapa/
   * Contrato/Quantidades/Ações (7); depois, Quantidades some e entram
   * Medição/Já pago/Pagamento/Saldo após pagamento no lugar (10). Antes
   * (até 02/09/2026) essa troca acontecia junto com `store.travada()` —
   * 03/09/2026, pedido do Lucas: virou um passo à parte
   * (`store.pagamentoIniciado()`), depois de confirmar.
   */
  protected readonly totalColunas = computed(() => (this.store.pagamentoIniciado() ? 10 : 7));

  /**
   * Par "Realizar medição"/"Realizar pagamento" (03/09/2026, pedido do
   * Lucas) — um só habilitado por vez, alternando a cada clique (começa
   * com Medição habilitado). Persistido (`store.medicaoHabilitada`,
   * "pode fazer persistir" — antes era um sinal só de tela) — mas
   * INDEPENDENTE de `store.pagamentoIniciado()`: aquele campo controla
   * pra sempre se a tabela mostra Quantidades ou Medição/Já pago/
   * Pagamento/Saldo (uma vez revelada, continua revelada, mesmo
   * alternando este outro campo).
   */
  protected readonly podeRealizarMedicao = computed(() => this.store.medicaoHabilitada());

  /** Resultado do último "Lançar reservas" — some ao lançar de novo ou ao editar. */
  protected readonly mensagemReservas = signal<string | null>(null);

  protected lancarReservas(): void {
    const quantidade = this.store.lancarReservas();
    this.mensagemReservas.set(
      quantidade
        ? `Reserva lançada em ${quantidade} serviço${quantidade > 1 ? 's' : ''}.`
        : 'Nenhuma reserva a lançar: todos os serviços já têm reserva, ou não há saldo disponível na etapa / contrato do profissional.',
    );
  }

  protected realizarMedicao(): void {
    this.store.iniciarPagamento();
    this.store.definirMedicaoHabilitada(false);
    // Medição atual já nasce igual à acumulada (evita regresso sem querer).
    this.store.preencherMedicaoAtualComAcumulada();
  }

  /**
   * `?realizarMedicao=1` na URL (botão "Realizar medição" da tabela Pagamentos registrados, 26/09/2026):
   * assim que a empreita carrega, já abre a medição — "Realizar medição" trava e "Realizar pagamento" libera.
   */
  readonly realizarMedicaoAoAbrir = input('', { alias: 'realizarMedicao' });
  private jaRealizouAoAbrir = false;
  private readonly realizarMedicaoAoCarregar = effect(() => {
    if (this.jaRealizouAoAbrir || !this.realizarMedicaoAoAbrir() || this.store.carregando()) return;
    this.jaRealizouAoAbrir = true;
    untracked(() => {
      if (this.store.travada() && this.podeRealizarMedicao()) this.realizarMedicao();
    });
  });

  ngOnInit(): void {
    this.store.carregar(this.empreitaId(), this.obraId());
    this.formulas.definir('empreita.' + this.empreitaId());
    this.carregarEmpreiteiros();
  }

  /**
   * (13/10/2026, pedido do Lucas) Antes só existia "← Voltar para as abas"
   * (`ObraDetalhe`, sempre pra grade de abas da obra) — faltava um jeito
   * de voltar direto pra lista de Empreitas sem passar por lá, mesmo
   * padrão de `Medicao.voltar()`.
   */
  protected voltar(): void {
    void this.router.navigate(['/obras', this.obraId(), 'empreitas']);
  }

  /**
   * Avisa antes de fechar/recarregar a aba com gravações pendentes — mesmo
   * motivo de `Mapa.aoTentarFecharAba` (31/08/2026): editar vários itens em
   * sequência enfileira uma gravação por edição, e fechar a aba antes da
   * fila esvaziar cancela as que ainda não saíram.
   */
  @HostListener('window:beforeunload', ['$event'])
  protected aoTentarFecharAba(evento: BeforeUnloadEvent): void {
    if (!this.store.salvando()) return;
    evento.preventDefault();
  }

  // ------------------------------------------------------------------
  protected editarCabecalho(campo: keyof CabecalhoEmpreita, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.store.atualizarCabecalho(campo, valor as never);
  }

  protected editarTexto(item: ItemEmpreita, evento: Event): void {
    this.store.atualizarItem(item.id, { desc: (evento.target as HTMLInputElement).value });
  }

  /** Etapas da EAP da obra, no formato do campo com busca (só elas são aceitas). */
  protected readonly opcoesEtapa = computed<OpcaoAutocomplete[]>(() =>
    this.store.opcoesEap().map((itemEap) => ({ id: itemEap.id, rotulo: this.rotuloEap(itemEap) })),
  );

  protected editarEap(item: ItemEmpreita, opcao: OpcaoAutocomplete | null): void {
    this.store.atualizarItem(item.id, { eapId: opcao?.id ?? '' });
  }

  protected editarTipo(item: ItemEmpreita, evento: Event): void {
    this.store.atualizarItem(item.id, { tipo: (evento.target as HTMLSelectElement).value as ChaveTipo });
  }

  /** Lança o contrato (empreita ou reserva), digitado pelo usuário. */
  protected editarContrato(item: ItemEmpreita, campo: 'contratoEmp' | 'contratoReserva', evento: Event): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    this.store.atualizarContrato(item.id, campo, bruto === '' ? null : parsearBR(bruto));
  }

  /** Botão "+" da linha e Ctrl + Enter: novo serviço logo abaixo da linha atual (sem linha, ao final). */
  protected inserirAbaixo(indiceLinha: number): void {
    this.store.adicionarItem(indiceLinha < 0 ? undefined : indiceLinha + 1);
  }

  /** Ctrl + Delete: remove a linha atual (a diretiva `trenaNavegacaoTabela` já pediu confirmação). */
  protected removerPorIndice(indiceLinha: number): void {
    const item = this.store.itens()[indiceLinha];
    if (item) this.store.removerItem(item.id);
  }

  // ---- Seleção em lote (20/09/2026) — opcional: o ✖ de cada linha continua. ----
  protected readonly selecao = new SelecaoMultipla<ItemEmpreita>((item) => item.id);
  /** Com a empreita confirmada (travada) não há ação em lote. */
  protected readonly selecionadas = computed(() => (this.store.travada() ? [] : this.selecao.selecionados(this.store.itens())));
  protected readonly acoesLista: AcaoLista[] = [
    { chave: 'subir', rotulo: 'Mover para cima' },
    { chave: 'descer', rotulo: 'Mover para baixo' },
    { chave: 'excluir', rotulo: 'Excluir', perigo: true },
  ];

  protected aoAcaoLista(chave: string): void {
    const alvos = this.selecionadas();
    if (!alvos.length) return;

    if (chave === 'subir' || chave === 'descer') {
      this.store.moverVarios(alvos.map((item) => item.id), chave === 'subir' ? -1 : 1);
      return;
    }
    if (chave !== 'excluir') return;
    if (!confirmarExclusaoEmLote(alvos.length, 'serviço', 'serviços', '', alvos.map((item) => item.desc || '(sem descrição)'))) return;
    this.store.removerVarios(alvos.map((item) => item.id));
    this.selecao.limpar();
  }

  protected remover(item: ItemEmpreita): void {
    if (!window.confirm('Remover este serviço da empreita?')) return;
    this.store.removerItem(item.id);
  }

  /** Popup "Contrato" (27/09/2026) — assinatura + anexo, fora do fluxo normal da tela pra não empurrar a tabela de serviços. */
  protected readonly mostrarContrato = signal(false);

  /**
   * "Gerar contrato" a partir de um modelo cadastrado (28/09/2026, itens
   * 8/9) — dentro do mesmo popup "Contrato". A lista de modelos só é
   * buscada quando o popup abre (não faz sentido carregar isso toda vez
   * que a tela da empreita abre).
   */
  protected readonly modelosContrato = signal<ContratoModelo[]>([]);
  protected readonly modeloContratoId = signal('');
  protected readonly gerandoContrato = signal(false);
  protected readonly erroContrato = signal<string | null>(null);

  protected abrirContrato(): void {
    this.mostrarContrato.set(true);
    this.erroContrato.set(null);
    this.api.listarContratoModelos('empreita').subscribe({
      next: (lista) => this.modelosContrato.set(lista),
      error: () => this.modelosContrato.set([]),
    });
  }

  protected mudarModeloContrato(evento: Event): void {
    this.modeloContratoId.set((evento.target as HTMLSelectElement).value);
  }

  protected gerarContrato(): void {
    const modeloId = this.modeloContratoId();
    if (!modeloId) {
      this.erroContrato.set('Escolha um modelo de contrato.');
      return;
    }

    this.erroContrato.set(null);
    this.gerandoContrato.set(true);
    this.api.baixarContratoEmpreitaPdf(this.empreitaId(), modeloId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivoPdf('Contrato', [this.store.cabecalho().empreiteiro], this.empreitaId());
        link.click();
        URL.revokeObjectURL(url);
        this.gerandoContrato.set(false);
      },
      error: () => {
        this.erroContrato.set('Não foi possível gerar o PDF. Tente novamente em alguns segundos.');
        this.gerandoContrato.set(false);
      },
    });
  }

  // ---- PDF da Empreita: popup "O que mostrar" antes de gerar (25/09/2026) ----
  protected readonly chavesOpcoesPdf = CHAVES_OPCOES_PDF_EMPREITA;
  protected readonly rotulosOpcoesPdf = ROTULOS_OPCOES_PDF_EMPREITA;
  protected readonly dicasOpcoesPdf = DICAS_OPCOES_PDF_EMPREITA;
  /** Sem nenhuma opção marcada o PDF sairia sem valores — o botão "Gerar PDF" fica desabilitado. */
  protected readonly algumaOpcaoPdf = computed(() => CHAVES_OPCOES_PDF_EMPREITA.some((chave) => this.opcoesPdf()[chave]));
  protected readonly pdfOpcoesAberto = signal(false);
  protected readonly opcoesPdf = signal<OpcoesPdfEmpreita>(opcoesDoSimplificado(true));

  /** Colunas visíveis da tabela no PDF (25/09/2026) — começam todas ligadas a cada abertura do popup. */
  protected readonly colunasPdf = signal<ColunasPdfEmpreita>({ ...COLUNAS_PDF_EMPREITA_TODAS });
  /** Só as colunas que a tela de impressão tem: Já pago/Pagamento/Saldo após pagamento exigem empreita confirmada. */
  protected readonly colunasPdfDisponiveis = computed(() => chavesColunasDisponiveis(this.store.travada()));
  protected rotuloColunaPdf(chave: keyof ColunasPdfEmpreita): string {
    return rotuloColunaPdfEmpreita(chave, this.store.travada());
  }

  /**
   * "⭳ Baixar PDF" agora só ABRE o popup (pedido do Lucas, 25/09/2026): as
   * opções partem do "Simplificar" da tela — ligado, Empreiteiro/Reserva
   * começam desmarcados —, mas mexer nelas aqui vale só pro PDF, não muda a
   * tela.
   */
  protected baixarPdf(): void {
    this.erroPdf.set(null);
    this.opcoesPdf.set(opcoesDoSimplificado(this.simplificado()));
    this.colunasPdf.set({ ...COLUNAS_PDF_EMPREITA_TODAS });
    this.pdfOpcoesAberto.set(true);
  }

  protected fecharPdfOpcoes(): void {
    if (this.gerandoPdf()) return;
    this.pdfOpcoesAberto.set(false);
  }

  protected alternarOpcaoPdf(chave: keyof OpcoesPdfEmpreita): void {
    this.opcoesPdf.update((o) => ({ ...o, [chave]: !o[chave] }));
  }

  protected alternarColunaPdf(chave: keyof ColunasPdfEmpreita): void {
    this.colunasPdf.update((c) => ({ ...c, [chave]: !c[chave] }));
  }

  /**
   * Gera e baixa o PDF da Empreita (23/08/2026) — ver EmpreitaPdfController/
   * empreita-imprimir.ts. Mesmo padrão de `Mapa.baixarPdf()`.
   */
  protected gerarPdf(): void {
    this.erroPdf.set(null);
    this.gerandoPdf.set(true);

    const opcoes = this.opcoesPdf();
    const ligadas = CHAVES_OPCOES_PDF_EMPREITA.filter((chave) => opcoes[chave]);

    const colunas = this.colunasPdf();
    const colunasLigadas = this.colunasPdfDisponiveis().filter((chave) => colunas[chave]);

    this.api.baixarEmpreitaPdf(this.empreitaId(), ligadas, colunasLigadas).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivoPdf(
          'Empreita',
          [this.store.cabecalhoEap()?.mapNumber, this.store.cabecalho().empreiteiro],
          this.empreitaId(),
        );
        link.click();
        URL.revokeObjectURL(url);
        this.gerandoPdf.set(false);
        this.pdfOpcoesAberto.set(false);
      },
      error: () => {
        this.erroPdf.set('Não foi possível gerar o PDF. Tente novamente em alguns segundos.');
        this.gerandoPdf.set(false);
        this.pdfOpcoesAberto.set(false);
      },
    });
  }

  /**
   * Fecha o período e já gera o pagamento pendente deste ciclo em seguida
   * (25/08/2026, pedido do Lucas: "apagar o botão gerar pagamento, o
   * pagamento deve ser gerado automaticamente ao finalizar um período") —
   * ver `EmpreitaStore.fecharPeriodo`, que absorveu a lógica que antes vivia
   * num método `gerarPagamento()` separado.
   */
  /**
   * "Realizar pagamento" (nome novo, 03/09/2026 — antes "Fechar
   * período", o método interno ficou com o nome antigo porque é
   * exatamente o que ele continua fazendo: fecha o período de medição E
   * gera o pagamento). Antes exigia `store.totais().totalPeriodo > 0`
   * (calculado só a partir do AVANÇO medido) — o Lucas pediu pra
   * habilitar sempre que houver "Valor a ser pago" de verdade, mesmo sem
   * avanço medido (ex.: um valor lançado manualmente no rascunho de
   * Pagamento) — por isso a checagem e o diálogo agora usam
   * `totaisEstendidos().pagamentoDraftTotal`, que já leva em conta
   * sobrescritas manuais, em vez de `totais().totalPeriodo`.
   */
  protected fecharPeriodo(): void {
    const totaisEstendidos = this.store.totaisEstendidos();

    if (this.store.temMedicaoInvalida()) {
      window.alert('Há medições menores que o acumulado. Corrija antes de fechar o período.');
      return;
    }
    if (totaisEstendidos.pagamentoDraftTotal <= 0) {
      window.alert('Nenhum valor a pagar neste período.');
      return;
    }

    const mensagem =
      `Realizar o pagamento deste período?\n\n` +
      `A pagar: ${formatarMoeda(totaisEstendidos.pagamentoDraftEmp)}\n` +
      `Reserva: ${formatarMoeda(totaisEstendidos.pagamentoDraftReserva)}\n` +
      `Total: ${formatarMoeda(totaisEstendidos.pagamentoDraftTotal)}\n\n` +
      `As medições atuais passam a ser o acumulado e um pagamento pendente é gerado automaticamente ` +
      `(confirme depois na aba Pagamentos).`;

    if (!window.confirm(mensagem)) return;
    this.store.fecharPeriodo(() => this.store.definirMedicaoHabilitada(true));
  }

  /**
   * "Resetar" (31/08/2026, pedido do Lucas): zera o % acumulado de todos
   * os serviços — útil pra recomeçar a medição de uma empreita (ex.:
   * contrato remedido do zero). Não desfaz pagamentos já gerados na aba
   * Pagamentos, só a contagem de % medido daqui pra frente — por isso o
   * aviso explícito antes de confirmar.
   */
  protected resetarAcumulado(): void {
    if (
      !window.confirm(
        'Zerar o % acumulado de TODOS os serviços desta empreita?\n\n' +
          'A medição volta a começar do zero. Pagamentos já gerados na aba Pagamentos não são desfeitos.',
      )
    ) {
      return;
    }
    this.store.resetarAcumulado();
  }

  /**
   * Exporta os serviços e os totais calculados pra planilha Excel
   * (31/08/2026, pedido do Lucas) — ver `empreita-exportar.ts`. Usa a
   * MESMA fonte que a tela (`store.linhasEstendidas()`), então a
   * planilha bate exatamente com o que está sendo exibido.
   */
  protected readonly exportandoXlsx = signal(false);

  protected async exportarXlsx(): Promise<void> {
    this.exportandoXlsx.set(true);
    try {
      const linhas: LinhaExportEmpreita[] = this.store.itens().map((item, i) => {
        const linha = this.store.linhasEstendidas()[i];
        const itemEap = this.itemEapDoServico(item);
        return {
          desc: item.desc,
          tipo: this.tiposCusto.find((t) => t.chave === item.tipo)?.rotulo ?? '',
          etapa: itemEap ? this.rotuloEap(itemEap) : '',
          qtdeContratada: item.qtdeContratada,
          contratoEmp: item.contratoEmp,
          contratoReserva: item.contratoReserva,
          orcado: linha.orcado,
          acumulado: linha.acumulado,
          atual: linha.atual,
          avanco: linha.avanco,
          pagar: linha.pagar,
          reservar: linha.reservar,
          jaPagoEmpreiteiro: linha.jaPago.empreiteiro,
          jaPagoReserva: linha.jaPago.reserva,
          medido: linha.medido,
        };
      });
      await exportarEmpreitaXlsx(linhas, this.store.totaisEstendidos(), this.empreitaId());
    } catch {
      window.alert('Não foi possível gerar a planilha.');
    } finally {
      this.exportandoXlsx.set(false);
    }
  }

  // ------------------------------------------------------------------
  protected rotuloEap(itemEap: ItemEap): string {
    const eap = String(itemEap.eap ?? '').trim();
    const desc = String(itemEap.desc ?? '').trim();
    if (eap && desc) return `${eap} - ${desc}`;
    return eap || desc || '—';
  }

  /** Cor da linha na fase de medição — ver `classificarSituacaoMedicao`. Sem cor antes de "Realizar medição". */
  protected situacaoMedicao(indice: number): SituacaoMedicaoLinha {
    return this.store.pagamentoIniciado() ? classificarSituacaoMedicao(this.linha(indice)) : null;
  }

  protected linha(indice: number): LinhaEmpreitaEstendida {
    return this.store.linhasEstendidas()[indice];
  }

  /**
   * "% avanço" agregado do período (03/09/2026, pedido do Lucas: faltava
   * em "Medição deste período") — mesma ponderação por `contratoEmp` já
   * usada em "% Medida" na lista de Empreitas (a Reserva fica de fora: é
   * retenção discricionária, desvinculada do avanço físico).
   */
  protected readonly percentualAvancoPeriodo = computed(() => {
    const itens = this.store.itens();
    const linhas = this.store.linhasEstendidas();
    let somaPonderada = 0;
    let somaContrato = 0;
    for (let i = 0; i < itens.length; i++) {
      const contrato = itens[i].contratoEmp || 0;
      if (contrato <= 0) continue;
      somaPonderada += linhas[i].avanco * contrato;
      somaContrato += contrato;
    }
    return somaContrato > 0 ? somaPonderada / somaContrato : 0;
  });

  private itemEapDoServico(item: ItemEmpreita): ItemEap | undefined {
    return this.store.itensEap().find((i) => i.id === item.eapId);
  }

  protected rotuloTipo(chave: ChaveTipo): string {
    return this.tiposCusto.find((t) => t.chave === chave)?.rotulo ?? chave;
  }

  protected percentualOuVazio(valor: number | null | undefined): string {
    if (valor === null || valor === undefined) return '';
    return valor ? String(valor).replace('.', ',') : '';
  }

  protected moedaOuVazio(valor: number): string {
    return valor ? formatarMoeda(valor) : '';
  }

  /**
   * Igual `moedaOuVazio`, mas SEMPRE formata, mesmo R$0,00 (03/09/2026,
   * pedido do Lucas: "permitir que os valores de pagamento apareçam,
   * mesmo se uma empreita não tiver medição") — usado só nos campos de
   * Já pago/Pagamento/Saldo após pagamento, onde 0 é uma resposta válida
   * ("ainda não tem nada"), não "campo vazio pra digitar" (esses
   * continuam usando `moedaOuVazio`, ex.: Contrato/Saldo disp.).
   */
  protected moedaSempre(valor: number): string {
    return formatarMoeda(valor);
  }

  protected valorContrato(item: ItemEmpreita, campo: 'contratoEmp' | 'contratoReserva'): string {
    return this.moedaOuVazio(Number(item[campo]) || 0);
  }

  protected valorContratoTotal(indice: number): string {
    return this.moedaOuVazio(this.linha(indice).contrato);
  }

  // ---- Saldo disp. (Contrato) ----
  protected valorSaldoDisp(indice: number): number {
    return this.linha(indice).saldoDisp;
  }

  // ---- Quantidades (só em edição — 25/08/2026, pedido do Lucas) ----
  protected valorQtdeEap(item: ItemEmpreita): string {
    const valor = this.itemEapDoServico(item)?.qtde;
    return this.percentualOuVazio(valor ?? null);
  }

  protected valorUnidEap(item: ItemEmpreita): string {
    return this.itemEapDoServico(item)?.unid ?? '';
  }

  protected numQtdeDisp(indice: number): number {
    return this.linha(indice).qtdeDisp;
  }

  protected valorQtdeDisp(indice: number, item: ItemEmpreita): string {
    const valor = Number(this.numQtdeDisp(indice).toFixed(2));
    if (!valor) return '';
    const unid = this.itemEapDoServico(item)?.unid ? ` ${this.itemEapDoServico(item)?.unid}` : '';
    return `${String(valor).replace('.', ',')}${unid}`;
  }

  // ---- Medição de contrato: toggle R$ ⇄ % ⇄ Qtde ----
  protected readonly unidadeMedicaoPorItem = signal<Record<string, UnidadeMedicao>>({});

  protected unidadeMedicaoDe(itemId: string): UnidadeMedicao {
    return this.unidadeMedicaoPorItem()[itemId] ?? 'pct';
  }

  private static readonly CICLO_UNIDADE: Record<UnidadeMedicao, UnidadeMedicao> = {
    pct: 'valor',
    valor: 'qtde',
    qtde: 'pct',
  };

  protected alternarUnidadeMedicao(itemId: string): void {
    this.unidadeMedicaoPorItem.update((m) => ({ ...m, [itemId]: Empreita.CICLO_UNIDADE[this.unidadeMedicaoDe(itemId)] }));
  }

  protected rotuloUnidadeMedicao(unidade: UnidadeMedicao): string {
    return unidade === 'pct' ? '%' : unidade === 'valor' ? 'R$' : 'Qtde';
  }

  private exibirMedicao(indice: number, item: ItemEmpreita, pct: number | null | undefined): string {
    if (pct === null || pct === undefined) return '';
    const unidade = this.unidadeMedicaoDe(item.id);

    if (unidade === 'pct') return this.percentualOuVazio(pct);

    if (unidade === 'valor') {
      const contratoTotal = this.linha(indice).contrato;
      return this.moedaOuVazio(pctParaValorContrato(pct, contratoTotal));
    }

    // qtde — referência é a Quantidade contratada DESTE serviço, não a
    // quantidade total do item da EAP (25/08/2026, pedido do Lucas: o
    // contrato pode cobrir só uma parte do item).
    const qtdeTotal = Number(item.qtdeContratada) || 0;
    const qtde = Number(pctParaQtde(pct, qtdeTotal).toFixed(2));
    if (!qtde) return '';
    const itemEap = this.itemEapDoServico(item);
    const unid = itemEap?.unid ? ` ${itemEap.unid}` : '';
    return `${String(qtde).replace('.', ',')}${unid}`;
  }

  protected valorMedicaoAcumuladaExibida(indice: number, item: ItemEmpreita): string {
    return this.exibirMedicao(indice, item, item.medicaoAcum);
  }

  protected valorMedicaoAtualExibida(indice: number, item: ItemEmpreita): string {
    return this.exibirMedicao(indice, item, item.medicaoAtual);
  }

  protected valorAvanco(indice: number): string {
    return this.percentualOuVazio(this.linha(indice).avanco);
  }

  /**
   * Converte o texto digitado (na unidade ativa da linha) de volta pra
   * percentual, antes de gravar. Só "Atual" — o "Acumulado" não é mais
   * editável pelo usuário (25/08/2026, pedido do Lucas: "o sistema que
   * preenche automaticamente" — vira o novo acumulado sozinho quando o
   * período é fechado, ver `EmpreitaStore.avancarPeriodo`).
   */
  protected editarMedicao(indice: number, item: ItemEmpreita, campo: 'medicaoAtual', evento: Event): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    if (bruto === '') {
      this.store.atualizarMedicao(item.id, campo, null);
      return;
    }

    const numero = parsearBR(bruto);
    const unidade = this.unidadeMedicaoDe(item.id);
    let pct = numero;
    if (unidade === 'valor') {
      const contratoTotal = this.linha(indice).contrato;
      pct = valorContratoParaPct(numero, contratoTotal);
    } else if (unidade === 'qtde') {
      const qtdeTotal = Number(item.qtdeContratada) || 0;
      pct = qtdeParaPct(numero, qtdeTotal);
    }

    const limitado = limitarPercentual(pct);
    this.store.atualizarMedicao(item.id, campo, limitado);

    // Aviso de regresso (26/09/2026): medição atual menor que a acumulada.
    const acumulado = this.linha(indice).acumulado;
    if (limitado < acumulado - 0.0001) {
      window.alert(
        `Atenção: a medição atual (${limitado.toLocaleString('pt-BR')}%) ficou MENOR que a acumulada (${acumulado.toLocaleString('pt-BR')}%) em "${item.desc || 'Serviço'}". Uma medição não pode regredir — corrija o valor antes de realizar o pagamento.`,
      );
    }
  }

  // ---- Quantidade contratada (referência do toggle Qtde) ----
  protected valorQtdeContratadaExibida(item: ItemEmpreita): string {
    const valor = item.qtdeContratada;
    if (valor === null || valor === undefined) return '';
    const itemEap = this.itemEapDoServico(item);
    const unid = itemEap?.unid ? ` ${itemEap.unid}` : '';
    return `${String(valor).replace('.', ',')}${unid}`;
  }

  protected editarQtdeContratada(item: ItemEmpreita, evento: Event): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    this.store.atualizarQtdeContratada(item.id, bruto === '' ? null : parsearBR(bruto));
  }

  // ---- Já pago (acumulado dos pagamentos confirmados) ----
  protected valorJaPagoEmpreiteiro(indice: number): string {
    return this.moedaSempre(this.linha(indice).jaPago.empreiteiro);
  }

  protected valorJaPagoReserva(indice: number): string {
    return this.moedaSempre(this.linha(indice).jaPago.reserva);
  }

  protected valorJaPagoTotal(indice: number): string {
    return this.moedaSempre(this.linha(indice).jaPago.total);
  }

  /** "Medido" (coluna Já pago): acumulado × valor do empreiteiro; com a tela simplificada, × total do contrato. */
  protected valorMedido(indice: number): string {
    const linha = this.linha(indice);
    return this.moedaSempre(this.simplificado() ? linha.medidoContrato : linha.medido);
  }

  // ---- Pagamento (rascunho do período, editável) ----
  /** "Disponível (emp.)": (acumulado + avanço) × empreiteiro − já pago ao empreiteiro; simplificada: sobre o total do contrato. */
  protected numDisponivel(indice: number): number {
    const linha = this.linha(indice);
    return this.simplificado() ? linha.disponivelContrato : linha.disponivelEmp;
  }

  protected totalDisponivel(): number {
    const totais = this.store.totaisEstendidos();
    return this.simplificado() ? totais.disponivelContratoTotal : totais.disponivelEmpTotal;
  }

  /** "Medição" do Saldo remanescente: o que falta medir, (100% − medição atual) × total do contrato. */
  protected numSaldoMedicao(indice: number): number {
    return this.linha(indice).saldoMedicao;
  }

  protected totalSaldoMedicao(): number {
    return this.store.totaisEstendidos().saldoMedicaoTotal;
  }


  protected valorPagamentoDraftExibido(indice: number, campo: 'pagamentoEmpDraft' | 'pagamentoReservaDraft'): string {
    return this.moedaSempre(this.linha(indice)[campo]);
  }

  protected valorPagamentoDraftTotal(indice: number): string {
    return this.moedaSempre(this.linha(indice).pagamentoDraftTotal);
  }

  protected editarPagamentoDraft(item: ItemEmpreita, campo: 'pagamentoEmp' | 'pagamentoReserva', evento: Event): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    this.store.atualizarPagamentoDraft(item.id, campo, bruto === '' ? null : parsearBR(bruto));
  }

  // ---- Saldo após pagamento ----
  protected valorSaldoAposPagamentoEtapa(indice: number): number {
    return this.linha(indice).saldoAposPagamentoEtapa;
  }

  protected valorSaldoAposPagamentoEmp(indice: number): number {
    return this.linha(indice).saldoAposPagamentoEmp;
  }

  protected valorSaldoAposPagamentoReserva(indice: number): number {
    return this.linha(indice).saldoAposPagamentoReserva;
  }

  protected valorSaldoAposPagamentoTotal(indice: number): number {
    return this.linha(indice).saldoAposPagamentoTotal;
  }
}
