import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/**
 * Redimensionamento manual de colunas, arrastando a borda entre duas — pedido
 * do Lucas (15/08/2026) pra valer em qualquer tabela do sistema, sem precisar
 * reescrever o HTML de cada uma.
 *
 * Uso:
 * ```html
 * <table trenaRedimensionarColunas> ... </table>
 * ```
 *
 * Arrastar a borda direita de uma coluna muda só a largura **daquela**
 * coluna — as outras não se ajustam, elas só deslocam de posição (mesma
 * régua de qualquer planilha, alinhada à esquerda: a borda esquerda da
 * tabela fica parada, tudo à direita da coluna redimensionada é o que se
 * desloca). Pra isso funcionar mesmo com cabeçalhos de duas linhas
 * (células com `colspan`/`rowspan`, como a EAP tem), a diretiva:
 *
 * 1. Descobre o número real de colunas pela primeira linha do `<tbody>`
 *    (cada `<td>` ali é sempre uma coluna de verdade, sem colspan/rowspan).
 * 2. Injeta um `<colgroup>` com uma `<col>` por coluna, cada uma travada na
 *    largura atual renderizada — e liga `table-layout: fixed`, que é o que
 *    faz o navegador respeitar a largura de cada `<col>` independente das
 *    outras. Uma célula do `<tbody>` pode declarar `data-largura-inicial`
 *    (em px) pra travar num valor fixo em vez de medir do DOM — útil
 *    quando a largura natural varia conforme o espaço disponível (ex.:
 *    mais ou menos colunas de fornecedor no Mapa).
 * 3. Resolve a grade do `<thead>` (que pode ter várias linhas, com células
 *    de colspan/rowspan) pra saber a qual coluna cada célula-folha
 *    (colspan 1) corresponde, e pendura uma alça arrastável na borda
 *    direita de cada uma. Células de agrupamento (colspan > 1, como "Custo"
 *    ou "BDI" na EAP) não ganham alça — quem se redimensiona são as
 *    colunas-folha por baixo delas.
 *
 * **Tabelas alinhadas à direita** (`[alinhadoDireita]="true"`, pedido do
 * Lucas 16/08/2026 pro "Resumo por categoria" da EAP, que fica encostado na
 * borda direita da tela): a régua espelha — a alça fica na borda
 * **esquerda** de cada coluna, e arrastar pra esquerda (longe da coluna)
 * alarga em vez de encolher. O efeito, combinado com uma caixa externa que
 * acompanha a largura total da tabela e fica sempre grudada na direita
 * (fora do escopo desta diretiva, ver `eap.ts`/`eap.scss`), é que
 * redimensionar uma coluna desloca as colunas **à esquerda** dela, e a
 * borda direita da tabela nunca se move.
 *
 * Não persiste a largura entre sessões (recarregar a página volta ao
 * automático) — se isso for necessário depois, dá pra guardar no
 * `localStorage` por um identificador de tabela.
 */
@Directive({
  selector: '[trenaRedimensionarColunas]',
})
export class RedimensionarColunas implements AfterViewInit, OnDestroy {
  private readonly elemento = inject<ElementRef<HTMLTableElement>>(ElementRef);

  /** Ver o comentário da classe sobre tabelas alinhadas à direita. */
  readonly alinhadoDireita = input(false);

  /** Piso absoluto — só entra em jogo se nem a coluna tiver largura natural pra medir. */
  private readonly LARGURA_MINIMA_ABSOLUTA = 28;

  /** Observa o `<tbody>` pela vida toda do componente — ver `sincronizarColunas`. */
  private observador: MutationObserver | null = null;

  private colgroup: HTMLTableColElement[] = [];
  /**
   * Largura mínima de cada coluna — a largura natural que ela tinha antes
   * de qualquer redimensionamento (a mesma medida usada pra travar a
   * largura inicial). Arrastar não deixa encolher além disso, porque é o
   * espaço que o próprio conteúdo (cabeçalho, valores) precisa pra não
   * vazar visualmente em cima da coluna vizinha — bug visto pelo Lucas
   * (15/08/2026) ao arrastar uma coluna mais estreita que o texto dela.
   */
  private larguraMinima: number[] = [];
  private arrastando: { indiceColuna: number; xInicial: number; larguraInicial: number } | null =
    null;

  private readonly aoMoverMouse = (evento: MouseEvent) => this.moverColuna(evento);
  private readonly aoSoltarMouse = () => this.pararArraste();

  ngAfterViewInit(): void {
    // Espera o layout assentar (dados carregados, colunas condicionais
    // já decididas) antes de medir e travar as larguras.
    queueMicrotask(() => this.preparar());
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousemove', this.aoMoverMouse);
    document.removeEventListener('mouseup', this.aoSoltarMouse);
    this.observador?.disconnect();
  }

