import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/**
 * Redimensionamento manual de colunas, arrastando a borda entre duas — pedido
 * do Lucas (15/08/2026) pra valer em qualquer tabela do sistema, sem precisar
 * reescrever o HTML de cada uma.
 *
 * Uso: `<table trenaRedimensionarColunas> ... </table>`
 *
 * Arrastar a borda direita de uma coluna muda só a largura **daquela**
 * coluna — as outras só deslocam de posição (régua de planilha). Pra isso
 * funcionar com cabeçalhos de duas linhas (`colspan`/`rowspan`, como a EAP),
 * a diretiva injeta um `<colgroup>` com uma `<col>` por coluna real (contada
 * pela primeira linha do `<tbody>` que não seja o placeholder do `@empty`),
 * liga `table-layout: fixed` e pendura uma alça arrastável em cada
 * cabeçalho-folha. Células `colspan > 1` (agrupamentos como "Custo" na EAP)
 * não ganham alça.
 *
 * ------------------------------------------------------------------
 * Reescrita de 19/09/2026 (bugs relatados: colunas com largura incoerente,
 * texto estourando a célula, comportamento estranho em zoom diferente)
 * ------------------------------------------------------------------
 * Problemas da versão anterior e o que mudou:
 *  1. Só media o `<td>` da PRIMEIRA linha — uma linha seguinte com texto
 *     maior estourava a célula. Agora mede o cabeçalho + as 2 primeiras
 *     linhas + as linhas de MAIOR texto de cada coluna (`AMOSTRA_*`).
 *  2. O cabeçalho não entrava na medição (ficava cortado: "CPF / CN").
 *     Agora entra; e cabeçalho que ainda assim não cabe vira reticências
 *     com `title` (texto inteiro no tooltip).
 *  3. O mínimo pra arrastar era a largura inicial (coluna que nasceu larga
 *     nunca encolhia) ou o piso de 28px (coluna que nasceu estreita virava
 *     "uma letra por linha"). Agora o mínimo é o MIN-CONTENT real do
 *     conteúdo (a maior palavra/número indivisível), entre 36 e 160px, e a
 *     largura inicial é o conteúdo natural, entre o mínimo e 360px.
 *  4. Media antes da fonte terminar de carregar: com fonte reserva (mais
 *     estreita que a Inter) as colunas nasciam curtas e o texto estourava
 *     assim que a Inter chegava. Agora espera `document.fonts.ready` e
 *     remede quando novas fontes terminam de carregar.
 *  5. A chave de identidade da coluna incluía a seta de ordenação (▲/▼) —
 *     ordenar mudava a chave e a largura arrastada se perdia. Agora a seta
 *     é ignorada.
 *  6. Larguras arrastadas ficavam só em memória. Agora são gravadas no
 *     navegador (`localStorage`), por tabela + coluna. Duplo clique numa
 *     alça restaura a largura automática daquela coluna; Shift + duplo
 *     clique restaura a tabela inteira.
 *  7. Texto de célula sem espaço estourava a coluna vizinha. Agora as
 *     tabelas ajustáveis quebram texto longo (`overflow-wrap: anywhere` nos
 *     `td`, ver `_base.scss`); o mínimo acima impede quebrar números.
 *
 * Zoom do navegador: larguras são em px CSS e o zoom escala tudo junto, então
 * não há o que recalcular — o que quebrava zoom era a medição com a fonte
 * errada (item 4) e o texto sem quebra (item 7).
 *
 * **Tabelas alinhadas à direita** (`[alinhadoDireita]="true"`, "Resumo por
 * categoria" da EAP): a alça fica na borda ESQUERDA e arrastar pra esquerda
 * alarga. Uma caixa externa (fora desta diretiva) acompanha a largura total
 * e fica grudada à direita — a borda direita nunca se move.
 *
 * `data-largura-inicial` (em px) numa célula do `<tbody>` trava aquela
 * coluna num valor fixo em vez de medir (Mapa: a coluna Preço varia com o
 * número de fornecedores).
 */

