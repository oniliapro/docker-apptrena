import { Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { formatarMoeda, hojeIso } from '../../core/utils/formato';
import { NavegacaoTabela } from '../../shared/navegacao-tabela/navegacao-tabela';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
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
  imports: [NavegacaoTabela, RedimensionarColunas],
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

  protected readonly mostrarEtapas = signal(true);

  /** Rascunho do modal. Null = modal fechado. */
  protected readonly rascunho = signal<Recebimento | null>(null);
  private idEditando: string | null = null;

  protected readonly editando = computed(() => this.idEditando !== null);

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

  protected readonly somaItens = computed(() => {
    const rascunho = this.rascunho();
    return rascunho ? calcularSomaItens(rascunho) : 0;
  });

  protected readonly diferenca = computed(() => {
    const rascunho = this.rascunho();
    return rascunho ? rascunho.valorTotal - this.somaItens() : 0;
  });

  protected readonly diferencaAberta = computed(() => Math.abs(this.diferenca()) > 0.01);

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
    this.idEditando = null;
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
    this.idEditando = recebimento.id;
    this.rascunho.set(normalizarRecebimento(JSON.parse(JSON.stringify(recebimento))));
  }

  protected fecharModal(): void {
    this.rascunho.set(null);
    this.idEditando = null;
  }

  protected atualizarCampo(campo: keyof Recebimento, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.rascunho.update((r) => (r ? { ...r, [campo]: valor } : r));
  }

  protected atualizarValorTotal(evento: Event): void {
    const valor = parsearBR((evento.target as HTMLInputElement).value);
    this.rascunho.update((r) => (r ? { ...r, valorTotal: valor } : r));
  }

  protected adicionarItem(): void {
    this.rascunho.update((r) =>
      r
        ? {
            ...r,
            itens: [
              ...r.itens,
              { id: gerarId(), descricao: '', tipo: '', eapId: '', valor: 0, modoValor: 'valor' },
            ],
          }
        : r,
    );
  }

  /** Shift + `-` na tabela de itens do modal: remove a linha atual. */
  protected removerItemPorIndice(indiceLinha: number): void {
    const item = this.rascunho()?.itens[indiceLinha];
    if (item) this.removerItem(item.id);
  }

  protected removerItem(id: string): void {
    this.rascunho.update((r) => (r ? { ...r, itens: r.itens.filter((i) => i.id !== id) } : r));
  }

  protected atualizarItem(id: string, campo: keyof ItemRecebimento, evento: Event): void {
    const bruto = (evento.target as HTMLInputElement | HTMLSelectElement).value;
    const valor = campo === 'valor' ? parsearBR(bruto) : String(bruto ?? '');

    this.rascunho.update((r) =>
      r ? { ...r, itens: r.itens.map((i) => (i.id === id ? { ...i, [campo]: valor } : i)) } : r,
    );
  }

  protected alternarModoItem(id: string): void {
    this.rascunho.update((r) =>
      r
        ? {
            ...r,
            itens: r.itens.map((i) =>
              i.id === id
                ? { ...i, modoValor: i.modoValor === 'percentual' ? 'valor' : 'percentual' }
                : i,
            ),
          }
        : r,
    );
  }

  protected valorItemEditado(item: ItemRecebimento): string {
    if (!item.valor) return '';
    return item.modoValor === 'percentual'
      ? formatarPercentual(item.valor)
      : formatarMoeda(item.valor);
  }

  protected valorResolvido(item: ItemRecebimento): number {
    return calcularValorItem(item, this.rascunho()?.valorTotal ?? 0);
  }

  protected salvar(): void {
    const rascunho = this.rascunho();
    if (!rascunho) return;

    const recebimento: Recebimento = {
      ...rascunho,
      numeroRecebimento:
        rascunho.numeroRecebimento.trim() || gerarNumeroRecebimento(this.store.recebimentos()),
      obraNumber: this.store.cabecalho().obraNumber,
    };

    const erros = validarRecebimento(recebimento);
    if (erros.length) {
      window.alert(erros.join('\n'));
      return;
    }

    this.store.inserirOuAtualizar(recebimento, this.idEditando);
    this.fecharModal();
  }

  protected remover(recebimento: Recebimento): void {
    if (!window.confirm('Excluir este recebimento?')) return;
    this.store.remover(recebimento.id);
  }

  /** Confirma um recebimento pendente — grava a data e hora do clique, mesmo padrão de `pagamentos.ts::confirmar`. */
  protected confirmar(recebimento: Recebimento): void {
    this.store.inserirOuAtualizar(
      { ...recebimento, status: 'confirmado', dataRecebimento: new Date().toISOString() },
      recebimento.id,
    );
  }
}
