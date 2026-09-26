import { Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { formatarMoeda, hojeIso } from '../../core/utils/formato';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { EditarRecebimentoModal, EventoSalvarRecebimento } from './editar-recebimento-modal/editar-recebimento-modal';
import {
  calcularSomaItens,
  calcularValorItem,
  expandirItensRecebimento,
  formatarPercentual,
  gerarId,
  gerarNumeroRecebimento,
  normalizarRecebimento,
  parsearBR,
  rotuloTipo,
  validarRecebimento,
} from './recebimentos-calc';
import {
  ItemEapSnapshotRecebimento,
  ItemRecebimento,
  ItemRecebimentoCalculado,
  Recebimento,
  TIPOS_CUSTO_RECEBIMENTO,
} from './recebimentos.models';
import { RecebimentosStore } from './recebimentos.store';
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

type ColunaRecebimento =
  | 'obra'
  | 'numeroRecebimento'
  | 'dataSolicitacao'
  | 'descricao'
  | 'valorTotal'
  | 'cliente'
  | 'dataRecebimento'
  | 'status';

/**
 * Recebimentos — mirror de `pagamentos.ts` (01/09/2026, pedido do Lucas:
 * "funciona exatamente como os pagamentos"), com uma diferença
 * deliberada: não tem "ler nota fiscal por foto" — é uma leitura de NOTA
 * DE COMPRA (fornecedor + valor pago), um conceito do lado de despesa que
 * não se aplica a dinheiro entrando do cliente da obra.
 *
 * Já nasce com o padrão "sem coluna Itens, Etapas condensadas" (mesma
 * mudança feita em `pagamentos.ts` nesta rodada) — a lista mostra uma
 * linha por ETAPA (soma dos itens daquela etapa), não uma por item.
 */
@Component({
  selector: 'app-recebimentos',
  imports: [RedimensionarColunas, BarraSelecao, EditarRecebimentoModal],
  providers: [RecebimentosStore],
  templateUrl: './recebimentos.html',
  styleUrl: './recebimentos.scss',
})
export class Recebimentos implements OnInit {
  protected readonly store = inject(RecebimentosStore);

  /** Id da obra — vem do param `:id` da rota pai (/obras/:id). */
  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly tipos = TIPOS_CUSTO_RECEBIMENTO;
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly rotuloTipo = rotuloTipo;

  /** "Mostrar etapas" nasce DESLIGADO (25/09/2026, pedido do Lucas). */
  protected readonly mostrarEtapas = signal(false);

  /** Rascunho do modal. Null = modal fechado. */
  protected readonly rascunho = signal<Recebimento | null>(null);
  /** Id do recebimento aberto no popup; `null` = novo (é um signal para `editando` reagir — computed sobre campo comum ficava travado no 1º valor). */
  private readonly idEditando = signal<string | null>(null);

  protected readonly editando = computed(() => this.idEditando() !== null);

  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaRecebimento> | null>(null);
  protected readonly setaOrdenacao = setaOrdenacao;
  protected readonly busca = signal('');
  protected readonly filtroStatus = signal<'todos' | 'pendente' | 'confirmado'>('todos');
  protected readonly filtroCliente = signal('');
  protected readonly filtroDataDe = signal('');
  protected readonly filtroDataAte = signal('');

  protected readonly clientesDisponiveis = computed(() =>
    valoresDistintos(this.store.recebimentos(), (r) => r.cliente ?? ''),
  );

  protected alternarOrdenacaoColuna(coluna: ColunaRecebimento): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroStatus(evento: Event): void {
    this.filtroStatus.set((evento.target as HTMLSelectElement).value as 'todos' | 'pendente' | 'confirmado');
  }

  protected mudarFiltroCliente(evento: Event): void {
    this.filtroCliente.set((evento.target as HTMLSelectElement).value);
  }

  protected mudarFiltroDataDe(evento: Event): void {
    this.filtroDataDe.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroDataAte(evento: Event): void {
    this.filtroDataAte.set((evento.target as HTMLInputElement).value);
  }

  protected obraDoRecebimento(recebimento: Recebimento): string {
    return recebimento.obraNumber || this.store.cabecalho().obraNumber || this.store.obraNome() || '—';
  }

  protected readonly listaExibida = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const status = this.filtroStatus();
    const cliente = this.filtroCliente();
    const de = this.filtroDataDe();
    const ate = this.filtroDataAte();

    const filtrada = [...this.store.recebimentos()].reverse().filter((r) => {
      if (status !== 'todos' && r.status !== status) return false;
      if (cliente && r.cliente !== cliente) return false;
      if (!dataDentroDoIntervalo(r.dataSolicitacao, de, ate)) return false;
      if (!termo) return true;
      return [this.obraDoRecebimento(r), r.numeroRecebimento, r.cliente, r.descricao]
        .join(' ')
        .toLowerCase()
        .includes(termo);
    });

    return ordenarPor(filtrada, this.ordenacao(), (r, coluna) =>
      coluna === 'obra' ? this.obraDoRecebimento(r) : r[coluna],
    );
  });

  /** Número sugerido se o campo for salvo em branco. */
  protected readonly numeroSugerido = computed(() => gerarNumeroRecebimento(this.store.recebimentos()));

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

  /** Uma linha por ETAPA (soma dos itens daquela etapa) — mesmo padrão de `pagamentos.ts`. */
  protected etapasAgrupadas(recebimento: Recebimento): { eapId: string; rotulo: string; valor: number }[] {
    const itensComEtapa = expandirItensRecebimento(recebimento).filter((it) => String(it.eapId ?? '').trim());

    const porEtapa = new Map<string, ItemRecebimentoCalculado[]>();
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

  protected rotuloEapItem(item: ItemEapSnapshotRecebimento | undefined): string {
    if (!item) return '—';
    const eap = item.eap.trim();
    const desc = item.desc.trim();
    if (eap && desc) return `${eap} - ${desc}`;
    return eap || desc || '—';
  }

  /** Indentação do select pelo nível da EAP (1.2.3 → dois níveis). */
  protected recuoEap(item: ItemEapSnapshotRecebimento): string {
    const nivel = item.eap.split('.').filter(Boolean).length - 1;
    return ' '.repeat(Math.max(0, nivel) * 3);
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

  /** Só a parte `YYYY-MM-DD` de `dataRecebimento` (que grava data+hora) — ver `pagamentos.ts::somenteData`. */
  protected somenteData(iso: string): string {
    return String(iso ?? '').slice(0, 10);
  }

  // ------------------------------------------------------------------
  // Modal
  // ------------------------------------------------------------------
  protected novoRecebimento(): void {
    this.idEditando.set(null);
    this.rascunho.set({
      id: gerarId(),
      numeroRecebimento: gerarNumeroRecebimento(this.store.recebimentos()),
      obraNumber: this.store.cabecalho().obraNumber,
      dataSolicitacao: hojeIso(),
      dataRecebimento: '',
      cliente: '',
      descricao: '',
      valorTotal: 0,
      itens: [],
      origem: null,
      status: 'confirmado',
    });
  }

  protected editar(recebimento: Recebimento): void {
    this.idEditando.set(recebimento.id);
    this.rascunho.set(recebimento);
  }

  protected excluirDoModal(recebimento: Recebimento): void {
    this.store.remover(recebimento.id);
    this.fecharModal();
  }

  protected fecharModal(): void {
    this.rascunho.set(null);
    this.idEditando.set(null);
  }

  /** O popup (`EditarRecebimentoModal`) já validou e preencheu número/obra: só persiste. */
  protected salvar(evento: EventoSalvarRecebimento): void {
    this.store.inserirOuAtualizar(evento.recebimento, this.idEditando());
    this.fecharModal();
  }

  // ------------------------------------------------------------------
  // Seleção múltipla + "Copiar mensagem" pro WhatsApp (02/09/2026, pedido
  // do Lucas). Formato provisório — mesmo esquema de `Pagamentos`.
  // ------------------------------------------------------------------
  protected readonly selecao = new SelecaoMultipla<Recebimento>((recebimento) => recebimento.id);

  // ---- Ações da seleção (20/09/2026): clicar na linha edita; marcar habilita "Editar" (com 1), "Confirmar pendentes" e "Excluir". ----
  protected readonly selecionados = computed(() => this.selecao.selecionados(this.listaExibida()));
  protected readonly acoesLista = computed<AcaoLista[]>(() => {
    const temPendente = this.selecionados().some((r) => r.status === 'pendente');
    return [
      ...(temPendente ? [{ chave: 'confirmar', rotulo: 'Confirmar pendentes' }] : []),
      { chave: 'excluir', rotulo: 'Excluir', perigo: true },
    ];
  });

  protected editarSelecionado(): void {
    const [primeiro] = this.selecionados();
    if (primeiro) this.editar(primeiro);
  }

  private rotuloDe(r: Recebimento): string {
    return [r.numeroRecebimento, r.descricao].filter(Boolean).join(' — ') || '(sem número)';
  }

  /** Botão ✔ da linha (21/09/2026): confirma este recebimento pendente. */
  protected confirmarUm(recebimento: Recebimento): void {
    this.store.inserirOuAtualizar(
      { ...recebimento, status: 'confirmado', dataRecebimento: new Date().toISOString() },
      recebimento.id,
    );
  }

  /** Botão ✖ da linha (21/09/2026): exclui só este recebimento, com a confirmação de sempre. */
  protected removerUm(recebimento: Recebimento): void {
    if (!window.confirm('Excluir este recebimento?')) return;
    this.store.remover(recebimento.id);
  }

  protected aoAcaoLista(chave: string): void {
    const alvos = this.selecionados();
    if (!alvos.length) return;

    if (chave === 'confirmar') {
      const pendentes = alvos.filter((r) => r.status === 'pendente');
      if (!pendentes.length) return;
      const texto = pendentes.length === 1 ? '1 recebimento pendente' : `${pendentes.length} recebimentos pendentes`;
      if (!window.confirm(`Confirmar ${texto}? Passam a contar como recebidos.`)) return;

      this.store.confirmarVarios(pendentes).subscribe(({ falhas }) => {
        this.selecao.limpar();
        avisarFalhasDeExclusao(falhas, 'recebimentos', (r) => this.rotuloDe(r), 'confirmar');
      });
      return;
    }

    if (chave !== 'excluir') return;
    if (!confirmarExclusaoEmLote(alvos.length, 'recebimento', 'recebimentos', "", alvos.map((r) => this.rotuloDe(r)))) return;

    this.store.removerVarios(alvos).subscribe(({ falhas }) => {
      this.selecao.limpar();
      avisarFalhasDeExclusao(falhas, 'recebimentos', (r) => this.rotuloDe(r));
    });
  }
  protected readonly copiado = signal(false);

  protected async copiarMensagem(): Promise<void> {
    const selecionados = this.selecao.selecionados(this.listaExibida());
    if (!selecionados.length) return;

    const linhas = selecionados.map(
      (recebimento) =>
        `• Nº ${recebimento.numeroRecebimento || '—'} — ${recebimento.cliente || '—'} — ${this.formatarMoeda(recebimento.valorTotal)} — ${recebimento.status === 'pendente' ? 'Pendente' : 'Confirmado'}`,
    );
    const totalGeral = selecionados.reduce((soma, recebimento) => soma + recebimento.valorTotal, 0);
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
