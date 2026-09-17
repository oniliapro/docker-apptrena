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
 *    largura que o CONTEÚDO da primeira linha precisa (ver
 *    `medirLarguraNatural`, não é `getBoundingClientRect()` da célula viva
 *    — isso mediria só o espaço que sobrava naquele carregamento, podendo
 *    ser menor que o necessário) — e liga `table-layout: fixed`, que é o
 *    que faz o navegador respeitar a largura de cada `<col>` independente
 *    das outras. Uma célula do `<tbody>` pode declarar `data-largura-inicial`
 *    (em px) pra travar num valor fixo em vez de medir do DOM — útil
 *    quando a largura natural varia conforme o espaço disponível (ex.:
 *    mais ou menos colunas de fornecedor no Mapa).
 * 3. Resolve a grade do `<thead>` (que pode ter várias linhas, com células
 *    de colspan/rowspan) pra saber a qual coluna cada célula-folha
 *    (colspan 1) corresponde, e pendura uma alça arrastável na borda
 *    direita de cada uma. Células de agrupamento (colspan > 1, como "Custo"
 *    ou "BDI" na EAP) não ganham alça — quem se redimensiona são as
 *    colunas-folha por baixo delas. O texto de cada célula-folha também
 *    vira a CHAVE de identidade daquela coluna (ver `gerarChavesColunas`)
 *    — é por ela, não pela posição numérica, que a largura arrastada é
 *    preservada entre reconstruções do colgroup.
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
   * Largura mínima de cada coluna — a largura que o conteúdo da primeira
   * linha precisa pra não cortar texto (a mesma medida usada pra travar a
   * largura inicial, ver `medirLarguraNatural`). Arrastar não deixa
   * encolher além disso, porque é o espaço que o próprio conteúdo
   * (cabeçalho, valores) precisa pra não vazar visualmente em cima da
   * coluna vizinha — bug visto pelo Lucas (15/08/2026) ao arrastar uma
   * coluna mais estreita que o texto dela.
   */
  private larguraMinima: number[] = [];
  /**
   * Chave estável de cada coluna do colgroup atual, na mesma ordem de
   * `colgroup`/`larguraMinima` — gerada por `gerarChavesColunas` a partir
   * do texto do cabeçalho-folha de cada uma. Existe pra preservar a
   * largura arrastada da coluna CERTA quando o colgroup é reconstruído
   * (ver `criarColgroup`), em vez de reaplicar por posição/índice — bug
   * real confirmado pelo Lucas via Claude Chrome (04/09/2026): ao mudar o
   * conjunto de colunas (uma aparece, some, ou muda de ordem), a largura
   * de uma coluna vazava pra outra completamente diferente na mesma
   * posição numérica (ex.: na EAP, "Reabrir EAP" jogava a largura de
   * DESCRIÇÃO — 209px — no código curto da coluna EAP, e a de QTDE — 28px
   * — na própria DESCRIÇÃO, cada letra do texto quebrando numa linha).
   */
  private chavesColunas: string[] = [];
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
   * colunas que já existiam preservam a largura que já tinham, casada
   * pela CHAVE do cabeçalho (não mais por posição — ver `criarColgroup`/
   * `gerarChavesColunas`) — só as colunas novas de fato ganham uma
   * largura natural, medida do DOM.
   */
  private sincronizarColunas(tabela: HTMLTableElement): void {
    if (!tabela.isConnected) return;

    const numeroColunas = this.contarColunasReais(tabela);
    if (numeroColunas <= 0 || numeroColunas === this.colgroup.length) return;

    const celulasLideres = this.resolverCelulasLideres(tabela, numeroColunas);
    this.criarColgroup(tabela, numeroColunas, celulasLideres);
    this.pendurarAlcas(celulasLideres);
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

  private criarColgroup(
    tabela: HTMLTableElement,
    numeroColunas: number,
    celulasLideres: (HTMLTableCellElement | null)[],
  ): void {
    const antigo = tabela.querySelector('colgroup[data-redimensionavel]');
    // Guarda a largura das colunas que já existiam (inclusive as que o
    // usuário redimensionou à mão) antes de remover o colgroup antigo,
    // indexada pela CHAVE do cabeçalho de cada uma (não pela posição —
    // ver o comentário de `chavesColunas`), senão remover primeiro e só
    // depois medir de novo pelo DOM faria o navegador recalcular a tabela
    // inteira sem nenhuma coluna travada, perdendo o ajuste do usuário até
    // pras colunas que nem mudaram (bug visto ao corrigir o caso de
    // adicionar um fornecedor novo, 17/08/2026).
    const largurasAnterioresPorChave = new Map<string, number>();
    this.chavesColunas.forEach((chave, i) => {
      const largura = parseFloat(this.colgroup[i]?.style.width ?? '');
      if (Number.isFinite(largura)) largurasAnterioresPorChave.set(chave, largura);
    });
    antigo?.remove();

    const colgroup = document.createElement('colgroup');
    colgroup.setAttribute('data-redimensionavel', '');

    const primeiraLinha = this.linhaComColunasReais(tabela);
    const celulasDaLinha = primeiraLinha ? Array.from(primeiraLinha.children) : [];
    const novasChaves = this.gerarChavesColunas(celulasLideres);

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

      const larguraPreservada = largurasAnterioresPorChave.has(novasChaves[i])
        ? largurasAnterioresPorChave.get(novasChaves[i])!
        : NaN;
      const larguraAtual = Number.isFinite(larguraPreservada)
        ? larguraPreservada
        : Number.isFinite(larguraFixa)
          ? larguraFixa
          : celula
            ? this.medirLarguraNatural(celula)
            : undefined;
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
    this.chavesColunas = novasChaves;

    tabela.insertBefore(colgroup, tabela.firstChild);
    tabela.style.tableLayout = 'fixed';
  }

  /**
   * Gera uma chave estável por coluna, a partir do texto do seu
   * cabeçalho-folha (a mesma célula que ganha a alça de arrastar, ver
   * `resolverCelulasLideres`) — é essa chave, não a posição numérica, que
   * `criarColgroup` usa pra casar a largura arrastada com a coluna certa
   * entre reconstruções do colgroup (bug real corrigido em 04/09/2026, ver
   * o comentário de `chavesColunas`). Colunas sem cabeçalho de texto (ex.:
   * a de checkbox) caem num fallback posicional (`#0`, `#1`...); cabeçalhos
   * repetidos na mesma tabela ganham um sufixo de ocorrência (`::2`,
   * `::3`...) pra nunca duas colunas colidirem na mesma chave.
   */
  private gerarChavesColunas(celulasLideres: (HTMLTableCellElement | null)[]): string[] {
    const contagem = new Map<string, number>();
    return celulasLideres.map((th, indice) => {
      const base = (th?.textContent ?? '').trim().toLowerCase().replace(/\s+/g, ' ') || `#${indice}`;
      const vezes = (contagem.get(base) ?? 0) + 1;
      contagem.set(base, vezes);
      return vezes > 1 ? `${base}::${vezes}` : base;
    });
  }

  /**
   * Mede a largura que o CONTEÚDO da célula precisa pra não cortar texto,
   * sem depender de quanto espaço a tabela tinha sobrando no momento da
   * medição. Medir direto no DOM (`celula.getBoundingClientRect()`, jeito
   * antigo) reflete só o espaço que o `table-layout: auto` decidiu dar
   * naquele instante — que pode ser BEM menor que o necessário se a
   * tabela/coluna estava espremida. Confirmado por um teste do Lucas
   * (03/09/2026, via Claude Chrome): a coluna ETAPA do Mapa nascia travada
   * em 140px, cortando "1.1 - ART'S (ANOTAÇÃO)" pra "1.1 - ART'S (ANOTA" —
   * mesmo o texto do próprio carregamento já precisando de bem mais que
   * isso pra caber numa linha.
   *
   * Pra medir sem essa distorção, clona a célula pra fora da tabela
   * (`position: absolute; visibility: hidden`, então nunca chega a ser
   * pintada nem afeta o layout real) com `white-space: nowrap` e largura
   * livre (`width: auto; max-width: none`) — o navegador dá pra ela
   * exatamente a largura que o conteúdo pede, em vez da que sobrava. Um
   * `<td>` clonado fora de qualquer `<table>` ainda é tratado como célula
   * de tabela pelo navegador (vira uma "tabela anônima" por baixo dos
   * panos, comportamento padrão do CSS) — o clone preserva as classes e
   * atributos originais, então herda o mesmo CSS do componente mesmo
   * anexado direto no `<body>` (a folha de estilo do Angular seleciona por
   * atributo, não por proximidade no DOM).
   *
   * `<input>`/`<select>` dentro da célula (ex.: os `<select>` de Tipo/Etapa
   * na Empreita) têm `width: 100%` por padrão global (`_base.scss`) — sem
   * uma tabela real ao redor, essa porcentagem não tem uma largura de
   * referência confiável (o próprio contêiner também está em `width:
   * auto`), então cada campo desses ganha `width: auto` só dentro do
   * clone, pra medir pelo próprio conteúdo (o texto da opção selecionada)
   * em vez de herdar zero/indefinido.
   */
  private medirLarguraNatural(celula: HTMLElement): number {
    const clone = celula.cloneNode(true) as HTMLElement;
    clone.style.position = 'absolute';
    clone.style.visibility = 'hidden';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = 'auto';
    clone.style.maxWidth = 'none';
    clone.style.whiteSpace = 'nowrap';
    clone.querySelectorAll<HTMLElement>('input, select, textarea').forEach((campo) => {
      campo.style.width = 'auto';
      campo.style.maxWidth = 'none';
    });
    document.body.appendChild(clone);
    const largura = clone.getBoundingClientRect().width;
    clone.remove();
    return largura;
  }

  /**
   * Resolve a grade do `<thead>` — igual ao navegador faz internamente pra
   * desenhar a tabela — pra saber a qual coluna cada célula-folha (colspan
   * 1) corresponde, inclusive quando linhas anteriores têm `rowspan`
   * "roubando" posições. Usado tanto pra pendurar as alças de arrastar
   * (`pendurarAlcas`) quanto pra gerar a chave de identidade de cada
   * coluna (`gerarChavesColunas`, chamado de `criarColgroup`) — o texto do
   * cabeçalho-folha é a única pista de identidade que a diretiva tem sobre
   * uma coluna.
   */
  private resolverCelulasLideres(
    tabela: HTMLTableElement,
    numeroColunas: number,
  ): (HTMLTableCellElement | null)[] {
    const resultado: (HTMLTableCellElement | null)[] = new Array(numeroColunas).fill(null);
    const linhas = Array.from(tabela.querySelectorAll('thead tr'));

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

        if (colSpan === 1 && coluna < numeroColunas) {
          resultado[coluna] = th;
        }

        for (let k = 0; k < colSpan; k++) {
          ocupacao[coluna + k] = Math.max(ocupacao[coluna + k] ?? 0, rowSpan - 1);
        }
        coluna += colSpan;
      }
    }

    return resultado;
  }

  private pendurarAlcas(celulasLideres: (HTMLTableCellElement | null)[]): void {
    celulasLideres.forEach((th, coluna) => {
      if (th) this.criarAlca(th, coluna);
    });
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
