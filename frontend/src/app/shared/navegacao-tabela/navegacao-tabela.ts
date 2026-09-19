import { Directive, ElementRef, inject, input, output } from '@angular/core';

/**
 * Navegação por teclado em tabelas de digitação — portado de
 * js/eap/06-nav.js e js/mapa/06-nav.js.
 *
 * Numa tela onde se lança orçamento linha a linha, obrigar o mouse a
 * cada célula é o que separa uma ferramenta usável de uma irritante. Por
 * isso:
 *
 *  - **Tab / Shift+Tab** — anda na horizontal, dentro da linha;
 *  - **Enter / Shift+Enter** — desce e sobe, mantendo a coluna;
 *  - **Setas** — o mesmo, mas desativadas em `<select>`, onde as setas
 *    precisam trocar a opção escolhida;
 *  - **Shift + `+`** — insere linha abaixo da atual;
 *  - **Shift + `-`** — remove a linha atual.
 *  - **Colar texto com quebra de linha** (31/08/2026, pedido do Lucas,
 *    Mapa de Cotação) — em vez de colar tudo dentro da célula focada,
 *    emite `colarMultiplasLinhas` com a posição atual e as linhas do
 *    texto, pra quem usa a diretiva decidir como distribuir cada linha
 *    pelas linhas de baixo (colar de uma linha só continua colando normal,
 *    dentro da própria célula).
 *  - **Ctrl/Cmd + D** (31/08/2026, pedido do Lucas: mapas gigantes onde o
 *    mesmo Tipo vale pra todos os itens) — mesma tecla de "preencher pra
 *    baixo" do Excel/Sheets: emite `preencherParaBaixo` com a posição
 *    atual, pra quem usa a diretiva copiar o valor da célula focada pra
 *    todas as linhas ABAIXO dela, na mesma coluna.
 *
 * Em vez de marcar cada célula com `data-r`/`data-c` como no original, a
 * posição é descoberta na hora a partir do próprio DOM da tabela: qual
 * `<tr>` e qual `<td>` contêm o campo focado. Assim nenhuma marcação
 * manual precisa ser mantida em sincronia com o template — e colunas que
 * aparecem e desaparecem (as categorias alternáveis) funcionam sem
 * ajuste.
 *
 * Uso:
 * ```html
 * <table trenaNavegacaoTabela
 *        (inserirLinha)="store.adicionarItem($event)"
 *        (removerLinha)="removerPorIndice($event)">
 * ```
 */
@Directive({
  selector: '[trenaNavegacaoTabela]',
  host: {
    '(keydown)': 'aoTeclar($event)',
    '(paste)': 'aoColar($event)',
  },
})
export class NavegacaoTabela {
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Desliga os atalhos de inserir/remover quando não fizerem sentido. */
  readonly permiteAtalhos = input(true);

  /** Índice da linha a partir da qual inserir (−1 = ao final). */
  readonly inserirLinha = output<number>();
  readonly removerLinha = output<number>();

  /** Colar com quebra de linha — ver comentário da classe. */
  readonly colarMultiplasLinhas = output<{ linha: number; coluna: number; linhas: string[] }>();

  /** Ctrl/Cmd + D, "preencher pra baixo" — ver comentário da classe. */
  readonly preencherParaBaixo = output<{ linha: number; coluna: number }>();

  protected aoTeclar(evento: KeyboardEvent): void {
    // Um campo interno (ex.: lista de busca do Autocomplete) já tratou a tecla.
    if (evento.defaultPrevented) return;
    if (this.tratarPreencherParaBaixo(evento)) return;
    if (this.permiteAtalhos() && this.tratarAtalhos(evento)) return;
    this.tratarNavegacao(evento);
  }

  private tratarPreencherParaBaixo(evento: KeyboardEvent): boolean {
    if (!(evento.ctrlKey || evento.metaKey) || evento.key.toLowerCase() !== 'd') return false;

    const posicao = this.posicaoAtual(evento.target as HTMLElement);
    if (!posicao) return false;

    // Sem isso, o navegador abriria a caixa de "Adicionar aos favoritos".
    evento.preventDefault();
    this.preencherParaBaixo.emit(posicao);
    return true;
  }

  protected aoColar(evento: ClipboardEvent): void {
    const texto = evento.clipboardData?.getData('text');
    if (!texto) return;

    // Sobra do \n final de quem copiou uma lista (Excel, e-mail, etc.) não
    // deve virar uma linha vazia extra na tabela.
    const linhas = texto.split(/\r\n|\r|\n/);
    while (linhas.length > 1 && linhas[linhas.length - 1] === '') linhas.pop();

    // Uma linha só: deixa o navegador colar normal, dentro da própria célula.
    if (linhas.length <= 1) return;

    const posicao = this.posicaoAtual(evento.target as HTMLElement);
    if (!posicao) return;

    evento.preventDefault();
    this.colarMultiplasLinhas.emit({ linha: posicao.linha, coluna: posicao.coluna, linhas });
  }

  // ------------------------------------------------------------------
  private tratarAtalhos(evento: KeyboardEvent): boolean {
    if (!evento.shiftKey) return false;

    const inserir = evento.key === '+' || evento.key === '=';
    const remover = evento.key === '-' || evento.key === '_';
    if (!inserir && !remover) return false;

    evento.preventDefault();

    const posicao = this.posicaoAtual(evento.target as HTMLElement);

    if (inserir) {
      this.inserirLinha.emit(posicao ? posicao.linha : -1);
    } else if (posicao) {
      this.removerLinha.emit(posicao.linha);
    }

    return true;
  }

