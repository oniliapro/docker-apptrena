import { Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';

import { formatarMoeda } from '../../core/utils/formato';
import { NavegacaoTabela } from '../../shared/navegacao-tabela/navegacao-tabela';
import { hojeIso } from '../../core/utils/formato';
import {
  calcularSomaItens,
  calcularValorItem,
  expandirItensPagamento,
  formatarPercentual,
  gerarId,
  gerarNumeroPagamento,
  normalizarPagamento,
  parsearBR,
  rotuloTipo,
  validarPagamento,
} from './pagamentos-calc';
import {
  ItemEapSnapshot,
  ItemPagamento,
  ItemPagamentoCalculado,
  Pagamento,
  TIPOS_CUSTO_PAGAMENTO,
} from './pagamentos.models';
import { PagamentosStore } from './pagamentos.store';
import { RespostaLeituraNota } from '../../core/models/api.models';

/**
 * Pagamentos — portado de js/pagamentos/*.js.
 *
 * Cada pagamento tem um valor total e uma lista de itens que o rateiam,
 * em reais ou em percentual do total. A tela impede salvar enquanto a
 * soma dos itens não bater com o total — a regra central do módulo.
 */
@Component({
  selector: 'app-pagamentos',
  imports: [NavegacaoTabela],
  providers: [PagamentosStore],
  templateUrl: './pagamentos.html',
  styleUrl: './pagamentos.scss',
})
export class Pagamentos implements OnInit {
  protected readonly store = inject(PagamentosStore);
  private readonly api = inject(ApiService);

  /**
   * Id da obra — vem do param `:id` da rota pai (/obras/:id), herdado
   * via `withRouterConfig({ paramsInheritanceStrategy: 'always' })` em
   * app.config.ts. Mesmo mecanismo usado pela EAP. Não confundir com
   * `obraNumber` do cabeçalho, campo de texto livre digitado à mão.
   */
  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly tipos = TIPOS_CUSTO_PAGAMENTO;
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly rotuloTipo = rotuloTipo;

  protected readonly mostrarEtapas = signal(true);

  /** Rascunho do modal. Null = modal fechado. */
  protected readonly rascunho = signal<Pagamento | null>(null);
  private idEditando: string | null = null;

  protected readonly editando = computed(() => this.idEditando !== null);

  /** Lista exibida: mais recentes primeiro, como no app atual. */
  protected readonly listaExibida = computed(() => [...this.store.pagamentos()].reverse());

  protected readonly somaItens = computed(() => {
    const rascunho = this.rascunho();
    return rascunho ? calcularSomaItens(rascunho) : 0;
  });

  protected readonly diferenca = computed(() => {
    const rascunho = this.rascunho();
    return rascunho ? rascunho.valorTotal - this.somaItens() : 0;
  });

  /** Vermelho quando o rateio ainda não fecha — o bloqueio para salvar. */
  protected readonly diferencaAberta = computed(() => Math.abs(this.diferenca()) > 0.01);

  // ---- Leitura de nota fiscal por foto ----
  protected readonly lendoNota = signal(false);
  protected readonly statusNota = signal<string>('');
  private notaSelecionada: File | null = null;

  ngOnInit(): void {
    this.store.carregar(this.obraId());
  }

  protected selecionarNota(evento: Event): void {
    const arquivos = (evento.target as HTMLInputElement).files;
    this.notaSelecionada = arquivos?.[0] ?? null;
    this.statusNota.set('');
  }

  /**
   * Preenche o rascunho a partir da foto da nota. O que a leitura não
   * reconhecer fica em branco para o usuário completar — e o status
   * pede conferência de propósito: leitura automática erra, e um valor
   * errado aqui vira pagamento errado.
   */
  protected lerNota(): void {
    if (!this.notaSelecionada) {
      window.alert('Selecione uma imagem da nota fiscal ou recibo primeiro.');
      return;
    }
    if (!this.rascunho() || this.lendoNota()) return;

    this.lendoNota.set(true);
    this.statusNota.set('Lendo a nota…');

    this.api.lerNotaFiscal(this.notaSelecionada).subscribe({
      next: (resposta) => {
        this.lendoNota.set(false);

        if (!resposta?.ok) {
          this.statusNota.set('');
          window.alert(resposta?.message || 'Não foi possível ler a nota fiscal.');
          return;
        }

        this.aplicarDadosDaNota(resposta.dados ?? {});
        this.statusNota.set('Dados preenchidos — confira antes de salvar.');
      },
      error: () => {
        this.lendoNota.set(false);
        this.statusNota.set('');
        window.alert('Não foi possível falar com o servidor para ler a nota.');
      },
    });
  }

  private aplicarDadosDaNota(dados: NonNullable<RespostaLeituraNota['dados']>): void {
    this.rascunho.update((p) => {
      if (!p) return p;

      // O número da nota entra junto da descrição, como no app original —
      // é o que permite achar o pagamento depois pela nota.
      let descricao = String(dados.descricao ?? '').trim();
      if (dados.numero_nota) {
        descricao = descricao
          ? `${descricao} (Nota nº ${dados.numero_nota})`
          : `Nota nº ${dados.numero_nota}`;
      }

      return {
        ...p,
        fornecedor: dados.fornecedor ? String(dados.fornecedor) : p.fornecedor,
        descricao: descricao || p.descricao,
        dataPagamento: dados.data ? String(dados.data) : p.dataPagamento,
        valorTotal:
          dados.valor_total !== null && dados.valor_total !== undefined
            ? Number(dados.valor_total) || 0
            : p.valorTotal,
      };
    });
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

  protected itensCalculados(pagamento: Pagamento): ItemPagamentoCalculado[] {
    return expandirItensPagamento(pagamento);
  }

  protected itensComEtapa(pagamento: Pagamento): ItemPagamentoCalculado[] {
    return expandirItensPagamento(pagamento).filter((it) => String(it.eapId ?? '').trim());
  }

  protected descricaoItem(item: ItemPagamentoCalculado): string {
    const tipo = rotuloTipo(item.tipo);
    return item.descricao ? `${item.descricao} (${tipo})` : tipo;
  }

  /** Em percentual, mostra os dois: "10,00% • R$ 100,00". */
  protected valorItemTexto(item: ItemPagamentoCalculado): string {
    const emReais = formatarMoeda(item.valorCalculado);
    if (item.modoValor !== 'percentual') return emReais;
    const pct = Number(item.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    return `${pct}% • ${emReais}`;
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

  /** Indentação do select pelo nível da EAP (1.2.3 → dois níveis). */
  protected recuoEap(item: ItemEapSnapshot): string {
    const nivel = item.eap.split('.').filter(Boolean).length - 1;
    return ' '.repeat(Math.max(0, nivel) * 3);
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
  // Modal
  // ------------------------------------------------------------------
  protected novoPagamento(): void {
    this.idEditando = null;
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
    this.idEditando = pagamento.id;
    // Cópia profunda: editar o rascunho não pode mexer na lista antes de salvar.
    this.rascunho.set(normalizarPagamento(JSON.parse(JSON.stringify(pagamento))));
  }

  protected fecharModal(): void {
    this.rascunho.set(null);
    this.idEditando = null;
  }

  protected atualizarCampo(campo: keyof Pagamento, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.rascunho.update((p) => (p ? { ...p, [campo]: valor } : p));
  }

  protected atualizarValorTotal(evento: Event): void {
    const valor = parsearBR((evento.target as HTMLInputElement).value);
    this.rascunho.update((p) => (p ? { ...p, valorTotal: valor } : p));
  }

  protected adicionarItem(): void {
    this.rascunho.update((p) =>
      p
        ? {
            ...p,
            itens: [
              ...p.itens,
              { id: gerarId(), descricao: '', tipo: '', eapId: '', valor: 0, modoValor: 'valor' },
            ],
          }
        : p,
    );
  }

  /** Shift + `-` na tabela de itens do modal: remove a linha atual. */
  protected removerItemPorIndice(indiceLinha: number): void {
    const item = this.rascunho()?.itens[indiceLinha];
    if (item) this.removerItem(item.id);
  }

  protected removerItem(id: string): void {
    this.rascunho.update((p) => (p ? { ...p, itens: p.itens.filter((i) => i.id !== id) } : p));
  }

  protected atualizarItem(id: string, campo: keyof ItemPagamento, evento: Event): void {
    const bruto = (evento.target as HTMLInputElement | HTMLSelectElement).value;
    const valor = campo === 'valor' ? parsearBR(bruto) : String(bruto ?? '');

    this.rascunho.update((p) =>
      p ? { ...p, itens: p.itens.map((i) => (i.id === id ? { ...i, [campo]: valor } : i)) } : p,
    );
  }

  protected alternarModoItem(id: string): void {
    this.rascunho.update((p) =>
      p
        ? {
            ...p,
            itens: p.itens.map((i) =>
              i.id === id
                ? { ...i, modoValor: i.modoValor === 'percentual' ? 'valor' : 'percentual' }
                : i,
            ),
          }
        : p,
    );
  }

  protected valorItemEditado(item: ItemPagamento): string {
    if (!item.valor) return '';
    return item.modoValor === 'percentual'
      ? formatarPercentual(item.valor)
      : formatarMoeda(item.valor);
  }

  protected valorResolvido(item: ItemPagamento): number {
    return calcularValorItem(item, this.rascunho()?.valorTotal ?? 0);
  }

  protected salvar(): void {
    const rascunho = this.rascunho();
    if (!rascunho) return;

    const pagamento: Pagamento = {
      ...rascunho,
      numeroPagamento:
        rascunho.numeroPagamento.trim() || gerarNumeroPagamento(this.store.pagamentos()),
      obraNumber: this.store.cabecalho().obraNumber,
    };

    const erros = validarPagamento(pagamento);
    if (erros.length) {
      window.alert(erros.join('\n'));
      return;
    }

    this.store.inserirOuAtualizar(pagamento, this.idEditando);
    this.fecharModal();
  }

  protected remover(pagamento: Pagamento): void {
    if (!window.confirm('Excluir este pagamento?')) return;
    this.store.remover(pagamento.id);
  }

  /**
   * Confirma um pagamento pendente (hoje, só os gerados pela aba Mapas) —
   * a partir daqui ele passa a contar no "Realizado" da EAP.
   */
  protected confirmar(pagamento: Pagamento): void {
    this.store.inserirOuAtualizar({ ...pagamento, status: 'confirmado' }, pagamento.id);
  }
}