/** Menor largura possível de coluna. */
const PISO = 36;
/** Teto do mínimo (min-content) — palavra gigante não trava a coluna larga demais. */
const TETO_MINIMO = 160;
/** Teto da largura inicial automática — texto maior quebra em várias linhas. */
const TETO_INICIAL = 360;
/** Linhas do começo sempre medidas, e quantas das MAIS LONGAS (por texto) de cada coluna. */
const AMOSTRA_INICIO = 2;
const AMOSTRA_MAIORES = 4;
/** Quanto uma remedição automática precisa crescer pra valer o ajuste (evita tremer). */
const FOLGA_REMEDICAO = 2;

const PREFIXO_ARMAZENAMENTO = 'trena:colunas:v1:';
const SETAS_DE_ORDENACAO = /[▲▼△▽↑↓⬆⬇↕⇅]/g;

interface MedidaColuna {
  natural: number;
  minimo: number;
}

@Directive({
  selector: '[trenaRedimensionarColunas]',
})
export class RedimensionarColunas implements AfterViewInit, OnDestroy {
  private readonly elemento = inject<ElementRef<HTMLTableElement>>(ElementRef);

  /** Ver o comentário da classe sobre tabelas alinhadas à direita. */
  readonly alinhadoDireita = input(false);

  private observador: MutationObserver | null = null;
  private temporizadorRemedicao: ReturnType<typeof setTimeout> | null = null;
  private destruida = false;

  private colgroup: HTMLTableColElement[] = [];
  /** Menor largura permitida de cada coluna (min-content real, ver `medirColunas`). */
  private larguraMinima: number[] = [];
  /** Largura "automática" de cada coluna — pra restaurar com duplo clique. */
  private larguraAutomatica: number[] = [];
  /** Colunas que o usuário arrastou (a remedição automática não mexe nelas). */
  private manual: boolean[] = [];
  /** Chave estável de cada coluna (texto do cabeçalho-folha, sem seta de ordenação). */
  private chavesColunas: string[] = [];
  private idArmazenamento = '';
  private linhasNaUltimaMedicao = 0;

  private arrastando: { indiceColuna: number; xInicial: number; larguraInicial: number } | null = null;

  private readonly aoMoverMouse = (evento: MouseEvent) => this.moverColuna(evento);
  private readonly aoSoltarMouse = () => this.pararArraste();
  private readonly aoTerminarDeCarregarFonte = () => this.agendarRemedicao();

  ngAfterViewInit(): void {
    // Espera o layout assentar (dados carregados, colunas condicionais
    // decididas) E a fonte carregar antes de medir e travar as larguras.
    queueMicrotask(() => {
      const fontes = document.fonts;
      if (fontes?.ready) {
        void fontes.ready.then(() => this.preparar());
        fontes.addEventListener?.('loadingdone', this.aoTerminarDeCarregarFonte);
      } else {
        this.preparar();
      }
    });
  }

  ngOnDestroy(): void {
    this.destruida = true;
    document.removeEventListener('mousemove', this.aoMoverMouse);
    document.removeEventListener('mouseup', this.aoSoltarMouse);
    document.fonts?.removeEventListener?.('loadingdone', this.aoTerminarDeCarregarFonte);
    if (this.temporizadorRemedicao) clearTimeout(this.temporizadorRemedicao);
    this.observador?.disconnect();
  }

  private preparar(): void {
    const tabela = this.elemento.nativeElement;
    if (this.destruida || !tabela.isConnected) return;

    tabela.classList.add('tabela-ajustavel');
    this.sincronizarColunas(tabela);
    this.observarMudancasDeColuna(tabela);
  }

  /**
   * (Re)monta o colgroup sempre que o número de colunas de verdade muda
   * (tabela nasce sem itens e depois recebe; Mapa ganha fornecedor...). As
   * colunas que já existiam preservam a largura (casadas pela CHAVE do
   * cabeçalho, não pela posição — bug real de 04/09/2026: a largura de uma
   * coluna vazava pra outra na mesma posição numérica).
   */
  private sincronizarColunas(tabela: HTMLTableElement): void {
    if (this.destruida || !tabela.isConnected) return;

    const numeroColunas = this.contarColunasReais(tabela);
    if (numeroColunas <= 0 || numeroColunas === this.colgroup.length) return;

    const celulasLideres = this.resolverCelulasLideres(tabela, numeroColunas);
    this.criarColgroup(tabela, numeroColunas, celulasLideres);
    this.pendurarAlcas(celulasLideres);
    this.linhasNaUltimaMedicao = this.linhasReais(tabela).length;
  }