  private tratarNavegacao(evento: KeyboardEvent): void {
    const tecla = evento.key;
    const ehEnter = tecla === 'Enter';
    const ehTab = tecla === 'Tab';
    const ehSeta =
      tecla === 'ArrowUp' ||
      tecla === 'ArrowDown' ||
      tecla === 'ArrowLeft' ||
      tecla === 'ArrowRight';

    if (!ehEnter && !ehTab && !ehSeta) return;

    const alvo = evento.target as HTMLElement;
    // Num select, as setas escolhem a opção — não navegam a tabela.
    if (ehSeta && alvo.tagName === 'SELECT') return;
    // Em campos de texto, esquerda e direita movem o cursor.
    if ((tecla === 'ArrowLeft' || tecla === 'ArrowRight') && this.ehCampoTexto(alvo)) return;

    const posicao = this.posicaoAtual(alvo);
    if (!posicao) return;

    const linhas = this.linhasFocaveis();
    if (!linhas.length) return;

    let destino: HTMLElement | null = null;

    if (ehTab) {
      destino = this.vizinhoNaLinha(linhas, posicao, evento.shiftKey ? -1 : 1);
    } else if (ehEnter) {
      destino = this.mesmaColunaNaLinha(linhas, posicao, evento.shiftKey ? -1 : 1);
    } else if (tecla === 'ArrowLeft') {
      destino = this.vizinhoNaLinha(linhas, posicao, -1);
    } else if (tecla === 'ArrowRight') {
      destino = this.vizinhoNaLinha(linhas, posicao, 1);
    } else if (tecla === 'ArrowUp') {
      destino = this.mesmaColunaNaLinha(linhas, posicao, -1);
    } else {
      destino = this.mesmaColunaNaLinha(linhas, posicao, 1);
    }

    if (!destino) return;

    evento.preventDefault();
    destino.focus();

    // Selecionar o conteúdo deixa digitar por cima, sem apagar antes.
    if (destino instanceof HTMLInputElement && destino.type === 'text') destino.select();
  }

  // ------------------------------------------------------------------
  // Leitura da grade a partir do DOM
  // ------------------------------------------------------------------
  private linhasFocaveis(): HTMLElement[][] {
    const corpo = this.elemento.nativeElement.querySelector('tbody');
    if (!corpo) return [];

    return Array.from(corpo.querySelectorAll('tr'))
      .map((tr) => this.camposDaLinha(tr))
      .filter((campos) => campos.length > 0);
  }

  private camposDaLinha(tr: HTMLTableRowElement): HTMLElement[] {
    return Array.from(
      tr.querySelectorAll<HTMLElement>('input:not([type=checkbox]), select, textarea'),
    ).filter((campo) => this.ehVisivelEHabilitado(campo));
  }

  private ehVisivelEHabilitado(campo: HTMLElement): boolean {
    const controle = campo as HTMLInputElement;
    if (controle.disabled || controle.readOnly) return false;
    // offsetParent nulo = escondido por display:none ou por ancestral oculto.
    return campo.offsetParent !== null;
  }

  private posicaoAtual(alvo: HTMLElement): { linha: number; coluna: number } | null {
    const linhas = this.linhasFocaveis();

    for (let linha = 0; linha < linhas.length; linha++) {
      const coluna = linhas[linha].indexOf(alvo);
      if (coluna >= 0) return { linha, coluna };
    }

    return null;
  }

  private vizinhoNaLinha(
    linhas: HTMLElement[][],
    posicao: { linha: number; coluna: number },
    direcao: -1 | 1,
  ): HTMLElement | null {
    const campos = linhas[posicao.linha];
    const proxima = posicao.coluna + direcao;

    // Ao passar do fim da linha, segue para a linha seguinte — é o que
    // permite preencher a tabela inteira sem tocar no mouse.
    if (proxima >= 0 && proxima < campos.length) return campos[proxima];

    const linhaVizinha = posicao.linha + direcao;
    if (linhaVizinha < 0 || linhaVizinha >= linhas.length) return null;

    const destino = linhas[linhaVizinha];
    return direcao > 0 ? (destino[0] ?? null) : (destino[destino.length - 1] ?? null);
  }

  /**
   * Desce ou sobe mantendo a coluna. Se a linha de destino tiver menos
   * campos (uma linha de grupo, por exemplo), pega o mais próximo — é
   * melhor que perder o foco.
   */
  private mesmaColunaNaLinha(
    linhas: HTMLElement[][],
    posicao: { linha: number; coluna: number },
    direcao: -1 | 1,
  ): HTMLElement | null {
    const linhaDestino = posicao.linha + direcao;
    if (linhaDestino < 0 || linhaDestino >= linhas.length) return null;

    const campos = linhas[linhaDestino];
    if (!campos.length) return null;

    return campos[Math.min(posicao.coluna, campos.length - 1)];
  }

  private ehCampoTexto(elemento: HTMLElement): boolean {
    if (elemento instanceof HTMLTextAreaElement) return true;
    if (!(elemento instanceof HTMLInputElement)) return false;
    return ['text', 'search', 'url', 'tel', 'password', 'email'].includes(elemento.type);
  }
}