  private preparar(): void {
    const tabela = this.elemento.nativeElement;
    if (!tabela.isConnected) return;

    this.sincronizarColunas(tabela);
    this.observarMudancasDeColuna(tabela);
  }

  /**
   * (Re)monta o colgroup sempre que o número de colunas de verdade muda —
   * dois casos:
   *
   * 1. EAP/Mapa recém-criado nasce sem itens: o `@empty` do template mostra
   *    uma linha só, com uma única célula de `colspan` cobrindo a tabela
   *    inteira. Sem essa checagem, essa célula era contada como "a coluna
   *    1" e travava a tabela inteira num colgroup de uma coluna só (bug
   *    visto pelo Lucas, 17/08/2026: colunas nasciam desconfiguradas, só se
   *    ajustavam depois de um F5, quando a tabela já recarregava com itens
   *    de verdade).
   * 2. Mapa com a tela já carregada e o usuário adiciona um fornecedor: as
   *    duas colunas novas (Preço/Comprar) nasciam sem `<col>`
   *    correspondente no colgroup já travado em `table-layout: fixed`, e
   *    ficavam espremidas/sobrepostas até um F5 (outro bug visto pelo
   *    Lucas, 17/08/2026).
   *
   * Reconstruir do zero não perde larguras redimensionadas à mão: as
   * colunas que já existiam preservam a largura que já tinham (guardada
   * antes de remontar o colgroup, em `criarColgroup`) — só as colunas
   * novas de fato ganham uma largura natural, medida do DOM.
   */
  private sincronizarColunas(tabela: HTMLTableElement): void {
    if (!tabela.isConnected) return;

    const numeroColunas = this.contarColunasReais(tabela);
    if (numeroColunas <= 0 || numeroColunas === this.colgroup.length) return;

    this.criarColgroup(tabela, numeroColunas);
    this.pendurarAlcas(tabela);
  }

  /** Observa o `<tbody>` pelo resto da vida do componente — ver `sincronizarColunas`. */
  private observarMudancasDeColuna(tabela: HTMLTableElement): void {
    const corpo = tabela.querySelector('tbody');
    if (!corpo || this.observador) return;

    this.observador = new MutationObserver(() => this.sincronizarColunas(tabela));
    this.observador.observe(corpo, { childList: true, subtree: true });
  }

