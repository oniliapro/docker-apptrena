import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';

import { formatarMoeda } from '../../../core/utils/formato';
import { AnexosLancamento } from '../../../shared/anexos-lancamento/anexos-lancamento';
import { NavegacaoTabela } from '../../../shared/navegacao-tabela/navegacao-tabela';
import { mensagemExclusaoRecebimento } from '../acoes-recebimento';
import { FormulaCampo, FormulasContexto } from '../../../shared/numero/formulas-guardadas';
import { RedimensionarColunas } from '../../../shared/redimensionar-colunas/redimensionar-colunas';
import {
  calcularSomaItens,
  calcularValorItem,
  formatarPercentual,
  gerarId,
  normalizarRecebimento,
  parsearBR,
  validarRecebimento,
} from '../recebimentos-calc';
import {
  ItemEapSnapshotRecebimento,
  ItemRecebimento,
  Recebimento,
  TIPOS_CUSTO_RECEBIMENTO,
} from '../recebimentos.models';

export interface EventoSalvarRecebimento {
  recebimento: Recebimento;
}

/**
 * Popup de "lançamento" de um Recebimento — cabeçalho, itens com rateio por
 * etapa/categoria e anexos. Extraído de `Recebimentos` (21/09/2026, pedido do
 * Lucas: editar clicando na linha também nas listas GERAIS e nos cards do
 * painel), no mesmo desenho de `EditarPagamentoModal`: recebe o recebimento,
 * edita uma CÓPIA e devolve o resultado em `(salvar)` — quem hospeda persiste.
 *
 * Fica sempre como bloco IRMÃO de outros popups no template do hospedeiro
 * (nunca aninhado num `.modal-cartao` com `transform`) — mesmo cuidado de
 * `EditarPagamentoModal`.
 */
@Component({
  selector: 'app-editar-recebimento-modal',
  imports: [NavegacaoTabela, RedimensionarColunas, AnexosLancamento, FormulaCampo],
  providers: [FormulasContexto],
  templateUrl: './editar-recebimento-modal.html',
  styleUrl: './editar-recebimento-modal.scss',
})
export class EditarRecebimentoModal implements OnInit {
  /** Fórmulas guardadas dos campos de valor (ver formulas-guardadas.ts). */
  private readonly formulas = inject(FormulasContexto);

  readonly recebimento = input.required<Recebimento>();
  /** Itens da EAP da obra do recebimento (rótulos do seletor de etapa). */
  readonly snapshotEap = input<ItemEapSnapshotRecebimento[]>([]);
  /** Recebimento sendo CRIADO (ainda não existe no servidor): anexos só depois de salvar. */
  readonly modoNovo = input(false);
  /** Número usado se o campo "Nº do recebimento" for salvo em branco. */
  readonly numeroSugerido = input('');
  /** Se informado, é gravado como `obraNumber` do recebimento ao salvar. */
  readonly obraNumber = input<string | null>(null);

  readonly salvar = output<EventoSalvarRecebimento>();
  readonly fechar = output<void>();
  /** "Excluir" (26/09/2026): confirmado na própria caixa do modal; quem hospeda apaga o recebimento e fecha. Só aparece editando. */
  readonly excluir = output<Recebimento>();

  protected readonly tipos = TIPOS_CUSTO_RECEBIMENTO;
  protected readonly formatarMoeda = formatarMoeda;

  /** Cópia local editável — editar aqui não mexe na lista de fora antes de salvar. */
  protected readonly rascunho = signal<Recebimento | null>(null);
  protected readonly editando = computed(() => !this.modoNovo());

  protected readonly somaItens = computed(() => {
    const rascunho = this.rascunho();
    return rascunho ? calcularSomaItens(rascunho) : 0;
  });

  protected readonly diferenca = computed(() => {
    const rascunho = this.rascunho();
    return rascunho ? rascunho.valorTotal - this.somaItens() : 0;
  });

  protected readonly diferencaAberta = computed(() => Math.abs(this.diferenca()) > 0.01);

  protected excluirModal(): void {
    const recebimento = this.recebimento();
    if (!window.confirm(mensagemExclusaoRecebimento(recebimento))) return;
    this.excluir.emit(recebimento);
  }

  ngOnInit(): void {
    this.formulas.definir('recebimento.' + this.recebimento().id);
    this.rascunho.set(normalizarRecebimento(JSON.parse(JSON.stringify(this.recebimento()))));
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

  /** Só a parte `YYYY-MM-DD` de `dataRecebimento` (que grava data+hora). */
  protected somenteData(iso: string): string {
    return String(iso ?? '').slice(0, 10);
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
            itens: [...r.itens, { id: gerarId(), descricao: '', tipo: '', eapId: '', valor: 0, modoValor: 'valor' }],
          }
        : r,
    );
  }

  /** Ctrl + Delete na tabela de itens: remove a linha atual (com confirmação, na diretiva). */
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
              i.id === id ? { ...i, modoValor: i.modoValor === 'percentual' ? 'valor' : 'percentual' } : i,
            ),
          }
        : r,
    );
  }

  protected valorItemEditado(item: ItemRecebimento): string {
    if (!item.valor) return '';
    return item.modoValor === 'percentual' ? formatarPercentual(item.valor) : formatarMoeda(item.valor);
  }

  protected valorResolvido(item: ItemRecebimento): number {
    return calcularValorItem(item, this.rascunho()?.valorTotal ?? 0);
  }

  protected confirmarSalvar(): void {
    const rascunho = this.rascunho();
    if (!rascunho) return;

    const recebimento: Recebimento = {
      ...rascunho,
      numeroRecebimento: rascunho.numeroRecebimento.trim() || this.numeroSugerido(),
      obraNumber: this.obraNumber() ?? rascunho.obraNumber,
    };

    const erros = validarRecebimento(recebimento);
    if (erros.length) {
      window.alert(erros.join('\n'));
      return;
    }

    this.salvar.emit({ recebimento });
  }
}
