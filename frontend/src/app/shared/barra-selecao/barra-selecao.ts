import { Component, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';

export interface AcaoLista {
  /** Identifica a ação no evento `acao` — cada tela decide o que fazer. */
  chave: string;
  rotulo: string;
  /** Ação destrutiva (ex.: Excluir): destacada em vermelho. */
  perigo?: boolean;
}

/**
 * Barra de ações das listas com seleção múltipla (20/09/2026, pedido dos
 * usuários: no lugar da coluna de botões ✎/✖ em cada linha, marcar linhas e
 * agir sobre elas). Só aparece com pelo menos uma linha marcada e mostra:
 *
 *  - quantas estão marcadas;
 *  - **Editar** — só com EXATAMENTE uma marcada (e a tela aceitando edição);
 *  - **Ações ▾** — menu com o que a tela oferece (Excluir, Mover,
 *    Confirmar, Duplicar…); a tela recebe `(acao)` com a `chave` escolhida;
 *  - **Limpar** — desmarca tudo.
 *
 * Fica dentro da barra de ferramentas da lista. Não sabe nada do que cada
 * ação faz — só emite eventos. Para excluir em lote, use
 * `confirmarExclusaoEmLote` (uma confirmação só para o lote inteiro).
 */
@Component({
  selector: 'app-barra-selecao',
  templateUrl: './barra-selecao.html',
  styleUrl: './barra-selecao.scss',
})
export class BarraSelecao {
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly contagem = input.required<number>();
  readonly acoes = input<AcaoLista[]>([]);
  /** A tela permite abrir a edição a partir da seleção (botão Editar com 1 marcada). */
  readonly podeEditar = input(true);
  /** Texto do botão de 1 marcada — "Editar" nas listas que abrem um formulário, "Abrir" nas que abrem a página do item. */
  readonly rotuloEditar = input('Editar');

  readonly editar = output<void>();
  readonly acao = output<string>();
  readonly limpar = output<void>();

  protected readonly menuAberto = signal(false);

  protected escolher(chave: string): void {
    this.menuAberto.set(false);
    this.acao.emit(chave);
  }

  /** Clique fora do menu fecha; Esc também (sem fechar popups, que têm o próprio Esc). */
  @HostListener('document:mousedown', ['$event'])
  protected aoClicarFora(evento: MouseEvent): void {
    if (this.menuAberto() && !this.elemento.nativeElement.contains(evento.target as Node)) {
      this.menuAberto.set(false);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  protected aoApertarEsc(evento: Event): void {
    if (!this.menuAberto()) return;
    evento.preventDefault();
    this.menuAberto.set(false);
  }
}
