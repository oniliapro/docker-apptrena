import {
  Component,
  OnInit,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { ApiService } from '../../../core/services/api.service';
import { RespostaLeituraNota } from '../../../core/models/api.models';
import { formatarMoeda } from '../../../core/utils/formato';
import { NavegacaoTabela } from '../../../shared/navegacao-tabela/navegacao-tabela';
import { RedimensionarColunas } from '../../../shared/redimensionar-colunas/redimensionar-colunas';
import {
  calcularSomaItens,
  calcularValorItem,
  formatarPercentual,
  gerarId,
  normalizarPagamento,
  parsearBR,
  validarPagamento,
} from '../pagamentos-calc';
import { ItemEapSnapshot, ItemPagamento, Pagamento, TIPOS_CUSTO_PAGAMENTO } from '../pagamentos.models';
import { AnexosLancamento } from '../../../shared/anexos-lancamento/anexos-lancamento';
import { Tag } from '../../configuracoes/tags/tags.models';

/**
 * Tag + arquivo escolhidos ao ler uma nota fiscal ENQUANTO o pagamento
 * ainda está sendo criado (`modoNovo()`, sem id de verdade ainda) — não
 * dá pra arquivar na hora (falta o número do pagamento pro nome do
 * anexo), então fica pendente até `Pagamentos.salvarModal` conseguir um
 * pagamento salvo de verdade pra usar como `origemId`.
 */
export interface AnexoNotaPendente {
  tagId: string;
  arquivo: File;
}

export interface EventoSalvarPagamento {
  pagamento: Pagamento;
  anexoNotaPendente: AnexoNotaPendente | null;
}

/**
 * Modal de "lançamento" de um Pagamento — edição de cabeçalho, leitura de
 * nota fiscal por foto e rateio dos itens.
 *
 * Extraído de `Pagamentos` (06/09/2026, pedido do Lucas) pra poder ser
 * reaberto de fora dessa tela — o gatilho real foi um bug: clicar em "Ver"
 * num pagamento vinculado, no popup de pagamentos do Mapa
 * (`mapas-obra.html`), só fechava o popup e navegava pra lista geral de
 * Pagamentos da obra, ignorando qual pagamento tinha sido clicado. Com este
 * componente, `MapasObra` consegue abrir o MESMO modal direto no pagamento
 * certo, sem precisar da tela de Pagamentos nem do `PagamentosStore`
 * (que é obra-scoped e vive só dentro de `Pagamentos`, `pagamentos.ts:59`).
 *
 * Propositalmente "burro" (sem store própria): recebe o `pagamento` pronto,
 * edita uma cópia local, e devolve o resultado pronto pra salvar via
 * `salvar.emit()` — quem persiste (e decide o que fazer com `obraNumber`,
 * `numeroPagamento` etc. antes de gravar) é sempre o componente-pai.
 */
@Component({
  selector: 'app-editar-pagamento-modal',
  imports: [NavegacaoTabela, RedimensionarColunas, AnexosLancamento],
  templateUrl: './editar-pagamento-modal.html',
  styleUrl: './editar-pagamento-modal.scss',
})
export class EditarPagamentoModal implements OnInit {
  private readonly api = inject(ApiService);

  readonly pagamento = input.required<Pagamento>();
  readonly snapshotEap = input<ItemEapSnapshot[]>([]);
  /** Só pra "ler nota fiscal por foto" — `ApiService.lerNotaFiscal` não precisa de mais nada da obra. */
  readonly obraId = input.required<string>();
  /** Só troca o título do cabeçalho ("Novo pagamento" vs "Editar pagamento"). */
  readonly modoNovo = input(false);

  readonly salvar = output<EventoSalvarPagamento>();
  readonly fechar = output<void>();

  /** Só existe (renderizado) quando `!modoNovo()` — ver `anexos-lancamento.html`/o `@if` deste componente. */
  private readonly anexosLista = viewChild(AnexosLancamento);

  protected readonly tipos = TIPOS_CUSTO_PAGAMENTO;
  protected readonly formatarMoeda = formatarMoeda;

  /**
   * Cópia local editável — igual ao `editar()`/`novoPagamento()` que
   * existiam em `pagamentos.ts` antes desta extração: cópia profunda, pra
   * mexer no rascunho não afetar o objeto original antes de "Salvar".
   * `linkedSignal` (não `signal` direto) porque um `input.required()` não
   * pode ser lido no inicializador de outro campo — o Angular só garante o
   * valor do input depois da construção da instância (erro `NG8118`);
   * `linkedSignal` lê o input de forma preguiçosa (só no 1º acesso, já com
   * o input resolvido) e ainda assim continua editável via `.update()`/
   * `.set()` depois, como um `signal` comum.
   */
  protected readonly rascunho = linkedSignal<Pagamento>(() =>
    normalizarPagamento(JSON.parse(JSON.stringify(this.pagamento())) as Record<string, unknown>),
  );

  protected readonly somaItens = computed(() => calcularSomaItens(this.rascunho()));
  protected readonly diferenca = computed(() => this.rascunho().valorTotal - this.somaItens());
  /** Vermelho quando o rateio ainda não fecha — o bloqueio para salvar. */
  protected readonly diferencaAberta = computed(() => Math.abs(this.diferenca()) > 0.01);

  // ---- Leitura de nota fiscal por foto ----
  protected readonly lendoNota = signal(false);
  protected readonly statusNota = signal<string>('');
  private notaSelecionada: File | null = null;

  /**
   * Tag pra arquivar a própria foto lida (06/09/2026, pedido do Lucas:
   * "arquivos de nota fiscal lidos... tem a opção de colocar tag na hora
   * de anexar, e já ficam arquivados"). Escolher a tag é opcional — sem
   * ela, a leitura só preenche os campos como sempre fez, sem arquivar
   * nada.
   */
  protected readonly tags = signal<Tag[]>([]);
  protected readonly tagsAtivas = computed(() => this.tags().filter((t) => t.ativo));
  protected readonly tagDaNota = signal('');
  private anexoNotaPendente: AnexoNotaPendente | null = null;

  ngOnInit(): void {
    this.api.listarTags().subscribe({
      next: (lista) => this.tags.set(lista),
      error: () => this.tags.set([]),
    });
  }

  protected mudarTagDaNota(evento: Event): void {
    this.tagDaNota.set((evento.target as HTMLSelectElement).value);
  }

  protected selecionarNota(evento: Event): void {
    const arquivos = (evento.target as HTMLInputElement).files;
    this.notaSelecionada = arquivos?.[0] ?? null;
    this.statusNota.set('');
  }

  /**
   * Preenche o rascunho a partir da foto da nota. O que a leitura não
   * reconhecer fica em branco para o usuário completar — e o status pede
   * conferência de propósito: leitura automática erra, e um valor errado
   * aqui vira pagamento errado.
   *
   * Se uma tag foi escolhida, a MESMA foto também é arquivada como anexo:
   * na hora (`!modoNovo()`, o pagamento já existe) ou só depois de salvar
   * (`modoNovo()`, ainda falta o número do pagamento pro nome do arquivo
   * — ver `anexoNotaPendente`/`EventoSalvarPagamento`).
   */
  protected lerNota(): void {
    if (!this.notaSelecionada) {
      window.alert('Selecione uma imagem da nota fiscal ou recibo primeiro.');
      return;
    }
    if (this.lendoNota()) return;

    const notaLida = this.notaSelecionada;
    const tagId = this.tagDaNota();

    this.lendoNota.set(true);
    this.statusNota.set('Lendo a nota…');

    this.api.lerNotaFiscal(notaLida).subscribe({
      next: (resposta) => {
        this.lendoNota.set(false);

        if (!resposta?.ok) {
          this.statusNota.set('');
          window.alert(resposta?.message || 'Não foi possível ler a nota fiscal.');
          return;
        }

        this.aplicarDadosDaNota(resposta.dados ?? {});

        if (!tagId) {
          this.statusNota.set('Dados preenchidos — confira antes de salvar.');
          return;
        }

        if (this.modoNovo()) {
          this.anexoNotaPendente = { tagId, arquivo: notaLida };
          this.statusNota.set('Dados preenchidos — a nota será arquivada assim que o pagamento for salvo.');
          return;
        }

        this.api.anexarArquivoPagamento(this.pagamento().id, tagId, notaLida).subscribe({
          next: () => {
            this.statusNota.set('Dados preenchidos — nota arquivada nos anexos.');
            this.anexosLista()?.recarregar();
          },
          error: () => {
            this.statusNota.set('Dados preenchidos — confira antes de salvar (não foi possível arquivar a nota).');
          },
        });
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
  // Campos e itens
  // ------------------------------------------------------------------
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
    return ' '.repeat(Math.max(0, nivel) * 3);
  }

  /**
   * Só a parte `YYYY-MM-DD` de `dataPagamento` — necessário porque
   * `confirmar()` (em `pagamentos.ts`) grava data+hora
   * (`2026-08-26T14:23:00`), e um `<input type="date">` rejeita qualquer
   * valor fora do formato de data pura (mostraria o campo em branco).
   */
  protected somenteData(iso: string): string {
    return String(iso ?? '').slice(0, 10);
  }

  protected atualizarCampo(campo: keyof Pagamento, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.rascunho.update((p) => ({ ...p, [campo]: valor }));
  }

  protected atualizarValorTotal(evento: Event): void {
    const valor = parsearBR((evento.target as HTMLInputElement).value);
    this.rascunho.update((p) => ({ ...p, valorTotal: valor }));
  }

  protected adicionarItem(): void {
    this.rascunho.update((p) => ({
      ...p,
      itens: [...p.itens, { id: gerarId(), descricao: '', tipo: '', eapId: '', valor: 0, modoValor: 'valor' }],
    }));
  }

  /** Shift + `-` na tabela de itens do modal: remove a linha atual. */
  protected removerItemPorIndice(indiceLinha: number): void {
    const item = this.rascunho().itens[indiceLinha];
    if (item) this.removerItem(item.id);
  }

  protected removerItem(id: string): void {
    this.rascunho.update((p) => ({ ...p, itens: p.itens.filter((i) => i.id !== id) }));
  }

  protected atualizarItem(id: string, campo: keyof ItemPagamento, evento: Event): void {
    const bruto = (evento.target as HTMLInputElement | HTMLSelectElement).value;
    const valor = campo === 'valor' ? parsearBR(bruto) : String(bruto ?? '');

    this.rascunho.update((p) => ({
      ...p,
      itens: p.itens.map((i) => (i.id === id ? { ...i, [campo]: valor } : i)),
    }));
  }

  protected alternarModoItem(id: string): void {
    this.rascunho.update((p) => ({
      ...p,
      itens: p.itens.map((i) =>
        i.id === id ? { ...i, modoValor: i.modoValor === 'percentual' ? 'valor' : 'percentual' } : i,
      ),
    }));
  }

  protected valorItemEditado(item: ItemPagamento): string {
    if (!item.valor) return '';
    return item.modoValor === 'percentual' ? formatarPercentual(item.valor) : formatarMoeda(item.valor);
  }

  protected valorResolvido(item: ItemPagamento): number {
    return calcularValorItem(item, this.rascunho().valorTotal);
  }

  protected fecharModal(): void {
    this.fechar.emit();
  }

  protected salvarModal(): void {
    const pagamento = this.rascunho();
    const erros = validarPagamento(pagamento);
    if (erros.length) {
      window.alert(erros.join('\n'));
      return;
    }

    // Só passa adiante se ainda for "novo" — editando, a nota (se tinha
    // tag escolhida) já foi arquivada na hora, em `lerNota()`.
    const anexoNotaPendente = this.modoNovo() ? this.anexoNotaPendente : null;
    this.salvar.emit({ pagamento, anexoNotaPendente });
  }
}
