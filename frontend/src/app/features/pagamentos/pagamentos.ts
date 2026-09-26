import { Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';

import { formatarMoeda, hojeIso } from '../../core/utils/formato';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import {
  expandirItensPagamento,
  gerarId,
  gerarNumeroPagamento,
  normalizarPagamento,
  rotuloTipo,
} from './pagamentos-calc';
import { EditarPagamentoModal, EventoSalvarPagamento } from './editar-pagamento-modal/editar-pagamento-modal';
import { AnexosLancamento } from '../../shared/anexos-lancamento/anexos-lancamento';
import { ItemEapSnapshot, ItemPagamentoCalculado, Pagamento } from './pagamentos.models';
import { PagamentosStore } from './pagamentos.store';
import { montarMensagemResumoCustos } from './pagamentos-mensagem';
import { Beneficiados, chaveDoNome } from '../cadastros/beneficiados';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';
import { dataDentroDoIntervalo, valoresDistintos } from '../../shared/filtros/filtros';
import { BarraSelecao, AcaoLista } from '../../shared/barra-selecao/barra-selecao';
import {
  SelecaoMultipla,
  avisarFalhasDeExclusao,
  confirmarExclusaoEmLote,
  copiarParaAreaDeTransferencia,
} from '../../shared/selecao-lista/selecao-lista';

type ColunaPagamento =
  | 'obra'
  | 'numeroPagamento'
  | 'dataSolicitacao'
  | 'descricao'
  | 'valorTotal'
  | 'fornecedor'
  | 'dataPagamento'
  | 'status';

/**
 * Pagamentos — portado de js/pagamentos/*.js.
 *
 * Cada pagamento tem um valor total e uma lista de itens que o rateiam,
 * em reais ou em percentual do total. A tela impede salvar enquanto a
 * soma dos itens não bater com o total — a regra central do módulo.
 */
@Component({
  selector: 'app-pagamentos',
  imports: [RedimensionarColunas, EditarPagamentoModal, AnexosLancamento, BarraSelecao],
  providers: [PagamentosStore],
  templateUrl: './pagamentos.html',
  styleUrl: './pagamentos.scss',
})
export class Pagamentos implements OnInit {
  protected readonly store = inject(PagamentosStore);
  private readonly api = inject(ApiService);
  private readonly beneficiados = inject(Beneficiados);

  /**
   * Id da obra — vem do param `:id` da rota pai (/obras/:id), herdado
   * via `withRouterConfig({ paramsInheritanceStrategy: 'always' })` em
   * app.config.ts. Mesmo mecanismo usado pela EAP. Não confundir com
   * `obraNumber` do cabeçalho, campo de texto livre digitado à mão.
   */
  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly rotuloTipo = rotuloTipo;

  /** "Mostrar etapas" nasce DESLIGADO (25/09/2026, pedido do Lucas). */
  protected readonly mostrarEtapas = signal(false);

  /** Rascunho do modal. Null = modal fechado. */
  protected readonly rascunho = signal<Pagamento | null>(null);
  /** Id do pagamento aberto no popup; `null` = novo. Signal para `editando` reagir (um computed sobre campo comum ficava travado no 1º valor). */
  private readonly idEditando = signal<string | null>(null);

  protected readonly editando = computed(() => this.idEditando() !== null);

  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaPagamento> | null>(null);
  protected readonly setaOrdenacao = setaOrdenacao;
  protected readonly busca = signal('');
  protected readonly filtroStatus = signal<'todos' | 'pendente' | 'confirmado'>('todos');
  protected readonly filtroFornecedor = signal('');
  protected readonly filtroDataDe = signal('');
  protected readonly filtroDataAte = signal('');

  protected readonly fornecedoresDisponiveis = computed(() =>
    valoresDistintos(this.store.pagamentos(), (p) => p.fornecedor ?? ''),
  );

  protected alternarOrdenacaoColuna(coluna: ColunaPagamento): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroStatus(evento: Event): void {
    this.filtroStatus.set((evento.target as HTMLSelectElement).value as 'todos' | 'pendente' | 'confirmado');
  }

  protected mudarFiltroFornecedor(evento: Event): void {
    this.filtroFornecedor.set((evento.target as HTMLSelectElement).value);
  }

  protected mudarFiltroDataDe(evento: Event): void {
    this.filtroDataDe.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroDataAte(evento: Event): void {
    this.filtroDataAte.set((evento.target as HTMLInputElement).value);
  }

  protected obraDoPagamento(pagamento: Pagamento): string {
    return pagamento.obraNumber || this.store.cabecalho().obraNumber || this.store.obraNome() || '—';
  }

  /**
   * Lista exibida: mais recentes primeiro por padrão, como no app atual —
   * só reordena de verdade quando o usuário clica num cabeçalho
   * (18/08/2026, pedido do Lucas). Busca e filtros entram antes da
   * ordenação.
   */
  protected readonly listaExibida = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const status = this.filtroStatus();
    const fornecedor = this.filtroFornecedor();
    const de = this.filtroDataDe();
    const ate = this.filtroDataAte();

    const filtrada = [...this.store.pagamentos()].reverse().filter((p) => {
      if (status !== 'todos' && p.status !== status) return false;
      if (fornecedor && p.fornecedor !== fornecedor) return false;
      if (!dataDentroDoIntervalo(p.dataSolicitacao, de, ate)) return false;
      if (!termo) return true;
      return [this.obraDoPagamento(p), p.numeroPagamento, p.fornecedor, p.descricao]
        .join(' ')
        .toLowerCase()
        .includes(termo);
    });

    return ordenarPor(filtrada, this.ordenacao(), (p, coluna) =>
      coluna === 'obra' ? this.obraDoPagamento(p) : p[coluna],
    );
  });

  ngOnInit(): void {
    this.store.carregar(this.obraId());
  }

  // ------------------------------------------------------------------
  // Cabeçalho e tabela
  // ------------------------------------------------------------------
  protected trocarObra(evento: Event): void {
    this.store.definirObra((evento.target as HTMLInputElement).value);
  }

  protected alternarEtapas(): void {
    this.mostrarEtapas.update((v) => !v);
  }

  /**
   * Uma linha por ETAPA (não por item, 01/09/2026, pedido do Lucas: "uma
   * etapa aparece com o valor total no pagamento e não seus valores
   * fracionados") — agrupa os itens do pagamento com `eapId` preenchido e
   * soma o valor calculado de cada grupo. Rótulo mostra o tipo entre
   * parênteses só quando TODOS os itens do grupo forem da mesma
   * categoria — uma etapa que mistura Material e Mão de obra, por
   * exemplo, mostra só o nome da etapa, pra não sugerir uma categoria que
   * não é bem isso.
   */
  protected etapasAgrupadas(pagamento: Pagamento): { eapId: string; rotulo: string; valor: number }[] {
    const itensComEtapa = expandirItensPagamento(pagamento).filter((it) => String(it.eapId ?? '').trim());

    const porEtapa = new Map<string, ItemPagamentoCalculado[]>();
    for (const item of itensComEtapa) {
      const lista = porEtapa.get(item.eapId) ?? [];
      lista.push(item);
      porEtapa.set(item.eapId, lista);
    }

    return Array.from(porEtapa.entries()).map(([eapId, itens]) => {
      const valor = itens.reduce((soma, item) => soma + item.valorCalculado, 0);
      const tiposDistintos = new Set(itens.map((item) => item.tipo));
      const rotuloBase = this.rotuloEtapa(eapId);
      const rotulo = tiposDistintos.size === 1 ? `${rotuloBase} (${rotuloTipo(itens[0].tipo)})` : rotuloBase;
      return { eapId, rotulo, valor };
    });
  }

  protected rotuloEtapa(eapId: string): string {
    const item = this.store.snapshotEap().find((x) => x.id === eapId);
    return this.rotuloEapItem(item);
  }

  protected rotuloEapItem(item: ItemEapSnapshot | undefined): string {
    if (!item) return '—';
    const eap = item.eap.trim();
    const desc = item.desc.trim();
    if (eap && desc) return `${eap} - ${desc}`;
    return eap || desc || '—';
  }

  protected formatarDataPtBr(iso: string): string {
    const texto = String(iso ?? '');
    if (!texto) return '—';

    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      const [ano, mes, dia] = texto.split('-').map(Number);
      return new Date(ano, (mes || 1) - 1, dia || 1).toLocaleDateString('pt-BR');
    }

    const data = new Date(texto);
    return Number.isNaN(data.getTime()) ? texto : data.toLocaleString('pt-BR');
  }

  // ------------------------------------------------------------------
  // Modal — edição em si mora em `EditarPagamentoModal` (06/09/2026,
  // extraído daqui pra poder ser reaberto de outras telas, ex.: o popup
  // de pagamentos vinculados do Mapa, ver `mapas-obra.ts`). Esta tela só
  // guarda QUAL pagamento está sendo editado (`rascunho`/`idEditando`) e
  // decide o que fazer quando o modal emite `salvar`.
  // ------------------------------------------------------------------
  protected novoPagamento(): void {
    this.idEditando.set(null);
    this.rascunho.set({
      id: gerarId(),
      numeroPagamento: gerarNumeroPagamento(this.store.pagamentos()),
      obraNumber: this.store.cabecalho().obraNumber,
      dataSolicitacao: hojeIso(),
      dataPagamento: '',
      fornecedor: '',
      descricao: '',
      valorTotal: 0,
      itens: [],
      origem: null,
      // Lançado à mão pelo usuário: já nasce confirmado, sem etapa de
      // aprovação — essa etapa existe só para o que o Mapa gera sozinho.
      status: 'confirmado',
    });
  }

  protected editar(pagamento: Pagamento): void {
    this.idEditando.set(pagamento.id);
    // Cópia profunda: editar o rascunho não pode mexer na lista antes de salvar.
    this.rascunho.set(normalizarPagamento(JSON.parse(JSON.stringify(pagamento))));
  }

  protected excluirDoModal(pagamento: Pagamento): void {
    this.store.remover(pagamento.id);
    this.fecharModal();
  }

  protected fecharModal(): void {
    this.rascunho.set(null);
    this.idEditando.set(null);
  }

  /**
   * `EditarPagamentoModal` já validou (rateio bate com o total) antes de
   * emitir — aqui só resta aplicar o que é específico desta tela:
   * `obraNumber` sempre segue o valor ATUAL do cabeçalho (campo "Nº da
   * obra" da barra de ferramentas), mesmo numa edição — comportamento já
   * existente antes desta extração, preservado aqui de propósito.
   *
   * `anexoNotaPendente` (06/09/2026) — só vem preenchido quando o
   * pagamento estava sendo CRIADO e uma nota fiscal foi lida com uma tag
   * escolhida (`EditarPagamentoModal.lerNota()`): naquele momento ainda
   * não existia um pagamento salvo pra usar como `origemId` do anexo, só
   * dá pra arquivar a foto agora, depois que `inserirOuAtualizar`
   * devolve o pagamento com um id de verdade.
   */
  protected salvarModal(evento: EventoSalvarPagamento): void {
    const final: Pagamento = { ...evento.pagamento, obraNumber: this.store.cabecalho().obraNumber };

    // Só se realiza pagamento para fornecedor/profissional cadastrado (26/09/2026):
    // recusado o cadastro, o pagamento NÃO é salvo como confirmado e o modal continua aberto.
    if (final.status !== 'confirmado') {
      this.persistirModal(final, evento.anexoNotaPendente);
      return;
    }
    this.beneficiados.resolver([final.fornecedor]).subscribe((recusados) => {
      if (recusados.length) {
        window.alert(Beneficiados.mensagemRecusa(recusados));
        return;
      }
      this.persistirModal(final, evento.anexoNotaPendente);
    });
  }

  private persistirModal(final: Pagamento, anexoNotaPendente: EventoSalvarPagamento['anexoNotaPendente']): void {
    this.store.inserirOuAtualizar(final, this.idEditando(), (salvo) => {
      if (!anexoNotaPendente) return;
      this.api.anexarArquivoPagamento(salvo.id, anexoNotaPendente.tagId, anexoNotaPendente.arquivo).subscribe({
        // Só a contagem local — a lista já foi atualizada pelo próprio
        // `inserirOuAtualizar` com o `anexosCount` de ANTES de arquivar
        // esta nota (o backend não sabia dela ainda naquele momento).
        next: () =>
          this.store.pagamentos.update((lista) =>
            lista.map((p) => (p.id === salvo.id ? { ...p, anexosCount: (p.anexosCount || 0) + 1 } : p)),
          ),
        error: () => window.alert('O pagamento foi salvo, mas não foi possível arquivar a nota fiscal lida.'),
      });
    });
    this.fecharModal();
  }

  // ------------------------------------------------------------------
  // Popup de anexos (06/09/2026, coluna "Anexos" da lista) — reaproveita
  // o MESMO `AnexosLancamento` de dentro do modal de edição, só que
  // aberto direto da lista, sem passar pela tela de edição inteira.
  // ------------------------------------------------------------------
  protected readonly anexosPopupPagamento = signal<Pagamento | null>(null);

  protected abrirAnexos(pagamento: Pagamento): void {
    this.anexosPopupPagamento.set(pagamento);
  }

  protected fecharAnexos(): void {
    this.anexosPopupPagamento.set(null);
  }


  // ------------------------------------------------------------------
  // Seleção múltipla + "Copiar mensagem" pro WhatsApp (02/09/2026, pedido
  // do Lucas). Formato provisório — mesmo esquema de `MapasObra`.
  // ------------------------------------------------------------------
  protected readonly selecao = new SelecaoMultipla<Pagamento>((pagamento) => pagamento.id);

  // ---- Ações da seleção (20/09/2026): clicar na linha edita; marcar habilita "Editar" (com 1), "Confirmar pendentes" e "Excluir". ----
  protected readonly selecionados = computed(() => this.selecao.selecionados(this.listaExibida()));
  protected readonly acoesLista = computed<AcaoLista[]>(() => {
    const temPendente = this.selecionados().some((p) => p.status === 'pendente');
    return [
      ...(temPendente ? [{ chave: 'confirmar', rotulo: 'Confirmar pendentes' }] : []),
      { chave: 'excluir', rotulo: 'Excluir', perigo: true },
    ];
  });

  protected editarSelecionado(): void {
    const [primeiro] = this.selecionados();
    if (primeiro) this.editar(primeiro);
  }

  private rotuloDe(p: Pagamento): string {
    return [p.numeroPagamento, p.descricao].filter(Boolean).join(' — ') || '(sem número)';
  }

  /** Botão ✔ da linha (21/09/2026): confirma este pagamento pendente (data/hora do clique como data de pagamento; dá para corrigir na edição). */
  protected confirmarUm(pagamento: Pagamento): void {
    this.beneficiados.resolver([pagamento.fornecedor]).subscribe((recusados) => {
      if (recusados.length) {
        // Beneficiado sem cadastro: não confirma e volta para a edição do pagamento.
        window.alert(Beneficiados.mensagemRecusa(recusados));
        this.editar(pagamento);
        return;
      }
      this.store.inserirOuAtualizar(
        { ...pagamento, status: 'confirmado', dataPagamento: new Date().toISOString() },
        pagamento.id,
      );
    });
  }

  /** Botão ✖ da linha (21/09/2026): exclui só este pagamento, com a confirmação de sempre. */
  protected removerUm(pagamento: Pagamento): void {
    if (!window.confirm('Excluir este pagamento?')) return;
    this.store.remover(pagamento.id);
  }

  protected aoAcaoLista(chave: string): void {
    const alvos = this.selecionados();
    if (!alvos.length) return;

    if (chave === 'confirmar') {
      const pendentes = alvos.filter((p) => p.status === 'pendente');
      if (!pendentes.length) return;
      const texto = pendentes.length === 1 ? '1 pagamento pendente' : `${pendentes.length} pagamentos pendentes`;
      if (!window.confirm(`Confirmar ${texto}? Passam a contar no Realizado da EAP.`)) return;

      this.beneficiados.resolver(pendentes.map((p) => p.fornecedor)).subscribe((recusados) => {
        const barrados = new Set(recusados.map(chaveDoNome));
        const aptos = pendentes.filter((p) => !barrados.has(chaveDoNome(p.fornecedor)));
        if (recusados.length) {
          window.alert(Beneficiados.mensagemRecusa(recusados, pendentes.length - aptos.length));
        }
        if (!aptos.length) return;
        this.store.confirmarVarios(aptos).subscribe(({ falhas }) => {
          this.selecao.limpar();
          avisarFalhasDeExclusao(falhas, 'pagamentos', (p) => this.rotuloDe(p), 'confirmar');
        });
      });
      return;
    }

    if (chave !== 'excluir') return;
    if (!confirmarExclusaoEmLote(alvos.length, 'pagamento', 'pagamentos', "Se algum foi gerado por um mapa ou por uma empreita, ele deixa de constar no acompanhamento deles.", alvos.map((p) => this.rotuloDe(p)))) return;

    this.store.removerVarios(alvos).subscribe(({ falhas }) => {
      this.selecao.limpar();
      avisarFalhasDeExclusao(falhas, 'pagamentos', (p) => this.rotuloDe(p));
    });
  }
  protected readonly copiado = signal(false);

  protected async copiarMensagem(): Promise<void> {
    const selecionados = this.selecao.selecionados(this.listaExibida());
    if (!selecionados.length) return;

    // Formato "RESUMO DE CUSTOS" (25/09/2026, pedido do Lucas) — ver `pagamentos-mensagem.ts`.
    const mensagem = montarMensagemResumoCustos(selecionados);

    const ok = await copiarParaAreaDeTransferencia(mensagem);
    if (!ok) {
      window.alert('Não foi possível copiar — copie manualmente o texto abaixo:\n\n' + mensagem);
      return;
    }
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2000);
  }
}