  private observarMudancasDeColuna(tabela: HTMLTableElement): void {
    const corpo = tabela.querySelector('tbody');
    if (!corpo || this.observador) return;

    this.observador = new MutationObserver(() => {
      this.sincronizarColunas(tabela);
      // Linhas novas — ou texto que chegou depois (ex.: nome da obra resolvido
      // de forma assíncrona) — podem ser mais largos que o medido antes. A
      // remedição é agendada com debounce e só cresce, então é barata.
      this.agendarRemedicao();
    });
    this.observador.observe(corpo, { childList: true, subtree: true });
  }

  /** Remede (em rajada única) as colunas que o usuário NÃO arrastou; só CRESCE, nunca encolhe (não treme a tela). */
  private agendarRemedicao(): void {
    if (this.temporizadorRemedicao) clearTimeout(this.temporizadorRemedicao);
    this.temporizadorRemedicao = setTimeout(() => this.remedirAutomaticas(), 200);
  }

  private remedirAutomaticas(): void {
    const tabela = this.elemento.nativeElement;
    if (this.destruida || !tabela.isConnected || !this.colgroup.length) return;

    const celulasLideres = this.resolverCelulasLideres(tabela, this.colgroup.length);
    const medidas = this.medirColunas(tabela, celulasLideres);
    this.linhasNaUltimaMedicao = this.linhasReais(tabela).length;

    medidas.forEach((medida, i) => {
      const inicial = this.larguraInicialDe(medida, tabela, i);
      this.larguraMinima[i] = this.minimoDe(medida, tabela, i);
      this.larguraAutomatica[i] = inicial;
      if (this.manual[i]) return;
      const atual = parseFloat(this.colgroup[i].style.width) || 0;
      if (inicial > atual + FOLGA_REMEDICAO) this.colgroup[i].style.width = `${inicial}px`;
    });
  }

  // ------------------------------------------------------------------
  // Estrutura da tabela
  // ------------------------------------------------------------------

  /** Linhas do `<tbody>` que são colunas de verdade — pula o placeholder do `@empty` (célula única com `colspan`). */
  private linhasReais(tabela: HTMLTableElement): HTMLTableRowElement[] {
    return (Array.from(tabela.querySelectorAll('tbody tr')) as HTMLTableRowElement[]).filter(
      (linha) => !(linha.children.length === 1 && linha.children[0].hasAttribute('colspan')),
    );
  }

  private contarColunasReais(tabela: HTMLTableElement): number {
    return this.linhasReais(tabela)[0]?.children.length ?? 0;
  }