  /**
   * Primeira linha do `<tbody>` que representa colunas de verdade — pula a
   * linha placeholder do `@empty` (célula única com `colspan`), que não tem
   * uma coluna por célula como as linhas de dado normais.
   */
  private linhaComColunasReais(tabela: HTMLTableElement): HTMLTableRowElement | null {
    const linhas = Array.from(tabela.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
    return (
      linhas.find((linha) => {
        const celulas = linha.children;
        return !(celulas.length === 1 && celulas[0].hasAttribute('colspan'));
      }) ?? null
    );
  }

  private contarColunasReais(tabela: HTMLTableElement): number {
    return this.linhaComColunasReais(tabela)?.children.length ?? 0;
  }

  private criarColgroup(tabela: HTMLTableElement, numeroColunas: number): void {
    const antigo = tabela.querySelector('colgroup[data-redimensionavel]');
    // Guarda a largura das colunas que já existiam (inclusive as que o
    // usuário redimensionou à mão) antes de remover o colgroup antigo —
    // remover primeiro e só depois medir de novo pelo DOM faria o navegador
    // recalcular a tabela inteira sem nenhuma coluna travada, perdendo o
    // ajuste do usuário até pras colunas que nem mudaram (bug visto ao
    // corrigir o caso de adicionar um fornecedor novo, 17/08/2026).
    const largurasAnteriores = this.colgroup.map((col) => col.style.width);
    antigo?.remove();

    const colgroup = document.createElement('colgroup');
    colgroup.setAttribute('data-redimensionavel', '');

    const primeiraLinha = this.linhaComColunasReais(tabela);
    const celulasDaLinha = primeiraLinha ? Array.from(primeiraLinha.children) : [];

    this.colgroup = [];
    this.larguraMinima = [];
    for (let i = 0; i < numeroColunas; i++) {
      const col = document.createElement('col');
      const celula = celulasDaLinha[i] as HTMLElement | undefined;

      // `data-largura-inicial` (opcional, no `<td>`): largura fixa em vez de
      // medida do DOM — pra colunas cuja largura natural varia conforme o
      // espaço disponível (ex.: a coluna Preço do Mapa, que media larguras
      // diferentes dependendo de quantos fornecedores tinha, já que a
      // medição normal só reflete o espaço sobrando naquele carregamento
      // específico). Bug visto pelo Lucas, 17/08/2026.
      const larguraFixa = celula ? parseFloat(celula.dataset['larguraInicial'] ?? '') : NaN;

      const larguraPreservada = largurasAnteriores[i] ? parseFloat(largurasAnteriores[i]) : NaN;
      const larguraAtual = Number.isFinite(larguraPreservada)
        ? larguraPreservada
        : Number.isFinite(larguraFixa)
          ? larguraFixa
          : celula?.getBoundingClientRect().width;
      const largura = Math.max(
        this.LARGURA_MINIMA_ABSOLUTA,
        Math.round(larguraAtual || this.LARGURA_MINIMA_ABSOLUTA),
      );
      col.style.width = `${largura}px`;
      colgroup.appendChild(col);
      this.colgroup.push(col);
      // O piso pra arrastar mais estreito também respeita a largura fixa
      // declarada, quando existe — senão a coluna podia nascer no valor
      // certo mas ainda assim ser arrastada abaixo dele.
      this.larguraMinima.push(Number.isFinite(larguraFixa) ? Math.round(larguraFixa) : largura);
    }

    tabela.insertBefore(colgroup, tabela.firstChild);
    tabela.style.tableLayout = 'fixed';
  }

  /**
   * Resolve a grade do `<thead>` — igual ao navegador faz internamente pra
   * desenhar a tabela — pra saber em qual coluna cada célula começa,
   * inclusive quando linhas anteriores têm `rowspan` "roubando" posições.
   */
  private pendurarAlcas(tabela: HTMLTableElement): void {
    const linhas = Array.from(tabela.querySelectorAll('thead tr'));
    if (!linhas.length) return;

    // ocupacao[coluna] = quantas linhas restantes essa coluna ainda está
    // reservada por causa de um rowspan de uma linha anterior.
    const ocupacao: number[] = [];

    for (const linha of linhas) {
      const celulas = Array.from(linha.children) as HTMLTableCellElement[];
      let coluna = 0;
      let indice = 0;

      while (indice < celulas.length) {
        while ((ocupacao[coluna] ?? 0) > 0) {
          ocupacao[coluna]--;
          coluna++;
        }

        const th = celulas[indice++];
        const colSpan = th.colSpan || 1;
        const rowSpan = th.rowSpan || 1;

        if (colSpan === 1) {
          this.criarAlca(th, coluna);
        }

        for (let k = 0; k < colSpan; k++) {
          ocupacao[coluna + k] = Math.max(ocupacao[coluna + k] ?? 0, rowSpan - 1);
        }
        coluna += colSpan;
      }
    }
  }

  private criarAlca(th: HTMLTableCellElement, indiceColuna: number): void {
    th.querySelector(':scope > .alca-redimensionar')?.remove();

    if (getComputedStyle(th).position === 'static') th.style.position = 'relative';

    const alca = document.createElement('span');
    alca.className = this.alinhadoDireita()
      ? 'alca-redimensionar alca-redimensionar-esquerda'
      : 'alca-redimensionar';
    alca.addEventListener('mousedown', (evento) => this.iniciarArraste(evento, indiceColuna));
    th.appendChild(alca);
  }

  private iniciarArraste(evento: MouseEvent, indiceColuna: number): void {
    const col = this.colgroup[indiceColuna];
    if (!col) return;

    evento.preventDefault();
    evento.stopPropagation();

    this.arrastando = {
      indiceColuna,
      xInicial: evento.clientX,
      larguraInicial: col.getBoundingClientRect().width,
    };

    document.addEventListener('mousemove', this.aoMoverMouse);
    document.addEventListener('mouseup', this.aoSoltarMouse);
  }

  private moverColuna(evento: MouseEvent): void {
    if (!this.arrastando) return;

    const piso =
      this.larguraMinima[this.arrastando.indiceColuna] ?? this.LARGURA_MINIMA_ABSOLUTA;
    // Alinhado à direita: a alça fica do lado esquerdo da coluna, então
    // arrastar pra esquerda (longe da coluna) é que alarga — sinal invertido
    // em relação ao modo padrão (alça à direita, arrastar pra direita alarga).
    const deltaBruto = evento.clientX - this.arrastando.xInicial;
    const delta = this.alinhadoDireita() ? -deltaBruto : deltaBruto;
    const novaLargura = Math.max(piso, this.arrastando.larguraInicial + delta);
    this.colgroup[this.arrastando.indiceColuna].style.width = `${Math.round(novaLargura)}px`;
  }

  private pararArraste(): void {
    this.arrastando = null;
    document.removeEventListener('mousemove', this.aoMoverMouse);
    document.removeEventListener('mouseup', this.aoSoltarMouse);
  }
}