  /**
   * Resolve a grade do `<thead>` (igual ao navegador, inclusive `rowspan`
   * "roubando" posições) pra saber a qual coluna cada célula-folha
   * (colspan 1) corresponde.
   */
  private resolverCelulasLideres(
    tabela: HTMLTableElement,
    numeroColunas: number,
  ): (HTMLTableCellElement | null)[] {
    const resultado: (HTMLTableCellElement | null)[] = new Array(numeroColunas).fill(null);
    const ocupacao: number[] = [];

    for (const linha of Array.from(tabela.querySelectorAll('thead tr'))) {
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

        if (colSpan === 1 && coluna < numeroColunas) resultado[coluna] = th;
        for (let k = 0; k < colSpan; k++) {
          ocupacao[coluna + k] = Math.max(ocupacao[coluna + k] ?? 0, rowSpan - 1);
        }
        coluna += colSpan;
      }
    }
    return resultado;
  }

  /**
   * Chave estável por coluna: texto do cabeçalho-folha (sem seta de
   * ordenação). Sem texto (checkbox...) cai no fallback posicional (`#0`);
   * cabeçalho repetido ganha sufixo (`::2`).
   */
  private gerarChavesColunas(celulasLideres: (HTMLTableCellElement | null)[]): string[] {
    const contagem = new Map<string, number>();
    return celulasLideres.map((th, indice) => {
      const base =
        (th?.textContent ?? '').replace(SETAS_DE_ORDENACAO, '').trim().toLowerCase().replace(/\s+/g, ' ') ||
        `#${indice}`;
      const vezes = (contagem.get(base) ?? 0) + 1;
      contagem.set(base, vezes);
      return vezes > 1 ? `${base}::${vezes}` : base;
    });
  }

  // ------------------------------------------------------------------
  // Medição
  // ------------------------------------------------------------------

  /**
   * Mede, por coluna, a largura NATURAL do conteúdo (numa linha só, sem
   * depender do espaço que a tabela tinha) e o MIN-CONTENT (a maior palavra/
   * número indivisível). Amostra: cabeçalho, as primeiras linhas e as de
   * maior texto de cada coluna. Cada célula é clonada pra fora da tabela,
   * dentro de uma tabela-relógio invisível (`table-layout: auto`): com
   * `white-space: nowrap; width: auto` o navegador dá a largura natural; com
   * `width: 1px` a célula não consegue ficar menor que o min-content.
   * Os clones mantêm classes e atributos, então herdam o CSS do componente.
   *
   * `<input>`/`<select>`/`<textarea>` (100% da coluna por padrão global): na
   * medição natural ganham `width: auto` (medem pelo conteúdo); no mínimo,
   * `width: 40px`.
   */
  private medirColunas(
    tabela: HTMLTableElement,
    celulasLideres: (HTMLTableCellElement | null)[],
  ): MedidaColuna[] {
    const linhas = this.linhasReais(tabela);
    const numero = celulasLideres.length;

    const amostrasPorColuna: HTMLElement[][] = Array.from({ length: numero }, () => []);
    for (let coluna = 0; coluna < numero; coluna++) {
      const comTexto = linhas
        .map((linha, i) => ({ i, celula: linha.children[coluna] as HTMLElement | undefined }))
        .filter((c) => !!c.celula);
      const inicio = comTexto.slice(0, AMOSTRA_INICIO);
      const maiores = [...comTexto]
        .sort((a, b) => (b.celula!.textContent?.length ?? 0) - (a.celula!.textContent?.length ?? 0))
        .slice(0, AMOSTRA_MAIORES);
      const escolhidas = new Map<number, HTMLElement>();
      [...inicio, ...maiores].forEach((c) => escolhidas.set(c.i, c.celula!));
      amostrasPorColuna[coluna] = [...escolhidas.values()];
    }

    const relogio = document.createElement('div');
    relogio.style.cssText = 'position:absolute;visibility:hidden;left:-99999px;top:0;pointer-events:none;';
    const registros: { coluna: number; tipo: 'natural' | 'minimo'; celula: HTMLElement; ehCabecalho: boolean }[] = [];

    const adicionar = (coluna: number, original: HTMLElement, ehCabecalho: boolean) => {
      for (const tipo of ['natural', 'minimo'] as const) {
        if (ehCabecalho && tipo === 'minimo') continue; // cabeçalho pode virar reticências — não trava o mínimo
        const clone = original.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('.alca-redimensionar').forEach((alca) => alca.remove());
        clone.style.position = 'static';
        clone.style.maxWidth = 'none';
        clone.style.overflow = 'visible';
        clone.style.textOverflow = 'clip';

        if (tipo === 'natural') {
          clone.style.width = 'auto';
          clone.style.whiteSpace = 'nowrap';
        } else {
          clone.style.width = '1px';
        }
        clone.querySelectorAll<HTMLElement>('input, select, textarea').forEach((campo) => {
          campo.style.width = tipo === 'natural' ? 'auto' : '40px';
          campo.style.maxWidth = 'none';
        });

        const mesa = document.createElement('table');
        mesa.style.cssText = 'width:auto;table-layout:auto;border-collapse:collapse;margin:0;';
        const linha = document.createElement('tr');
        linha.appendChild(clone);
        mesa.appendChild(linha);
        relogio.appendChild(mesa);
        registros.push({ coluna, tipo, celula: clone, ehCabecalho });
      }
    };

    celulasLideres.forEach((th, coluna) => {
      if (th) adicionar(coluna, th, true);
      amostrasPorColuna[coluna].forEach((celula) => adicionar(coluna, celula, false));
    });

    document.body.appendChild(relogio);
    const medidas: MedidaColuna[] = Array.from({ length: numero }, () => ({ natural: 0, minimo: 0 }));
    for (const { coluna, tipo, celula } of registros) {
      // +3: com `border-collapse`, a largura da <col> não inclui as metades das bordas da célula — sem a folga, conteúdo medido "exato" sobrava 1-2px (3 cobre o arredondamento de subpixel em zoom 150%).
      const largura = Math.ceil(celula.getBoundingClientRect().width) + 3;
      if (tipo === 'natural') medidas[coluna].natural = Math.max(medidas[coluna].natural, largura);
      else medidas[coluna].minimo = Math.max(medidas[coluna].minimo, largura);
    }
    relogio.remove();

    return medidas.map((m) => ({
      natural: m.natural,
      minimo: Math.min(Math.max(m.minimo, PISO), TETO_MINIMO),
    }));
  }

  /** Mínimo de arraste: o min-content medido — ou, se a célula declara `data-largura-inicial`, essa largura (a coluna nunca fica mais estreita que o declarado). */
  private minimoDe(medida: MedidaColuna, tabela: HTMLTableElement, coluna: number): number {
    const fixa = this.larguraFixaDeclarada(tabela, coluna);
    return Number.isFinite(fixa) ? Math.max(PISO, Math.round(fixa)) : medida.minimo;
  }

  private larguraInicialDe(medida: MedidaColuna, tabela: HTMLTableElement, coluna: number): number {
    const fixa = this.larguraFixaDeclarada(tabela, coluna);
    if (Number.isFinite(fixa)) return Math.max(PISO, Math.round(fixa));
    return Math.max(medida.minimo, Math.min(medida.natural, TETO_INICIAL));
  }

  /** `data-largura-inicial` (em px) da célula da coluna na primeira linha real, se houver. */
  private larguraFixaDeclarada(tabela: HTMLTableElement, coluna: number): number {
    const celula = this.linhasReais(tabela)[0]?.children[coluna] as HTMLElement | undefined;
    return celula ? parseFloat(celula.dataset['larguraInicial'] ?? '') : NaN;
  }

  // ------------------------------------------------------------------
  // Colgroup e persistência
  // ------------------------------------------------------------------

  private criarColgroup(
    tabela: HTMLTableElement,
    numeroColunas: number,
    celulasLideres: (HTMLTableCellElement | null)[],
  ): void {
    // Guarda larguras (e o "arrastada à mão") das colunas que já existiam,
    // pela CHAVE, antes de remover o colgroup — remover primeiro faria o
    // navegador recalcular a tabela sem colunas travadas.
    const anteriores = new Map<string, { largura: number; manual: boolean }>();
    this.chavesColunas.forEach((chave, i) => {
      const largura = parseFloat(this.colgroup[i]?.style.width ?? '');
      if (Number.isFinite(largura)) anteriores.set(chave, { largura, manual: !!this.manual[i] });
    });
    tabela.querySelector('colgroup[data-redimensionavel]')?.remove();

    const novasChaves = this.gerarChavesColunas(celulasLideres);
    this.idArmazenamento = this.gerarIdArmazenamento(novasChaves);
    const salvas = this.lerLarguraSalvas();
    const medidas = this.medirColunas(tabela, celulasLideres);

    const colgroup = document.createElement('colgroup');
    colgroup.setAttribute('data-redimensionavel', '');
    this.colgroup = [];
    this.larguraMinima = [];
    this.larguraAutomatica = [];
    this.manual = [];

    for (let i = 0; i < numeroColunas; i++) {
      const chave = novasChaves[i];
      const medida = medidas[i];
      const automatica = this.larguraInicialDe(medida, tabela, i);
      const anterior = anteriores.get(chave);
      const salva = salvas[chave];

      let largura = automatica;
      let manual = false;
      if (anterior) {
        largura = anterior.largura;
        manual = anterior.manual;
      } else if (Number.isFinite(salva)) {
        largura = salva;
        manual = true;
      }

      const col = document.createElement('col');
      const minimo = this.minimoDe(medida, tabela, i);
      col.style.width = `${Math.max(minimo, Math.round(largura))}px`;
      colgroup.appendChild(col);
      this.colgroup.push(col);
      this.larguraMinima.push(minimo);
      this.larguraAutomatica.push(automatica);
      this.manual.push(manual);
    }
    this.chavesColunas = novasChaves;

    tabela.insertBefore(colgroup, tabela.firstChild);
    tabela.style.tableLayout = 'fixed';
  }

  /** Identifica a tabela pra persistência: rota (sem ids) + primeiras chaves de coluna. */
  private gerarIdArmazenamento(chaves: string[]): string {
    const rota = location.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
    return `${rota}|${chaves.filter((c) => !c.startsWith('#')).slice(0, 3).join('|')}`;
  }

  private lerLarguraSalvas(): Record<string, number> {
    try {
      const bruto = localStorage.getItem(PREFIXO_ARMAZENAMENTO + this.idArmazenamento);
      const dados: unknown = bruto ? JSON.parse(bruto) : {};
      return dados && typeof dados === 'object' ? (dados as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  private salvarLarguras(): void {
    try {
      const dados: Record<string, number> = {};
      this.chavesColunas.forEach((chave, i) => {
        if (this.manual[i]) dados[chave] = parseFloat(this.colgroup[i].style.width) || 0;
      });
      const chaveCompleta = PREFIXO_ARMAZENAMENTO + this.idArmazenamento;
      if (Object.keys(dados).length) localStorage.setItem(chaveCompleta, JSON.stringify(dados));
      else localStorage.removeItem(chaveCompleta);
    } catch {
      // sem armazenamento disponível (modo privado, cota cheia): a largura vale só nesta sessão
    }
  }

  // ------------------------------------------------------------------
  // Alças e arraste
  // ------------------------------------------------------------------

  private pendurarAlcas(celulasLideres: (HTMLTableCellElement | null)[]): void {
    celulasLideres.forEach((th, coluna) => {
      if (!th) return;
      this.criarAlca(th, coluna);
      // Cabeçalho que não cabe vira reticências (CSS) — o texto inteiro fica no tooltip.
      if (!th.title) th.title = (th.textContent ?? '').replace(SETAS_DE_ORDENACAO, '').trim();
    });
  }

  private criarAlca(th: HTMLTableCellElement, indiceColuna: number): void {
    th.querySelector(':scope > .alca-redimensionar')?.remove();

    if (getComputedStyle(th).position === 'static') th.style.position = 'relative';

    const alca = document.createElement('span');
    alca.className = this.alinhadoDireita()
      ? 'alca-redimensionar alca-redimensionar-esquerda'
      : 'alca-redimensionar';
    alca.title = 'Arraste para ajustar a largura. Duplo clique: largura automática (com Shift: todas as colunas)';
    alca.addEventListener('mousedown', (evento) => this.iniciarArraste(evento, indiceColuna));
    alca.addEventListener('click', (evento) => evento.stopPropagation()); // não dispara a ordenação do cabeçalho
    alca.addEventListener('dblclick', (evento) => this.restaurar(evento, indiceColuna));
    th.appendChild(alca);
  }

  private restaurar(evento: MouseEvent, indiceColuna: number): void {
    evento.preventDefault();
    evento.stopPropagation();

    const indices = evento.shiftKey ? this.colgroup.map((_, i) => i) : [indiceColuna];
    for (const i of indices) {
      this.manual[i] = false;
      this.colgroup[i].style.width = `${this.larguraAutomatica[i]}px`;
    }
    this.salvarLarguras();
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

    const piso = this.larguraMinima[this.arrastando.indiceColuna] ?? PISO;
    // Alinhado à direita a alça fica do lado esquerdo: arrastar pra esquerda alarga (sinal invertido).
    const deltaBruto = evento.clientX - this.arrastando.xInicial;
    const delta = this.alinhadoDireita() ? -deltaBruto : deltaBruto;
    const novaLargura = Math.max(piso, this.arrastando.larguraInicial + delta);
    this.colgroup[this.arrastando.indiceColuna].style.width = `${Math.round(novaLargura)}px`;
  }

  private pararArraste(): void {
    if (this.arrastando) {
      this.manual[this.arrastando.indiceColuna] = true;
      this.salvarLarguras();
    }
    this.arrastando = null;
    document.removeEventListener('mousemove', this.aoMoverMouse);
    document.removeEventListener('mouseup', this.aoSoltarMouse);
  }
}
