import { Location } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  WritableSignal,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PerfilEmpresa } from '../../../../core/models/api.models';
import { ApiService } from '../../../../core/services/api.service';
import { Tag } from '../../tags/tags.models';
import { formatarDataHora } from '../../../../core/utils/formato';
import { gerarCssEstilos } from '../../../../shared/contrato-estilo-css';
import { PropostaConfig } from '../../../../shared/proposta-config/proposta-config';
import {
  CATEGORIAS_EXEMPLO_PROPOSTA,
  ConfigProposta,
  linhasExemploPropostaEap,
  montarTabelaPropostaEap,
  normalizarConfigProposta,
} from '../../../../shared/proposta-eap';
import {
  CaixaTextoEstilo,
  ContratoEstilo,
  ListaFormatoEstilo,
  ObjetoVariavelContrato,
  OBJETOS_POR_TIPO,
  OrientacaoContrato,
  ROTULOS_CAIXA_TEXTO,
  ROTULOS_LISTA_FORMATO,
  ROTULOS_OBJETO_VARIAVEL,
  ROTULOS_TAG_ESTILO,
  ROTULOS_TAMANHO_PAPEL,
  ROTULOS_TIPO_CONTRATO_MODELO,
  TagHtmlEstilo,
  TamanhoPapelContrato,
  TipoContratoModelo,
  VARIAVEIS_POR_OBJETO,
  VariavelContrato,
} from '../contrato-modelo.models';

type AreaEditavel = 'corpo' | 'cabecalho' | 'rodape';
type ModoEstilo = 'normal' | 'lista' | 'titulo';

interface FormEstilo {
  id: string | null;
  nome: string;
  tag_html: TagHtmlEstilo;
  fonte: string;
  tamanho_pt: number | null;
  cor: string;
  negrito: boolean;
  italico: boolean;
  sublinhado: boolean;
  alinhamento: 'esquerda' | 'centro' | 'direita' | 'justificado';
  caixa_texto: CaixaTextoEstilo;
  modo: ModoEstilo;
  lista_formato: ListaFormatoEstilo;
  nivel_titulo: number;
  lista_prefixo: string;
  lista_sufixo: string;
}

function estiloFormVazio(): FormEstilo {
  return {
    id: null,
    nome: '',
    tag_html: 'p',
    fonte: '',
    tamanho_pt: null,
    cor: '',
    negrito: false,
    italico: false,
    sublinhado: false,
    alinhamento: 'esquerda',
    caixa_texto: 'nenhuma',
    modo: 'normal',
    lista_formato: 'numero',
    nivel_titulo: 1,
    lista_prefixo: '',
    lista_sufixo: '.',
  };
}

/** Tamanho de cada papel em mm (retrato) — ver também `ContratoPdfController::aplicarTamanhoPapel`. */
const TAMANHOS_PAPEL_MM: Record<TamanhoPapelContrato, [number, number]> = {
  a4: [210, 297],
  carta: [215.9, 279.4],
  oficio: [216, 330],
};

/** 96px/polegada ÷ 25.4mm/polegada — conversão padrão de tela usada pelo próprio CSS. */
const MM_PARA_PX = 96 / 25.4;

function pxParaMm(px: number): number {
  return px / MM_PARA_PX;
}

/** Vão visual entre uma folha e a próxima na separação de páginas de verdade (30/09/2026, ver `recalcularQuebrasPagina`). */
const GAP_PAGINA_PX = 28;

function mmParaPx(mm: number): number {
  return Math.round(mm * MM_PARA_PX);
}

/**
 * Espaçamento entre linhas igual ao do Word (14/10/2026, pedido do Lucas):
 * "1,0" é o espaçamento simples do Word, que em altura de linha CSS é ~1,2 ×
 * o tamanho da fonte — cada opção é esse simples multiplicado. Gravado como
 * `line-height` no próprio bloco (vai igual pro PDF).
 */
const ALTURA_LINHA_SIMPLES = 1.2;
export const OPCOES_ENTRELINHA: readonly number[] = [1, 1.15, 1.5, 2, 2.5, 3];

/** Lado maior de uma imagem inserida no documento — maior que isso é reduzida antes de entrar (o arquivo vai embutido no modelo). */
const LADO_MAXIMO_IMAGEM_PX = 1600;

/**
 * Cabeçalho/rodapé com conteúdo próprio de verdade — mesma regra de
 * `ContratoPdfController::htmlTemConteudo` (o `contenteditable` deixa `<br>`
 * sobrando depois de apagar tudo, e isso não pode virar uma linha a mais).
 */
function temConteudoProprio(el: HTMLElement): boolean {
  if (el.querySelector('img, hr, table')) return true;
  return (el.textContent ?? '').replace(/ /g, ' ').trim() !== '';
}

function lerComoDataUrl(arquivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const imagem = new Image();
    imagem.onload = () => resolve(imagem);
    imagem.onerror = () => reject(new Error('imagem inválida'));
    imagem.src = src;
  });
}

/**
 * Lê a imagem escolhida e, se for grande, reduz antes de embutir no modelo
 * (ela fica DENTRO do HTML do modelo, que vai inteiro a cada salvamento).
 * SVG vai como está (vetor, já é leve); foto continua JPEG; PNG/GIF/WebP
 * continuam PNG (mantém transparência de logo) a não ser que fique pesado.
 */
async function prepararImagem(arquivo: File): Promise<{ src: string; larguraPx: number }> {
  const original = await lerComoDataUrl(arquivo);
  const imagem = await carregarImagem(original);
  const maior = Math.max(imagem.naturalWidth, imagem.naturalHeight);
  if (arquivo.type === 'image/svg+xml' || (maior <= LADO_MAXIMO_IMAGEM_PX && arquivo.size <= 600_000)) {
    return { src: original, larguraPx: imagem.naturalWidth };
  }

  const escala = Math.min(1, LADO_MAXIMO_IMAGEM_PX / maior);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
  canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { src: original, larguraPx: imagem.naturalWidth };

  if (arquivo.type !== 'image/jpeg') {
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    if (png.length <= 1_500_000) return { src: png, larguraPx: canvas.width };
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  return { src: canvas.toDataURL('image/jpeg', 0.85), larguraPx: canvas.width };
}

/** Largura do conteúdo do bloco que contém a imagem — a referência do `width: X%` dela (no editor e no PDF). */
function larguraDisponivelPara(imagem: HTMLElement): number {
  let bloco = imagem.parentElement;
  while (bloco && getComputedStyle(bloco).display.startsWith('inline')) bloco = bloco.parentElement;
  if (!bloco) return 0;
  const estilo = getComputedStyle(bloco);
  return bloco.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
}

/**
 * Editor de um modelo de contrato (29/09/2026, pedido do Lucas: "algo mais
 * parecido com o Word"). Reformulado a fundo em 30/09/2026 (segunda leva de
 * pedidos, depois de testar de verdade):
 *
 * - Estilos passaram a ser um VÍNCULO de verdade (classe CSS gerada por
 *   `gerarCssEstilos`, injetada numa `<style>` própria), não mais uma
 *   cópia de valores — editar um estilo agora atualiza todo texto que usa
 *   ele. Qualquer estilo pode virar lista ordenada avulsa OU título
 *   numerado hierárquico (1, 1.1, 1.1.1…) — a numeração é 100% contador
 *   CSS, recalcula sozinha ao inserir/excluir/mover conteúdo.
 * - Cabeçalho/rodapé pararam de ter barra de formatação própria — usam a
 *   MESMA barra principal (estilo, variável, negrito/itálico/etc.),
 *   agindo sobre a área que estiver com foco no momento (`areaFocada`).
 * - Prévia do que o sistema desenha sozinho no PDF (logo, nome da
 *   empresa, subtítulo, "Gerado em...", papel timbrado no topo) aparece
 *   também aqui, pra não editar às cegas.
 * - Colar conteúdo de fora (Word/Google Docs) passa por uma limpeza
 *   (`limparHtmlColado`) — achado testando o PDF de verdade: margem
 *   negativa vinda do Word empurrava o texto pra fora da área imprimível
 *   e saía cortado.
 */
@Component({
  selector: 'app-contrato-modelo-editor',
  imports: [PropostaConfig],
  templateUrl: './contrato-modelo-editor.html',
  styleUrl: './contrato-modelo-editor.scss',
})
export class ContratoModeloEditor implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  readonly contratoModeloId = signal<string>('');

  @ViewChild('area') private readonly area!: ElementRef<HTMLDivElement>;
  @ViewChild('areaCabecalho') private readonly areaCabecalho!: ElementRef<HTMLDivElement>;
  @ViewChild('areaRodape') private readonly areaRodape!: ElementRef<HTMLDivElement>;
  @ViewChild('paginaEl') private readonly paginaEl!: ElementRef<HTMLDivElement>;
  /** Caixa INTEIRA do cabeçalho/rodapé da página 1 (prévia dos itens predefinidos + texto próprio do usuário juntos) — usada só pra MEDIR a altura real (30/09/2026, ver `alturaCabecalhoPx`). */
  @ViewChild('caixaCabecalho') private readonly caixaCabecalho!: ElementRef<HTMLDivElement>;
  @ViewChild('caixaRodape') private readonly caixaRodape!: ElementRef<HTMLDivElement>;
  /**
   * `<style>` criada via DOM puro, NÃO declarada no template (30/09/2026,
   * bug real achado testando: o compilador do Angular trata qualquer
   * `<style>` literal no HTML de um componente de forma especial —
   * extrai o conteúdo em tempo de compilação e injeta no `<head>` junto
   * com o CSS normal do componente, então nem chega a existir como um nó
   * de DOM de verdade no corpo da página pra um `@ViewChild`/binding
   * atualizar depois. `document.createElement` direto contorna isso.
   */
  private readonly folhaEstilos = document.createElement('style');

  protected readonly rotulosTipo = ROTULOS_TIPO_CONTRATO_MODELO;
  protected readonly rotulosTamanhoPapel = ROTULOS_TAMANHO_PAPEL;
  protected readonly rotulosTagEstilo = ROTULOS_TAG_ESTILO;
  protected readonly rotulosCaixaTexto = ROTULOS_CAIXA_TEXTO;
  protected readonly rotulosListaFormato = ROTULOS_LISTA_FORMATO;
  protected readonly opcoesTamanhoPapel: readonly TamanhoPapelContrato[] = ['a4', 'carta', 'oficio'];
  protected readonly opcoesTagEstilo: readonly TagHtmlEstilo[] = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'];
  protected readonly opcoesListaFormato: readonly ListaFormatoEstilo[] = ['numero', 'romano_minusculo', 'romano_maiusculo', 'letra_minuscula', 'letra_maiuscula'];
  protected readonly opcoesCaixaTexto: readonly CaixaTextoEstilo[] = ['nenhuma', 'maiuscula', 'primeira_maiuscula', 'cada_palavra'];
  protected readonly opcoesNivelTitulo = [1, 2, 3, 4, 5, 6, 7];
  protected readonly rotulosObjetoVariavel = ROTULOS_OBJETO_VARIAVEL;
  protected readonly tipo = signal<TipoContratoModelo>('empreita');
  protected readonly objetosDisponiveis = computed(() => OBJETOS_POR_TIPO[this.tipo()]);

  protected readonly nome = signal('');
  protected readonly carregando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly salvo = signal(false);
  protected readonly erro = signal<string | null>(null);

  /**
   * Qual área de edição tem o foco agora (30/09/2026, pedido do Lucas:
   * "utilize o mesmo espaço que insere as variáveis no corpo pra inserir
   * no cabeçalho e no rodapé... utilize todos os campos de formatação em
   * vez de deixar as opções dentro de cada um") — a barra principal
   * inteira (estilo, variável, negrito/itálico/alinhamento…) passa a agir
   * sobre QUALQUER UMA das três áreas, a que estiver focada.
   */
  protected readonly areaFocada = signal<AreaEditavel>('corpo');
  /** O elemento editável que recebeu o foco por último — pode ser um CLONE de cabeçalho/rodapé de outra folha (ver `criarCloneCabecalhoOuRodape`). */
  private elementoEmFoco: HTMLElement | null = null;

  protected aoFocarArea(area: AreaEditavel, elemento?: HTMLElement): void {
    this.areaFocada.set(area);
    this.elementoEmFoco = elemento ?? null;

    // Cabeçalho/rodapé sem texto próprio: some com o `<br>` que sobrou de
    // edições anteriores (escondido pela classe `vazio`) — o cursor cai na
    // área limpa e a primeira letra digitada não ganha uma linha vazia junto.
    if (area !== 'corpo') {
      const alvo = elemento ?? (area === 'cabecalho' ? this.areaCabecalho : this.areaRodape).nativeElement;
      if (!temConteudoProprio(alvo) && alvo.innerHTML !== '') alvo.innerHTML = '';
    }
  }

  private elementoDaAreaFocada(): HTMLElement {
    if (this.elementoEmFoco?.isConnected) return this.elementoEmFoco;
    return { corpo: this.area, cabecalho: this.areaCabecalho, rodape: this.areaRodape }[this.areaFocada()].nativeElement;
  }

  protected readonly objetoVariavel = signal<ObjetoVariavelContrato | ''>('');

  protected readonly variaveisDisponiveis = computed(() => {
    const noCorpo = this.areaFocada() === 'corpo';
    return this.variaveisDoObjeto(this.objetoVariavel(), !noCorpo).filter((v) => noCorpo || !v.soCorpo);
  });

  /** Variáveis com `grupo` viram um menu (são muitas — totais da EAP por categoria); as demais continuam botões. */
  protected readonly variaveisSoltas = computed(() => this.variaveisDisponiveis().filter((v) => !v.grupo));
  protected readonly gruposDeVariaveis = computed(() => {
    const grupos = new Map<string, VariavelContrato[]>();
    for (const v of this.variaveisDisponiveis()) {
      if (v.grupo) grupos.set(v.grupo, [...(grupos.get(v.grupo) ?? []), v]);
    }
    return [...grupos].map(([nome, variaveis]) => ({ nome, variaveis }));
  });

  protected readonly opcoesEntrelinha = OPCOES_ENTRELINHA;
  protected readonly ajudaFormulaAberta = signal(false);
  /** Ficam no TS porque `{{` escrito no template (até como entidade HTML) vira interpolação do Angular. */
  protected readonly tituloBotaoFormula = 'Inserir fórmula com variáveis — ex.: {{=total_material+total_mao_de_obra}} (só no corpo do documento)';
  protected readonly exemplosFormula = {
    abre: '{{=',
    fecha: '}}',
    soma: '{{=total_material+total_mao_de_obra}}',
    texto: '{{=TEXTO(total_geral)}}',
    bdi: '{{=custo_material*bdi_pct_material}}',
  };

  protected rotuloEntrelinha(valor: number): string {
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }

  // ---- Configuração de página (29/09/2026; margens verticais
  // redesenhadas em 30/09/2026 — ver `alturaCabecalhoPx`/`alturaUtilPaginaPx`
  // logo abaixo) ----
  protected readonly painelPaginaAberto = signal(false);
  protected readonly margemDireita = signal(15);
  protected readonly margemEsquerda = signal(15);
  protected readonly margemCabecalho = signal(8);
  protected readonly margemRodape = signal(8);
  protected readonly tamanhoPapel = signal<TamanhoPapelContrato>('a4');
  protected readonly orientacao = signal<OrientacaoContrato>('retrato');

  /** Tag pra anexar automaticamente o PDF gerado em massa (30/09/2026) — ver geração em lote na lista de Empreitas. */
  protected readonly tagAnexoId = signal<string>('');
  /** Padrão da tabela da EAP — só `tipo === 'proposta'` (14/10/2026). */
  protected readonly configProposta = signal<ConfigProposta>(normalizarConfigProposta(null));
  protected readonly tags = signal<Tag[]>([]);

  /**
   * Dimensões reais da folha em tela (30/09/2026, pedido do Lucas: "quero
   * ver o contrato ao vivo... o editor deve refletir exatamente como o
   * contrato vai sair"). Largura/altura vêm do papel (A4/Carta/Ofício, já
   * invertido se paisagem) e o padding vem das margens — como
   * `box-sizing: border-box` já é padrão neste projeto, aumentar a margem
   * ENCOLHE a área de texto disponível (empurra/quebra linha) em vez de
   * cortar.
   */
  protected readonly larguraFolhaPx = computed(() => {
    const [larguraMm, alturaMm] = TAMANHOS_PAPEL_MM[this.tamanhoPapel()];
    return mmParaPx(this.orientacao() === 'paisagem' ? alturaMm : larguraMm);
  });

  protected readonly alturaFolhaPx = computed(() => {
    const [larguraMm, alturaMm] = TAMANHOS_PAPEL_MM[this.tamanhoPapel()];
    return mmParaPx(this.orientacao() === 'paisagem' ? larguraMm : alturaMm);
  });

  /**
   * Só esquerda/direita (30/09/2026) — em cima/embaixo não tem mais um
   * número próprio: o corpo começa exatamente onde a CAIXA do cabeçalho
   * termina, e termina onde a do rodapé começa (pedido do Lucas: "as
   * bordas superiores e inferiores da página devem ser calculadas com
   * base na base e topo do cabeçalho e rodapé"). Ver `alturaUtilPaginaPx`.
   */
  protected readonly paddingFolha = computed(() => `0 ${mmParaPx(this.margemDireita())}px 0 ${mmParaPx(this.margemEsquerda())}px`);

  /** Wrapper pro template (`mmParaPx` é uma função de módulo, não um método da classe). */
  protected mmParaPxPublico(mm: number): number {
    return mmParaPx(mm);
  }

  private readonly larguraFolhaMm = computed(() => {
    const [larguraMm, alturaMm] = TAMANHOS_PAPEL_MM[this.tamanhoPapel()];
    return this.orientacao() === 'paisagem' ? alturaMm : larguraMm;
  });

  private readonly alturaFolhaMm = computed(() => {
    const [larguraMm, alturaMm] = TAMANHOS_PAPEL_MM[this.tamanhoPapel()];
    return this.orientacao() === 'paisagem' ? larguraMm : alturaMm;
  });

  /** Marcas de 1cm em 1cm pras réguas (30/09/2026, pedido do Lucas: "coloque
   *  uma régua nas laterais da folha, essas régua medem o tamanho real da
   *  folha"). Cada posição é em cm inteiros a partir do canto superior
   *  esquerdo — o template converte pra px na hora de posicionar. */
  protected readonly marcasHorizontais = computed(() =>
    Array.from({ length: Math.floor(this.larguraFolhaMm() / 10) + 1 }, (_, i) => i),
  );
  protected readonly marcasVerticais = computed(() =>
    Array.from({ length: Math.floor(this.alturaFolhaMm() / 10) + 1 }, (_, i) => i),
  );

  /** Qual alça de margem está sendo arrastada agora — só pra feedback visual (cursor/destaque). */
  protected readonly arrastandoMargem = signal<'cabecalho' | 'direita' | 'rodape' | 'esquerda' | null>(null);

  /**
   * Arrastar a margem direto na régua/folha, feito igual o Word (30/09/2026,
   * pedido do Lucas: "troque a forma de definir margem, faça igual o
   * word"). Os campos numéricos do painel "Página" continuam existindo
   * (útil pra digitar um valor exato) — isso aqui é só outro jeito de
   * chegar no mesmo signal de margem. Em cima/embaixo agora arrasta a
   * DISTÂNCIA da borda até o cabeçalho/rodapé (`margemCabecalho`/
   * `margemRodape`) — não existe mais uma margem superior/inferior do
   * corpo separada, ela é CALCULADA a partir do cabeçalho/rodapé (ver
   * `alturaUtilPaginaPx`).
   *
   * Limite do arraste corrigido nesta rodada (bug relatado pelo Lucas:
   * "a borda inferior tá travando em 149mm") — o cálculo antigo travava
   * em EXATAMENTE metade da folha (`Math.round(tamanhoMm / 2)`, que pra
   * A4 retrato — 297mm — dá exatamente 149). Como agora é só a distância
   * até o cabeçalho/rodapé (não o corpo inteiro), um limite generoso e
   * fixo (60mm, mesmo teto já usado nos campos numéricos) faz mais
   * sentido que uma fração da folha.
   */
  protected iniciarArrasteMargem(lado: 'cabecalho' | 'direita' | 'rodape' | 'esquerda', evento: MouseEvent): void {
    evento.preventDefault();
    evento.stopPropagation();
    this.arrastandoMargem.set(lado);

    const retangulo = this.paginaEl.nativeElement.getBoundingClientRect();
    const alvo = {
      cabecalho: this.margemCabecalho,
      direita: this.margemDireita,
      rodape: this.margemRodape,
      esquerda: this.margemEsquerda,
    }[lado];
    const ehVertical = lado === 'cabecalho' || lado === 'rodape';
    const maximoMm = ehVertical ? 60 : Math.round(this.larguraFolhaMm() / 2);

    const mover = (e: MouseEvent) => {
      let mm: number;
      switch (lado) {
        case 'esquerda':
          mm = pxParaMm(e.clientX - retangulo.left);
          break;
        case 'direita':
          mm = pxParaMm(retangulo.right - e.clientX);
          break;
        case 'cabecalho':
          mm = pxParaMm(e.clientY - retangulo.top);
          break;
        case 'rodape':
          mm = pxParaMm(retangulo.bottom - e.clientY);
          break;
      }
      mm = Math.max(0, Math.min(maximoMm, Math.round(mm)));
      alvo.set(mm);
    };
    const soltar = () => {
      this.arrastandoMargem.set(null);
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      this.recalcularQuebrasPagina();
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  }

  /**
   * Altura real (medida, não escolhida) da caixa de cabeçalho/rodapé —
   * prévia dos itens predefinidos + texto próprio do usuário juntos
   * (30/09/2026, pedido do Lucas: "o cabeçalho deve ter o tamanho mínimo
   * pra caber esses itens"). Atualizada sempre que `recalcularQuebrasPagina`
   * roda (mesmo gatilho/debounce — digitar no cabeçalho/rodapé também
   * muda a altura dele).
   */
  protected readonly alturaCabecalhoPx = signal(0);
  protected readonly alturaRodapePx = signal(0);

  /**
   * 14/10/2026: mesma regra de `ContratoPdfController::medirAlturaHtmlMm` —
   * altura de verdade (`getBoundingClientRect`, fracionária) arredondada PRA
   * CIMA. A caixa canônica fica com essa altura exata (`min-height`) e os
   * clones das outras folhas também (`height`), pra todo cabeçalho/rodapé
   * ter o mesmo número inteiro de px e cada folha cair certinho no bloco de
   * fundo (`.folha-bloco`, posicionado por conta, não pelo fluxo).
   */
  private medirCabecalhoERodape(): void {
    const medir = (caixa: HTMLElement | undefined, alvo: WritableSignal<number>) => {
      if (!caixa) return;
      caixa.style.minHeight = '';
      const altura = Math.ceil(caixa.getBoundingClientRect().height);
      caixa.style.minHeight = `${altura}px`;
      alvo.set(altura);
    };
    medir(this.caixaCabecalho?.nativeElement, this.alturaCabecalhoPx);
    medir(this.caixaRodape?.nativeElement, this.alturaRodapePx);
  }

  /** Quantas folhas o documento ocupa agora — cada uma vira um bloco branco de tamanho fixo atrás do texto (`.folha-bloco`). */
  protected readonly totalFolhas = signal(1);
  protected readonly indicesFolhas = computed(() => Array.from({ length: this.totalFolhas() }, (_, i) => i));
  /** Distância do topo de uma folha até o topo da seguinte (folha + vão). */
  protected readonly passoFolhaPx = computed(() => this.alturaFolhaPx() + GAP_PAGINA_PX);
  protected readonly alturaTotalFolhasPx = computed(() => this.totalFolhas() * this.passoFolhaPx() - GAP_PAGINA_PX);

  /**
   * Altura útil do corpo de UMA página impressa (30/09/2026, redesenhado —
   * pedido do Lucas: "as bordas superiores e inferiores da página devem
   * ser calculadas com base na base e topo do cabeçalho e rodapé
   * respectivamente"). Antes era `alturaFolha - margemSuperior -
   * margemInferior` (dois números escolhidos à parte); agora é o que
   * sobra depois de tirar a altura de VERDADE que o cabeçalho/rodapé
   * ocupam (medida, não escolhida) — exatamente a mesma lógica usada no
   * PDF de verdade (`ContratoPdfController::gerar`, que MEDE o
   * cabeçalho/rodapé reais antes de gerar o PDF, em vez de usar uma
   * margem fixa).
   *
   * NÃO soma `margemCabecalho`/`margemRodape` de novo aqui — bug achado
   * em 30/09/2026 (relatado pelo Lucas: a quebra da página 1 saía bem
   * antes do fim real do PDF). `caixaCabecalho`/`caixaRodape` já têm
   * `padding-top`/`padding-bottom` igual a `margemCabecalho`/`margemRodape`
   * (ver template), então `alturaCabecalhoPx`/`alturaRodapePx`
   * (`offsetHeight` dessas caixas) JÁ incluem essa distância — somar de
   * novo descontava a margem duas vezes, encolhendo a altura útil da
   * página bem abaixo do que o PDF de verdade usa (que mede a mesma
   * caixa, com o padding embutido, só uma vez).
   */
  protected readonly alturaUtilPaginaPx = computed(
    () => this.alturaFolhaPx() - this.alturaCabecalhoPx() - this.alturaRodapePx(),
  );

  private temporizadorQuebras: ReturnType<typeof setTimeout> | undefined;

  /** Versão com espera (30/09/2026) — chamada a cada tecla digitada; não recalcula a cada uma, só quando o usuário para de digitar por um instante, pra não atrapalhar o cursor no meio da digitação. */
  protected agendarRecalculoQuebras(): void {
    clearTimeout(this.temporizadorQuebras);
    this.temporizadorQuebras = setTimeout(() => this.recalcularQuebrasPagina(), 900);
  }

  /**
   * Clona a caixa de cabeçalho/rodapé (prévia dos itens predefinidos +
   * texto próprio já digitado) pra repetir visualmente em cada folha
   * (30/09/2026, pedido do Lucas: "coloque o cabeçalho e rodapé
   * aparecendo em todas as folhas... a edição de qualquer cabeçalho ou
   * qualquer rodapé edita em todas as folhas"). A prévia dos itens
   * predefinidos (logo/nome/data) vem junto no clone — não é editável
   * ali (nunca foi, vem do Perfil da empresa) — só a parte de texto
   * próprio do usuário (`.area-editavel-sincronizada`, mesma classe do
   * `#areaCabecalho`/`#areaRodape` "canônicos") continua de verdade
   * editável dentro do clone: digitar nela sincroniza pro canônico (e,
   * no próximo recálculo, pros outros clones) — é assim que "editar em
   * qualquer folha edita todas".
   */
  private criarCloneCabecalhoOuRodape(tipo: 'cabecalho' | 'rodape'): HTMLElement {
    const origem = tipo === 'cabecalho' ? this.caixaCabecalho.nativeElement : this.caixaRodape.nativeElement;
    const clone = origem.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.classList.add('clone-pagina');
    clone.setAttribute('contenteditable', 'false');
    // Mesma altura inteira da canônica (ver `medirCabecalhoERodape`).
    clone.style.minHeight = '';
    clone.style.height = `${tipo === 'cabecalho' ? this.alturaCabecalhoPx() : this.alturaRodapePx()}px`;

    const editavel = clone.querySelector<HTMLElement>('.area-editavel-sincronizada');
    if (editavel) {
      editavel.setAttribute('contenteditable', 'true');
      editavel.addEventListener('input', () => this.sincronizarDeClone(tipo, editavel));
      // 14/10/2026: com a folha como bloco, o rodapé canônico mora na ÚLTIMA
      // folha — o da folha 1 (o primeiro que se clica) é um clone. A barra
      // de formatação precisa agir NELE, não pular pro canônico.
      editavel.addEventListener('focus', () => this.aoFocarArea(tipo, editavel));
      editavel.addEventListener('paste', (evento) => this.aoColar(evento));
      editavel.addEventListener('keydown', (evento) => this.aoTeclarNaArea(evento));
      editavel.addEventListener('mousedown', (evento) => this.aoClicarNaArea(evento));
    }
    return clone;
  }

  /** Bloco digitado num CLONE (não no canônico) vira a nova fonte de verdade — propaga pro canônico; os outros clones pegam essa mudança no próximo recálculo (debounced, mesmo gatilho de sempre). */
  private sincronizarDeClone(tipo: 'cabecalho' | 'rodape', origemEditavel: HTMLElement): void {
    const canonico = tipo === 'cabecalho' ? this.areaCabecalho.nativeElement : this.areaRodape.nativeElement;
    if (canonico.innerHTML !== origemEditavel.innerHTML) canonico.innerHTML = origemEditavel.innerHTML;
    this.atualizarEstadoVazio(canonico);
    this.atualizarEstadoVazio(origemEditavel);
    this.agendarRecalculoQuebras();
  }

  /**
   * Cabeçalho/rodapé sem texto próprio (14/10/2026, pedido do Lucas:
   * cabeçalho MÍNIMO) — a classe `vazio` tira o `<br>` que sobra no
   * `contenteditable` e o recuo de 2mm do texto, pra caixa ficar só com as
   * folgas, igual ao PDF (`ContratoPdfController::htmlTemConteudo`).
   */
  protected atualizarEstadoVazio(editavel: HTMLElement): void {
    editavel.classList.toggle('vazio', !temConteudoProprio(editavel));
  }

  protected aoDigitarCabecalhoOuRodape(evento: Event): void {
    this.atualizarEstadoVazio(evento.target as HTMLElement);
    this.agendarRecalculoQuebras();
  }

  /**
   * Monta a passagem de uma folha pra outra: branco até o fim do corpo da
   * folha atual + o clone do rodapé dela + o vão entre as folhas + o clone do
   * cabeçalho da seguinte. A altura do branco NÃO vem pronta: quem chama
   * insere o espaçador e mede onde ele caiu de verdade (ver `inserirQuebra`
   * em `recalcularQuebrasPagina`). Sem próxima página é só o branco (fim do
   * documento — o rodapé que vem logo depois é o canônico).
   */
  private criarEspacadorQuebra(comProximaPagina: boolean): { elemento: HTMLElement; branco: HTMLElement } {
    const espacador = document.createElement('div');
    espacador.className = 'quebra-pagina';
    espacador.contentEditable = 'false';
    espacador.style.marginLeft = `-${mmParaPx(this.margemEsquerda())}px`;
    espacador.style.marginRight = `-${mmParaPx(this.margemDireita())}px`;

    const branco = document.createElement('div');
    branco.className = 'branco-fim-folha';
    espacador.appendChild(branco);

    if (comProximaPagina) {
      espacador.appendChild(this.criarCloneCabecalhoOuRodape('rodape'));
      const vao = document.createElement('div');
      vao.className = 'vao-entre-folhas';
      vao.style.height = `${GAP_PAGINA_PX}px`;
      espacador.appendChild(vao);
      espacador.appendChild(this.criarCloneCabecalhoOuRodape('cabecalho'));
    }

    return { elemento: espacador, branco };
  }

  /**
   * Depois de um bloco gigante que atravessou o fim de uma folha: empurra
   * `antesDe` até o começo do corpo da folha seguinte (`topoCorpo`, medido
   * a partir do topo da área), desenhando o cabeçalho-clone dela quando
   * ainda sobra lugar pra ele (o rodapé da folha atravessada fica por baixo
   * do bloco — não tem onde desenhar).
   */
  private inserirEmpurraoAteFolha(area: HTMLElement, antesDe: Element, topoCorpo: number): void {
    const empurrao = document.createElement('div');
    empurrao.className = 'quebra-pagina';
    empurrao.contentEditable = 'false';
    empurrao.style.marginLeft = `-${mmParaPx(this.margemEsquerda())}px`;
    empurrao.style.marginRight = `-${mmParaPx(this.margemDireita())}px`;
    const branco = document.createElement('div');
    branco.className = 'branco-fim-folha';
    empurrao.appendChild(branco);
    area.insertBefore(empurrao, antesDe);

    const inicio = empurrao.offsetTop;
    const antesDoCabecalho = topoCorpo - this.alturaCabecalhoPx() - inicio;
    if (antesDoCabecalho >= 0) {
      branco.style.height = `${antesDoCabecalho}px`;
      empurrao.appendChild(this.criarCloneCabecalhoOuRodape('cabecalho'));
    } else {
      branco.style.height = `${Math.max(0, topoCorpo - inicio)}px`;
    }
  }

  /**
   * Divide uma lista (`<ul>`/`<ol>`, ex.: `<ol class="lista-clausulas">`)
   * que não cabe inteira no resto da página atual, movendo os itens que
   * não cabem pra uma CONTINUAÇÃO dela (mesma classe; `<ol>` ganha
   * `start` ajustado pra renumerar certo) logo depois do espaçador —
   * achado comparando pixel a pixel a edição contra o PDF de verdade
   * (01/10/2026): sem isso, uma lista de cláusulas inteira (ex.: itens 5
   * a 13 de um `<ol>` só) conta como UM filho direto de `.area-edicao`,
   * e o algoritmo só sabe inserir quebra ANTES ou DEPOIS de um filho
   * inteiro — a lista inteira pulava pra página seguinte mesmo cabendo
   * só o 1º item na atual. O Chromium do PDF faz o oposto por padrão
   * (fragmenta dentro da lista, por `<li>`, a menos que `break-inside`
   * trave isso), por isso a quebra da edição sempre ficava uma folga
   * atrás da quebra real do PDF. `.area-edicao` tem `position: relative`
   * (ver SCSS), então o `offsetTop` de QUALQUER `<li>` dentro dela — mesmo
   * dentro do `<ol>` — já vem na MESMA referência dos filhos diretos
   * (confirmado testando: `ol.offsetTop === ol.children[0].offsetTop`),
   * então não precisa converter nada pra comparar com `limite`.
   *
   * Devolve a CONTINUAÇÃO (pra virar o novo "filho" a reprocessar) ou
   * `null` quando não dá pra dividir (não é lista, só tem 1 item, ou nem
   * o 1º item cabe — mesma situação de "bloco grande demais" de antes).
   */
  private tentarDividirLista(filho: HTMLElement, limite: number): HTMLElement | null {
    if (filho.tagName !== 'UL' && filho.tagName !== 'OL') return null;
    const itens = Array.from(filho.children) as HTMLElement[];
    if (itens.length < 2) return null;

    const indiceQuebra = itens.findIndex((item) => item.offsetTop + item.offsetHeight > limite);
    if (indiceQuebra <= 0) return null; // nem o 1º item cabe, ou nenhum estoura — não dá/não precisa dividir

    const continuacao = document.createElement(filho.tagName) as HTMLElement;
    continuacao.className = filho.className;
    // Marca pra `salvar()` reconhecer e remendar de volta numa lista só —
    // ver `mesclarListasDivididas` — nunca deve virar HTML salvo de verdade.
    continuacao.dataset['continuacaoLista'] = 'true';
    if (filho.tagName === 'OL') {
      const inicioOriginal = parseInt(filho.getAttribute('start') || '1', 10);
      continuacao.setAttribute('start', String(inicioOriginal + indiceQuebra));
    }
    for (const item of itens.slice(indiceQuebra)) continuacao.appendChild(item);
    filho.after(continuacao);
    return continuacao;
  }

  /**
   * Desfaz a divisão de `tentarDividirLista` antes de salvar — sem isso,
   * o `conteudo` salvo gravaria a lista já fatiada em vários `<ol>`
   * (um por página que ela ocupava NA HORA de salvar), e cada reabertura
   * fatiaria de novo a partir daí, piorando a cada vez. Só mexe em
   * elementos marcados com `data-continuacao-lista` (criados só pela
   * paginação), nunca em listas de verdade que o usuário colocou lado a
   * lado de propósito.
   */
  private mesclarListasDivididas(raiz: HTMLElement): void {
    const continuacoes = Array.from(raiz.querySelectorAll<HTMLElement>('[data-continuacao-lista]'));
    for (const continuacao of continuacoes) {
      const anterior = continuacao.previousElementSibling as HTMLElement | null;
      if (!anterior || anterior.tagName !== continuacao.tagName) continue; // não deveria acontecer, mas não arrisca mesclar errado
      while (continuacao.firstChild) anterior.appendChild(continuacao.firstChild);
      continuacao.remove();
    }
  }

  /**
   * Separação de páginas DE VERDADE, sempre no tamanho real da folha
   * (30/09/2026, pedido do Lucas: "coloca a separação da página com o
   * tamanho real da folha sempre, se a quebra for antes, deixe o resto
   * da folha em branco" — antes só aparecia um vão quando o conteúdo
   * REALMENTE estourava a página; um documento curto não mostrava
   * separação nenhuma). Ainda é uma APROXIMAÇÃO do PDF de verdade — só o
   * Chromium do Browsershot decide a quebra definitiva, e um bloco
   * individual maior que uma página inteira não é dividido — mas agora
   * toda folha (mesmo a última, mesmo sem estourar) aparece com a altura
   * real do papel, com o rodapé sempre na base dela e o resto em branco
   * se o conteúdo for curto.
   *
   * Os espaçadores (e os clones de cabeçalho/rodapé dentro deles) nunca
   * são focáveis NA PARTE DE FORA (só a ilha `.area-editavel-sincronizada`
   * dentro do clone é) — inserir/tirar o espaçador em si não mexe no
   * cursor de nenhum texto real do corpo. Pra não perder o cursor de
   * quem está digitando DENTRO de um clone de cabeçalho/rodapé no
   * instante do recálculo, essa função adia a si mesma se detectar foco
   * ativo dentro de algum clone.
   *
   * Nada disso é salvo — `salvar()` lê de um clone do DOM com
   * `.quebra-pagina` removido antes de virar HTML, porque a altura de
   * página pode mudar (papel/orientação/margem) e é tudo recalculado do
   * zero sempre, aqui e na tela de impressão.
   *
   * 14/10/2026 — cada folha virou um BLOCO de tamanho fixo (pedido do
   * Lucas: "tratar ela como um bloco, com altura e largura fixa conforme
   * definido no tamanho do papel"). As folhas brancas (`.folha-bloco`) são
   * desenhadas atrás do texto, cada uma no lugar CALCULADO (`folha ×
   * passoFolhaPx`) — e o corpo da folha `n` vai, em coordenadas da área de
   * edição, de `n × passo` até `n × passo + alturaUtil`. Cada espaçador é
   * inserido e só DEPOIS recebe a altura do branco, medindo onde ele caiu de
   * verdade: o rodapé-clone sempre começa exatamente no fim do corpo da
   * folha (antes a conta somava alturas e a diferença de margem entre
   * blocos ia acumulando). Fim do documento: o rodapé canônico (logo depois
   * da área) cai na base da última folha.
   */
  private recalcularQuebrasPagina(): void {
    const area = this.area?.nativeElement;
    if (!area || !this.caixaCabecalho?.nativeElement || !this.caixaRodape?.nativeElement) return;

    const focoAtivo = document.activeElement;
    if (focoAtivo instanceof HTMLElement && area.contains(focoAtivo) && focoAtivo.closest('.clone-pagina')) {
      this.agendarRecalculoQuebras();
      return;
    }

    area.querySelectorAll(':scope > .quebra-pagina').forEach((el) => el.remove());
    this.atualizarEstadoVazio(this.areaCabecalho.nativeElement);
    this.atualizarEstadoVazio(this.areaRodape.nativeElement);
    this.medirCabecalhoERodape();

    const alturaUtil = this.alturaUtilPaginaPx();
    const passo = this.passoFolhaPx();
    // Documento vazio/curto: a área já ocupa o corpo inteiro da 1ª folha
    // (rodapé na base dela) sem precisar de espaçador — um espaçador sozinho
    // numa área vazia "rouba" o clique de quem vai começar a digitar.
    area.style.minHeight = `${Math.max(0, alturaUtil)}px`;
    if (!(alturaUtil > 100)) {
      this.totalFolhas.set(1);
      return; // cabeçalho/rodapé maiores que a folha ou coisa do tipo — não tenta paginar
    }

    let pagina = 0;
    let limite = alturaUtil; // fim do corpo da folha atual, a partir do topo da área

    const inserirQuebra = (antesDe: Element | null, comProximaPagina: boolean, forcada = false) => {
      const { elemento, branco } = this.criarEspacadorQuebra(comProximaPagina);
      // quebra manual: o bloco seguinte mantém a margem de cima (ver `.forcada` no SCSS)
      if (forcada) elemento.classList.add('forcada');
      area.insertBefore(elemento, antesDe);
      let falta = limite - elemento.offsetTop;
      if (falta < 0) {
        // Só a margem de baixo do bloco anterior passou do fim do corpo (no
        // PDF essa margem some na quebra de página) — sobe o espaçador por
        // cima dela, pro rodapé-clone não descer do lugar.
        const anterior = elemento.previousElementSibling;
        const margem = anterior ? parseFloat(getComputedStyle(anterior).marginBottom) || 0 : 0;
        if (-falta <= margem + 0.5) {
          elemento.style.marginTop = `${falta}px`;
          falta = 0;
        }
      }
      branco.style.height = `${Math.max(0, falta)}px`;
    };

    let filho = area.firstElementChild as HTMLElement | null;
    let seguranca = 0;

    while (filho && seguranca < 2000) {
      seguranca++;

      // Bloco gigante logo antes (mais alto que uma folha inteira, não dá
      // pra dividir — fica onde está, como o PDF também parte ele no meio):
      // ele terminou além do corpo desta folha. Realinha a contagem na folha
      // onde ele termina; se acabou no meio do rodapé/vão/cabeçalho, empurra
      // este bloco pro começo do corpo da folha seguinte. (Um bloco que só
      // COMEÇA depois do limite por causa da margem do anterior não cai
      // aqui — é uma quebra normal, logo abaixo.)
      const anterior = filho.previousElementSibling as HTMLElement | null;
      if (anterior && !anterior.classList.contains('quebra-pagina') && anterior.offsetTop + anterior.offsetHeight > limite) {
        const fim = anterior.offsetTop + anterior.offsetHeight;
        let folha = Math.floor(fim / passo);
        if (fim - folha * passo > alturaUtil) {
          folha++;
          this.inserirEmpurraoAteFolha(area, filho, folha * passo);
        }
        pagina = folha;
        limite = folha * passo + alturaUtil;
      }

      if (filho.hasAttribute('data-quebra-manual')) {
        // Quebra de página MANUAL (`inserirQuebraManual`) — força a quebra
        // bem aqui, mesmo sobrando espaço na página atual (diferente do
        // resto do loop, que só quebra quando o conteúdo realmente não
        // cabe). O marcador em si fica no lugar (é conteúdo de verdade,
        // salvo no modelo) — só o espaçador visual entra DEPOIS dele.
        const proximoReal = filho.nextElementSibling as HTMLElement | null;
        inserirQuebra(proximoReal, true, true);
        pagina++;
        limite = pagina * passo + alturaUtil;
        filho = proximoReal;
        continue;
      }

      const altura = filho.offsetHeight;

      if (filho.offsetTop + altura > limite) {
        const continuacao = this.tentarDividirLista(filho, limite);
        if (!continuacao && altura > alturaUtil) {
          // bloco indivisível (não é lista, ou só tem 1 item) maior que
          // uma página inteira — não dá pra dividir, segue pro próximo.
          filho = filho.nextElementSibling as HTMLElement | null;
          continue;
        }
        const alvo = continuacao ?? filho;
        inserirQuebra(alvo, true);
        pagina++;
        limite = pagina * passo + alturaUtil;
        filho = alvo;
        continue; // reprocessa o item que ficou no começo da nova página — pode estourar de novo (lista longa, 3+ páginas).
      }
      filho = filho.nextElementSibling as HTMLElement | null;
    }

    // Completa a ÚLTIMA folha até o fim do corpo — o rodapé canônico (logo
    // depois da área) cai na base dela. Documento vazio não precisa (ver
    // `min-height` da área acima).
    const temConteudo = Array.from(area.children).some((c) => !c.classList.contains('quebra-pagina'));
    if (temConteudo) inserirQuebra(null, false);

    this.totalFolhas.set(pagina + 1);
    this.reposicionarMolduraImagem();
  }

  // ---- Prévia do que o sistema desenha sozinho no PDF (30/09/2026,
  // pedido do Lucas: "alguns elementos aparecem no PDF mas não aparecem
  // na minha visualização... logo da empresa, título com nome da
  // empresa, papel timbrado, título do documento, data de geração") —
  // mesmos dados que `CabecalhoImpressao` usa de verdade no PDF.
  protected readonly perfilEmpresa = signal<PerfilEmpresa | null>(null);
  protected readonly logoUrl = computed(() => {
    const caminho = this.perfilEmpresa()?.logoUrl;
    return caminho ? this.api.baseStorage() + caminho : null;
  });
  /** Mesmo nome que o cabeçalho dos outros PDFs (`CabecalhoImpressao`) e o do contrato (`ContratoPdfController::construirCabecalhoPdf`) mostram. */
  protected readonly nomeEmpresaCabecalho = computed(() => {
    const perfil = this.perfilEmpresa();
    return perfil?.nome || perfil?.razaoSocial || 'ComTrena';
  });
  /** Logomarca do ComTrena no canto direito do cabeçalho (14/10/2026) — mesmo arquivo de `CabecalhoImpressao`. */
  protected readonly logoComtrenaUrl = 'marca/comtrena-logomarca-para-fundo-claro.svg';
  protected readonly papelTimbradoUrl = computed(() => {
    const caminho = this.perfilEmpresa()?.papelTimbradoUrl;
    return caminho ? this.api.baseStorage() + caminho : null;
  });
  protected readonly subtituloDocumento = computed(() => {
    switch (this.tipo()) {
      case 'empreita': return 'Contrato de empreitada';
      case 'proposta': return 'Proposta comercial';
      default: return 'Contrato de obra';
    }
  });
  protected readonly formatarDataHora = formatarDataHora;
  protected readonly geradoEmExemplo = new Date().toISOString();

  /**
   * Papel timbrado (30/09/2026, redesenho — pedido do Lucas: "tire a
   * opção de papel timbrado em faixa no topo, coloque a opção de
   * centralizar a imagem na folha e coloque uma opção de aplicar
   * transparência na imagem e também de redimensionar o tamanho da
   * imagem (mantendo ou não a proporção)"). Só existe mais o modo
   * "fundo" (centralizado) — sem `timbradoModo`/opção de faixa no topo.
   */
  protected readonly timbradoLarguraPct = signal(100);
  protected readonly timbradoAlturaPct = signal<number | null>(null);
  protected readonly timbradoManterProporcao = signal(true);
  protected readonly timbradoOpacidade = signal(100);

  /** `X% auto` deixa o CSS calcular a altura mantendo a proporção natural da imagem — sem precisar saber as dimensões dela aqui. */
  protected readonly estiloTimbradoFundo = computed(() => {
    const url = this.papelTimbradoUrl();
    if (!url) return null;
    const tamanho = this.timbradoManterProporcao()
      ? `${this.timbradoLarguraPct()}% auto`
      : `${this.timbradoLarguraPct()}% ${this.timbradoAlturaPct() ?? this.timbradoLarguraPct()}%`;
    return { backgroundImage: `url(${url})`, backgroundSize: tamanho, opacity: this.timbradoOpacidade() / 100 };
  });

  // ---- Estilos nomeados pelo usuário (30/09/2026: inclui os "padrão", semeados pelo backend) ----
  // Estilos PRÓPRIOS deste modelo (15/10/2026, pedido do Lucas: "editar um
  // estilo edita ele somente no contrato que foi editado"). Antes eram da
  // empresa (um conjunto só pra todos os modelos). A lista da empresa só
  // serve de PONTO DE PARTIDA: modelo novo ou antigo (sem cópia) parte dela;
  // a primeira mudança — e todo salvamento — grava a cópia no modelo.
  private readonly estilosDaEmpresa = signal<ContratoEstilo[]>([]);
  private readonly estilosProprios = signal<ContratoEstilo[] | null>(null);
  protected readonly estilos = computed(() => this.estilosProprios() ?? this.estilosDaEmpresa());
  protected readonly estilosPadrao = computed(() => this.estilos().filter((e) => e.padrao));
  protected readonly estilosPersonalizados = computed(() => this.estilos().filter((e) => !e.padrao));
  protected readonly painelEstilosAberto = signal(false);
  protected readonly estiloForm = signal<FormEstilo>(estiloFormVazio());
  protected readonly salvandoEstilo = signal(false);
  protected readonly erroEstilo = signal<string | null>(null);

  protected readonly algumPainelAberto = computed(
    () => this.painelPaginaAberto() || this.painelEstilosAberto() || this.painelTabelaAberto(),
  );

  /** Recalcula a separação de páginas sempre que algo que muda a altura útil de cada folha muda (papel, orientação, margens) — inclusive via os campos numéricos do painel "Página", não só o arraste na régua. */
  private readonly efeitoRecalcularQuebras = effect(() => {
    this.tamanhoPapel();
    this.orientacao();
    this.margemCabecalho();
    this.margemRodape();
    this.margemEsquerda();
    this.margemDireita();
    queueMicrotask(() => this.recalcularQuebrasPagina());
  });

  ngOnInit(): void {
    document.head.appendChild(this.folhaEstilos);
    this.carregarEstilos();
    this.api.obterPerfilEmpresa().subscribe({ next: (perfil) => this.perfilEmpresa.set(perfil) });
    this.api.listarTags().subscribe({ next: (lista) => this.tags.set(lista.filter((t) => t.ativo)) });

    const id = this.route.snapshot.paramMap.get('contratoModeloId');
    const tipoDaQuery = this.route.snapshot.queryParamMap.get('tipo');

    if (id) {
      this.contratoModeloId.set(id);
      this.carregar(id);
    } else {
      const tipo: TipoContratoModelo = tipoDaQuery === 'obra' || tipoDaQuery === 'proposta' ? tipoDaQuery : 'empreita';
      this.tipo.set(tipo);
    }
  }

  private carregar(id: string): void {
    this.carregando.set(true);
    this.api.listarContratoModelos().subscribe({
      next: (lista) => {
        const modelo = lista.find((m) => m.id === id);
        if (!modelo) {
          this.erro.set('Modelo não encontrado.');
          this.carregando.set(false);
          return;
        }
        this.tipo.set(modelo.tipo);
        this.nome.set(modelo.nome);
        this.configProposta.set(normalizarConfigProposta(modelo.config_proposta));
        // `null` = modelo antigo, ainda sem cópia: parte dos estilos da empresa.
        this.estilosProprios.set(modelo.estilos?.length ? modelo.estilos : null);
        this.area.nativeElement.innerHTML = modelo.conteudo;
        if (modelo.tipo === 'proposta') this.converterMarcadoresEmPrevia(this.area.nativeElement);

        this.margemDireita.set(modelo.margem_direita_mm);
        this.margemEsquerda.set(modelo.margem_esquerda_mm);
        this.margemCabecalho.set(modelo.margem_cabecalho_mm);
        this.margemRodape.set(modelo.margem_rodape_mm);
        this.tamanhoPapel.set(modelo.tamanho_papel);
        this.orientacao.set(modelo.orientacao);
        this.timbradoLarguraPct.set(modelo.timbrado_largura_pct ?? 100);
        this.timbradoAlturaPct.set(modelo.timbrado_altura_pct ?? null);
        this.timbradoManterProporcao.set(modelo.timbrado_manter_proporcao ?? true);
        this.timbradoOpacidade.set(modelo.timbrado_opacidade ?? 100);
        this.tagAnexoId.set(modelo.tag_anexo_id ?? '');
        this.areaCabecalho.nativeElement.innerHTML = modelo.cabecalho_html ?? '';
        this.areaRodape.nativeElement.innerHTML = modelo.rodape_html ?? '';
        this.atualizarEstadoVazio(this.areaCabecalho.nativeElement);
        this.atualizarEstadoVazio(this.areaRodape.nativeElement);

        this.carregando.set(false);
        queueMicrotask(() => this.recalcularQuebrasPagina());
      },
      error: () => {
        this.erro.set('Não foi possível carregar o modelo.');
        this.carregando.set(false);
      },
    });
  }

  // ------------------------------------------------------------------
  // Barra de formatação — `execCommand` age na SELEÇÃO atual da área
  // FOCADA (`elementoDaAreaFocada()`); o `(mousedown)` dos BOTÕES da
  // barra usa `preventDefault()` pra não tirar o foco/seleção do texto
  // antes do comando rodar. Só em botões: um `<select>`/`<input>` NÃO
  // pode ter o próprio `mousedown` bloqueado, senão o navegador nunca
  // abre o dropdown (bug real achado 30/09/2026).
  // ------------------------------------------------------------------
  protected evitarPerderSelecao(evento: MouseEvent): void {
    const alvo = evento.target as HTMLElement;
    if (alvo.tagName === 'SELECT' || alvo.tagName === 'INPUT' || alvo.tagName === 'OPTION') return;
    evento.preventDefault();
  }

  private executarComando(elemento: HTMLElement, comando: string, valor?: string): void {
    elemento.focus();
    document.execCommand(comando, false, valor);
  }

  protected formatar(comando: string, valor?: string): void {
    this.executarComando(this.elementoDaAreaFocada(), comando, valor);
  }

  protected mudarObjetoVariavel(evento: Event): void {
    this.objetoVariavel.set((evento.target as HTMLSelectElement).value as ObjetoVariavelContrato | '');
  }

  protected variaveisDoObjeto(objeto: ObjetoVariavelContrato | '', comPaginacao = false): VariavelContrato[] {
    if (!objeto) return [];
    const base = VARIAVEIS_POR_OBJETO[objeto];
    if (objeto === 'geral' && comPaginacao) {
      return [...base, { chave: 'pagina', rotulo: 'Número da página' }, { chave: 'total_paginas', rotulo: 'Total de páginas' }];
    }
    return [...base];
  }

  protected inserirVariavelFocada(chave: string): void {
    const raiz = this.elementoDaAreaFocada();
    if (chave === 'tabela_eap') {
      if (this.areaFocada() === 'corpo') this.inserirPreviaTabela();
      return;
    }
    // Cursor dentro de uma fórmula ainda aberta (`{{=` sem `}}` depois):
    // entra só o NOME da variável, que é o que a conta espera (`{{=a+b}}`).
    this.executarComando(raiz, 'insertText', this.dentroDeFormula(raiz) ? chave : `{{${chave}}}`);
  }

  /** Variável escolhida no menu de grupos (totais da EAP por categoria). */
  protected inserirVariavelDoMenu(evento: Event): void {
    const alvo = evento.target as HTMLSelectElement;
    const chave = alvo.value;
    alvo.value = '';
    if (chave) this.inserirVariavelFocada(chave);
  }

  private dentroDeFormula(raiz: HTMLElement): boolean {
    const selecao = window.getSelection();
    if (!selecao || !selecao.rangeCount) return false;
    const range = selecao.getRangeAt(0);
    if (!raiz.contains(range.startContainer)) return false;
    const antes = document.createRange();
    antes.setStart(raiz, 0);
    antes.setEnd(range.startContainer, range.startOffset);
    const texto = antes.toString();
    const abertura = texto.lastIndexOf('{{=');
    return abertura >= 0 && texto.indexOf('}}', abertura) < 0;
  }

  // ------------------------------------------------------------------
  // Fórmulas `{{=...}}` (14/10/2026, pedido do Lucas) — calculadas só na
  // geração do PDF (`preencherModeloContrato`, `shared/contrato-modelo-
  // render.ts`). Só no CORPO: cabeçalho/rodapé são montados no servidor,
  // que não calcula fórmula.
  // ------------------------------------------------------------------
  protected inserirFormula(): void {
    if (this.areaFocada() !== 'corpo') return;
    this.executarComando(this.area.nativeElement, 'insertText', '{{=}}');
    // cursor entre o "=" e o "}}" — o próximo clique numa variável já entra dentro da fórmula
    const selecao = window.getSelection();
    const range = selecao?.rangeCount ? selecao.getRangeAt(0) : null;
    if (selecao && range && range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset >= 2) {
      const dentro = document.createRange();
      dentro.setStart(range.startContainer, range.startOffset - 2);
      dentro.collapse(true);
      selecao.removeAllRanges();
      selecao.addRange(dentro);
    }
  }

  protected alternarAjudaFormula(): void {
    this.ajudaFormulaAberta.update((v) => !v);
  }

  // ------------------------------------------------------------------
  // Espaçamento entre linhas "igual no Word" (14/10/2026) — `line-height`
  // inline em cada bloco da seleção (ver `ALTURA_LINHA_SIMPLES`).
  // ------------------------------------------------------------------
  protected aplicarEntrelinha(evento: Event): void {
    const alvo = evento.target as HTMLSelectElement;
    const valor = alvo.value;
    alvo.value = '';
    if (!valor) return;

    const raiz = this.elementoDaAreaFocada();
    raiz.focus();
    for (const bloco of this.blocosDaSelecao(raiz)) {
      if (valor === 'padrao') bloco.style.removeProperty('line-height');
      else bloco.style.lineHeight = String(Math.round(Number(valor) * ALTURA_LINHA_SIMPLES * 1000) / 1000);
    }
    // mesmo caminho de uma digitação: recalcula as folhas e, se for um
    // clone de cabeçalho/rodapé, sincroniza com o canônico.
    raiz.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Blocos de texto que a seleção atual cruza (ou o bloco do cursor) — só os da própria área editável, nunca espaçador/prévia. */
  private blocosDaSelecao(raiz: HTMLElement): HTMLElement[] {
    const selecao = window.getSelection();
    if (!selecao || !selecao.rangeCount || !raiz.contains(selecao.getRangeAt(0).commonAncestorContainer)) return [];

    // Texto solto direto na área (sem bloco em volta): cria o parágrafo antes.
    if (!this.blocoAtualEm(raiz)) document.execCommand('formatBlock', false, 'P');
    const range = selecao.getRangeAt(0);
    const doCursor = this.blocoAtualEm(raiz);
    if (range.collapsed) return doCursor ? [doCursor] : [];

    const seletor = 'p, div, h1, h2, h3, h4, h5, h6, blockquote, li';
    const blocos = Array.from(raiz.querySelectorAll<HTMLElement>(seletor)).filter(
      (el) => range.intersectsNode(el) && el.closest('[contenteditable]') === raiz && !el.querySelector(seletor),
    );
    return blocos.length ? blocos : doCursor ? [doCursor] : [];
  }

  // ------------------------------------------------------------------
  // Linha de assinatura (14/10/2026) — tabela sem borda com estilos inline
  // (sai igual no PDF), nunca partida entre duas folhas.
  // ------------------------------------------------------------------
  protected inserirAssinatura(evento: Event): void {
    const alvo = evento.target as HTMLSelectElement;
    const opcao = alvo.value;
    alvo.value = '';
    if (!opcao || this.areaFocada() !== 'corpo') return;
    this.executarComando(this.area.nativeElement, 'insertHTML', this.htmlAssinaturas(opcao));
    this.agendarRecalculoQuebras();
  }

  private htmlAssinaturas(opcao: string): string {
    const tipo = this.tipo();
    let pessoas: Array<[string, string]>;
    if (opcao === 'testemunhas') {
      pessoas = [['Testemunha 1', 'CPF:'], ['Testemunha 2', 'CPF:']];
    } else if (opcao === '1') {
      pessoas = [['{{empresa_nome}}', tipo === 'proposta' ? 'PROPONENTE' : tipo === 'empreita' ? 'CONTRATANTE' : 'CONTRATADA']];
    } else if (tipo === 'empreita') {
      pessoas = [['{{empresa_nome}}', 'CONTRATANTE'], ['{{empreiteiro}}', 'CONTRATADO']];
    } else if (tipo === 'proposta') {
      pessoas = [['{{cliente}}', 'DE ACORDO — CLIENTE'], ['{{empresa_nome}}', 'PROPONENTE']];
    } else {
      pessoas = [['{{cliente}}', 'CONTRATANTE'], ['{{empresa_nome}}', 'CONTRATADA']];
    }

    // `border:none`/`background` explícitos: o `td`/`table` global do app (`_base.scss`) põe borda
    // e fundo em toda tabela — inclusive aqui e na tela de impressão do PDF.
    const largura = pessoas.length === 1 ? 'width:60%; margin:12mm auto 4mm;' : 'width:100%; margin:12mm 0 4mm;';
    const celulas = pessoas
      .map(
        ([nome, papel]) =>
          `<td style="width:${100 / pessoas.length}%; border:none; padding:0 6mm; vertical-align:top; text-align:center;">` +
          `<div style="border-top:1px solid #333; padding-top:1.5mm;">${nome}</div>` +
          `<div style="font-size:9pt; color:#555;">${papel}</div></td>`,
      )
      .join('');
    return (
      `<table class="bloco-assinaturas" style="${largura} border-collapse:collapse; background:transparent; break-inside:avoid; page-break-inside:avoid;">` +
      `<tbody><tr>${celulas}</tr></tbody></table><p><br></p>`
    );
  }

  // ------------------------------------------------------------------
  // Imagem no documento (14/10/2026, pedido do Lucas: "a imagem é
  // redimensionável"). Vai EMBUTIDA no HTML do modelo (data URL) — é o que
  // funciona igual no corpo, no cabeçalho/rodapé do PDF (que não baixa nada
  // por URL) e no editor. Largura em % da coluna de texto, a mesma no PDF.
  // ------------------------------------------------------------------
  @ViewChild('entradaImagem') private readonly entradaImagem!: ElementRef<HTMLInputElement>;
  private rangeAntesDaImagem: Range | null = null;

  protected escolherImagem(): void {
    const selecao = window.getSelection();
    const raiz = this.elementoDaAreaFocada();
    this.rangeAntesDaImagem =
      selecao?.rangeCount && raiz.contains(selecao.getRangeAt(0).startContainer) ? selecao.getRangeAt(0).cloneRange() : null;
    this.entradaImagem.nativeElement.value = '';
    this.entradaImagem.nativeElement.click();
  }

  protected aoEscolherImagem(evento: Event): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) {
      this.erro.set('Escolha um arquivo de imagem (PNG, JPG, GIF, WebP ou SVG).');
      return;
    }
    prepararImagem(arquivo)
      .then(({ src, larguraPx }) => this.inserirImagem(src, larguraPx))
      .catch(() => this.erro.set('Não foi possível ler essa imagem.'));
  }

  private inserirImagem(src: string, larguraPx: number): void {
    const raiz = this.elementoDaAreaFocada();
    raiz.focus();
    const selecao = window.getSelection();
    if (this.rangeAntesDaImagem && raiz.contains(this.rangeAntesDaImagem.startContainer)) {
      selecao?.removeAllRanges();
      selecao?.addRange(this.rangeAntesDaImagem);
    }
    const estilo = getComputedStyle(raiz);
    const larguraUtil = raiz.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
    const pct = larguraPx > 0 && larguraUtil > 0 ? Math.min(100, Math.max(5, Math.round((larguraPx / larguraUtil) * 100))) : 50;
    document.execCommand('insertHTML', false, `<img src="${src}" alt="" style="width:${pct}%; height:auto;">`);
    raiz.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Moldura com alças desenhada por cima da imagem selecionada (o Chrome não tem alça nativa de redimensionar em `contenteditable`). */
  protected readonly molduraImagem = signal<{ top: number; left: number; width: number; height: number; pct: number } | null>(null);
  private imagemSelecionada: HTMLImageElement | null = null;

  protected aoClicarNaArea(evento: MouseEvent): void {
    const alvo = evento.target as HTMLElement;
    if (alvo instanceof HTMLImageElement && alvo.closest('[contenteditable]')?.getAttribute('contenteditable') === 'true') {
      this.imagemSelecionada = alvo;
      this.reposicionarMolduraImagem();
      return;
    }
    this.limparSelecaoImagem();
    if (alvo.closest('.bloco-tabela-eap')) this.abrirPainelTabela();
  }

  protected aoTeclarNaArea(evento: KeyboardEvent): void {
    const imagem = this.imagemSelecionada;
    if (!imagem) return;
    if (evento.key === 'Delete' || evento.key === 'Backspace') {
      evento.preventDefault();
      this.excluirImagemSelecionada();
    } else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(evento.key)) {
      this.limparSelecaoImagem();
    }
  }

  protected excluirImagemSelecionada(): void {
    const imagem = this.imagemSelecionada;
    if (!imagem) return;
    const raiz = imagem.closest<HTMLElement>('[contenteditable="true"]');
    imagem.remove();
    this.limparSelecaoImagem();
    raiz?.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private limparSelecaoImagem(): void {
    this.imagemSelecionada = null;
    this.molduraImagem.set(null);
  }

  private reposicionarMolduraImagem(): void {
    const imagem = this.imagemSelecionada;
    if (!imagem?.isConnected || !this.paginaEl) {
      this.limparSelecaoImagem();
      return;
    }
    const base = this.paginaEl.nativeElement.getBoundingClientRect();
    const r = imagem.getBoundingClientRect();
    const disponivel = larguraDisponivelPara(imagem);
    this.molduraImagem.set({
      top: r.top - base.top,
      left: r.left - base.left,
      width: r.width,
      height: r.height,
      pct: Math.round(parseFloat(imagem.style.width) || (disponivel ? (r.width / disponivel) * 100 : 100)),
    });
  }

  /** Arrastar uma alça: largura em % da coluna de texto (a altura acompanha, mantendo a proporção). */
  protected iniciarRedimensionarImagem(evento: MouseEvent, lado: 'esquerda' | 'direita'): void {
    evento.preventDefault();
    evento.stopPropagation();
    const imagem = this.imagemSelecionada;
    if (!imagem) return;

    const inicioX = evento.clientX;
    const larguraInicial = imagem.getBoundingClientRect().width;
    const disponivel = larguraDisponivelPara(imagem) || larguraInicial;
    const sinal = lado === 'esquerda' ? -1 : 1;

    const mover = (e: MouseEvent) => {
      const largura = Math.max(16, Math.min(disponivel, larguraInicial + sinal * (e.clientX - inicioX)));
      imagem.style.width = `${Math.round((largura / disponivel) * 1000) / 10}%`;
      imagem.style.height = 'auto';
      this.reposicionarMolduraImagem();
    };
    const soltar = () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      imagem.closest<HTMLElement>('[contenteditable="true"]')?.dispatchEvent(new Event('input', { bubbles: true }));
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  }

  // ------------------------------------------------------------------
  // Tabela da EAP na proposta (14/10/2026, pedido do Lucas: "quero
  // configurar as cores da tabela dentro do modelo") — no lugar de
  // `{{tabela_eap}}` o editor mostra a tabela DE VERDADE (mesma função do
  // PDF, `montarTabelaPropostaEap`) com dados de exemplo, já com as cores/
  // colunas/níveis escolhidos. Ao salvar volta a ser `{{tabela_eap}}`.
  // ------------------------------------------------------------------
  protected readonly painelTabelaAberto = signal(false);

  private htmlPreviaTabela(config: ConfigProposta): string {
    return montarTabelaPropostaEap(linhasExemploPropostaEap(), config, CATEGORIAS_EXEMPLO_PROPOSTA);
  }

  private criarBlocoPreviaTabela(): HTMLElement {
    const bloco = document.createElement('div');
    bloco.className = 'bloco-tabela-eap';
    bloco.contentEditable = 'false';
    bloco.dataset['variavelBloco'] = 'tabela_eap';
    bloco.title = 'Tabela da EAP — prévia com dados de exemplo. Clique para escolher colunas, níveis e cores.';
    bloco.innerHTML =
      '<span class="etiqueta-bloco-variavel">Tabela da EAP · prévia com dados de exemplo</span>' +
      `<div class="conteudo-bloco-variavel">${this.htmlPreviaTabela(this.configProposta())}</div>`;
    return bloco;
  }

  private inserirPreviaTabela(): void {
    const raiz = this.area.nativeElement;
    raiz.focus();
    const selecao = window.getSelection();
    const range = selecao?.rangeCount ? selecao.getRangeAt(0) : null;
    const bloco = range && raiz.contains(range.startContainer) ? this.blocoDireto(range.startContainer) : null;

    const previa = this.criarBlocoPreviaTabela();
    if (bloco && !bloco.classList.contains('quebra-pagina')) {
      if (temConteudoProprio(bloco)) bloco.after(previa);
      else bloco.replaceWith(previa);
    } else {
      raiz.appendChild(previa);
    }
    const depois = document.createElement('p');
    depois.innerHTML = '<br>';
    previa.after(depois);

    const novo = document.createRange();
    novo.setStart(depois, 0);
    novo.collapse(true);
    selecao?.removeAllRanges();
    selecao?.addRange(novo);
    this.agendarRecalculoQuebras();
  }

  /** `<p>{{tabela_eap}}</p>` gravado → bloco de prévia (ao abrir o modelo). */
  private converterMarcadoresEmPrevia(raiz: HTMLElement): void {
    Array.from(raiz.querySelectorAll<HTMLElement>('p, div, h1, h2, h3, h4, h5, h6'))
      .filter((el) => /^\s*\{\{\s*tabela_eap\s*\}\}\s*$/.test(el.textContent ?? '') && !el.querySelector('p, div'))
      .forEach((el) => el.replaceWith(this.criarBlocoPreviaTabela()));
  }

  /** Bloco de prévia → `<p>{{tabela_eap}}</p>` (ao salvar). */
  private converterPreviasEmMarcadores(raiz: HTMLElement): void {
    raiz.querySelectorAll('[data-variavel-bloco="tabela_eap"]').forEach((el) => {
      const marcador = document.createElement('p');
      marcador.textContent = '{{tabela_eap}}';
      el.replaceWith(marcador);
    });
  }

  private readonly efeitoPreviaTabela = effect(() => {
    const config = this.configProposta();
    if (this.tipo() !== 'proposta') return;
    queueMicrotask(() => {
      const area = this.area?.nativeElement;
      if (!area) return;
      area.querySelectorAll('.bloco-tabela-eap .conteudo-bloco-variavel').forEach((el) => {
        el.innerHTML = this.htmlPreviaTabela(config);
      });
      this.agendarRecalculoQuebras();
    });
  });

  protected abrirPainelTabela(): void {
    this.painelPaginaAberto.set(false);
    this.painelEstilosAberto.set(false);
    this.painelTabelaAberto.set(true);
  }

  protected fecharPainelTabela(): void {
    this.painelTabelaAberto.set(false);
  }

  // ------------------------------------------------------------------
  // Colar conteúdo externo (30/09/2026, bug real achado lendo o PDF de
  // verdade) — texto colado do Word/Google Docs carrega `margin-left`/
  // `margin-right` NEGATIVOS (artefato da exportação deles), que empurra
  // o parágrafo pra fora da área imprimível da página — o texto saía
  // CORTADO no PDF final. Intercepta o `paste`, limpa margens negativas
  // (e alguns atributos específicos do Word que não servem pra nada
  // aqui) antes de inserir.
  // ------------------------------------------------------------------
  protected aoColar(evento: ClipboardEvent): void {
    evento.preventDefault();

    // Imagem copiada (print da tela, imagem do navegador) — mesmo caminho do botão "Imagem".
    const arquivoImagem = Array.from(evento.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (arquivoImagem) {
      const selecao = window.getSelection();
      this.rangeAntesDaImagem = selecao?.rangeCount ? selecao.getRangeAt(0).cloneRange() : null;
      prepararImagem(arquivoImagem)
        .then(({ src, larguraPx }) => this.inserirImagem(src, larguraPx))
        .catch(() => this.erro.set('Não foi possível colar essa imagem.'));
      return;
    }

    const html = evento.clipboardData?.getData('text/html');

    if (!html) {
      const texto = evento.clipboardData?.getData('text/plain') ?? '';
      document.execCommand('insertText', false, texto);
      return;
    }

    document.execCommand('insertHTML', false, this.limparHtmlColado(html));
  }

  private limparHtmlColado(html: string): string {
    const raiz = document.createElement('div');
    raiz.innerHTML = html;

    raiz.querySelectorAll<HTMLElement>('*').forEach((el) => {
      (['marginLeft', 'marginRight', 'marginTop', 'marginBottom'] as const).forEach((propriedade) => {
        if (el.style[propriedade]?.trim().startsWith('-')) el.style[propriedade] = '';
      });
      el.removeAttribute('lang');
    });

    return raiz.innerHTML;
  }

  // ------------------------------------------------------------------
  // Estilo aplicado ao bloco atual da área FOCADA — `formatBlock` troca a
  // tag, depois marca o bloco com a classe `.estilo-<id>` (a formatação
  // de verdade vem da `<style>` gerada por `gerarCssEstilos`, não mais
  // copiada como `style` inline — editar o estilo depois atualiza todo
  // texto que usa ele). Prefixo/sufixo de numeração (lista avulsa ou
  // título hierárquico) viram CSS custom properties no próprio bloco.
  // ------------------------------------------------------------------
  protected onMudarEstilo(evento: Event): void {
    const alvo = evento.target as HTMLSelectElement;
    const estilo = this.estilos().find((e) => e.id === alvo.value);
    if (estilo) this.aplicarEstiloAoBloco(estilo);
    alvo.value = '';
  }

  private aplicarEstiloAoBloco(estilo: ContratoEstilo): void {
    const raiz = this.elementoDaAreaFocada();
    raiz.focus();
    document.execCommand('formatBlock', false, estilo.tag_html.toUpperCase());

    const bloco = this.blocoAtualEm(raiz);
    if (!bloco) return;

    bloco.className = bloco.className.replace(/estilo-[\w-]+/g, '').trim();
    bloco.classList.add(`estilo-${estilo.id}`);

    // 30/09/2026: limpa o `style=` inline do bloco e de tudo dentro dele
    // antes de aplicar a classe — achado testando com texto colado do
    // Word de verdade (é exatamente o caso do modelo real do Lucas):
    // colar do Word deixa `style="color:...; font-size:...; ..."` inline
    // em cima do próprio texto, e um `style=` inline tem prioridade sobre
    // QUALQUER regra de classe no CSS, então o vínculo do estilo (a
    // classe `.estilo-<id>`) fica sem efeito nenhum — o texto continua
    // preso na formatação antiga, e editar o estilo depois não muda nada
    // visualmente, mesmo a classe estando certa no HTML. Aplicar um
    // estilo precisa ser a fonte ÚNICA da formatação do bloco.
    bloco.removeAttribute('style');
    bloco.querySelectorAll<HTMLElement>('*').forEach((el) => el.removeAttribute('style'));

    if (estilo.eh_lista || estilo.nivel_titulo) {
      const prefixo = (estilo.lista_prefixo ?? '').trimEnd();
      const escapar = (texto: string) => `"${texto.replace(/"/g, '\\"')}"`;
      bloco.style.setProperty('--lista-prefixo', escapar(prefixo ? `${prefixo} ` : ''));
      bloco.style.setProperty('--lista-sufixo', escapar(estilo.lista_sufixo ?? '.'));
    } else {
      bloco.style.removeProperty('--lista-prefixo');
      bloco.style.removeProperty('--lista-sufixo');
    }
  }

  private blocoAtualEm(raiz: HTMLElement): HTMLElement | null {
    const selecao = window.getSelection();
    if (!selecao || selecao.rangeCount === 0) return null;

    let node: Node | null = selecao.getRangeAt(0).startContainer;
    while (node && node !== raiz) {
      // `.quebra-pagina` é um espaçador não-editável (separação de páginas,
      // ver `recalcularQuebrasPagina`) — nunca deveria receber seleção,
      // mas por segurança não conta como "bloco de texto" se acontecer.
      if (
        node instanceof HTMLElement &&
        /^(P|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|LI|DIV)$/.test(node.tagName) &&
        !node.classList.contains('quebra-pagina')
      ) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  /** Filho DIRETO de `.area-edicao` que contém `node` — usado pelas colunas, que envolvem blocos de nível 1, não a tag exata do cursor. */
  private blocoDireto(node: Node): HTMLElement | null {
    let atual: Node | null = node;
    while (atual && atual.parentNode !== this.area.nativeElement) {
      atual = atual.parentNode;
    }
    return atual instanceof HTMLElement ? atual : null;
  }

  // ------------------------------------------------------------------
  // Colunas — envolve (ou desfaz) os elementos de nível 1 do CORPO que a
  // seleção atual cruza num `<div class="colunas colunas-N">`. Só faz
  // sentido no corpo principal (não em cabeçalho/rodapé, que são só uma
  // faixa estreita). Não usa `execCommand` (não existe comando nativo de
  // colunas); manipulação de DOM direta.
  // ------------------------------------------------------------------
  protected aplicarColunas(n: 1 | 2 | 3): void {
    this.area.nativeElement.focus();
    const container = this.blocoColunasAtual();

    if (n === 1) {
      if (container) this.desfazerColunas(container);
      return;
    }

    if (container) {
      container.className = `colunas colunas-${n}`;
      return;
    }

    const selecao = window.getSelection();
    const raiz = this.area.nativeElement;
    let elementos: HTMLElement[] = [];

    if (selecao && selecao.rangeCount > 0) {
      const range = selecao.getRangeAt(0);
      if (!range.collapsed) {
        elementos = Array.from(raiz.children).filter((el) => range.intersectsNode(el)) as HTMLElement[];
      } else {
        const bloco = this.blocoDireto(range.startContainer);
        if (bloco) elementos = [bloco];
      }
    }

    const div = document.createElement('div');
    div.className = `colunas colunas-${n}`;

    if (elementos.length) {
      raiz.insertBefore(div, elementos[0]);
      elementos.forEach((el) => div.appendChild(el));
    } else {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      div.appendChild(p);
      raiz.appendChild(div);
    }

    const alvoCursor = div.lastElementChild ?? div;
    const novoRange = document.createRange();
    novoRange.selectNodeContents(alvoCursor);
    novoRange.collapse(false);
    selecao?.removeAllRanges();
    selecao?.addRange(novoRange);
  }

  private blocoColunasAtual(): HTMLElement | null {
    let node: Node | null = window.getSelection()?.anchorNode ?? null;
    while (node && node !== this.area.nativeElement) {
      if (node instanceof HTMLElement && node.classList.contains('colunas')) return node;
      node = node.parentNode;
    }
    return null;
  }

  private desfazerColunas(container: HTMLElement): void {
    const pai = container.parentElement;
    if (!pai) return;
    while (container.firstChild) pai.insertBefore(container.firstChild, container);
    pai.removeChild(container);
  }

  // ------------------------------------------------------------------
  // Quebra de página MANUAL (01/10/2026, pedido do Lucas: controlar onde
  // a página quebra, em vez de depender só do cálculo automático de
  // `recalcularQuebrasPagina`). Diferente do `.quebra-pagina` (espaçador
  // AUTOMÁTICO, recalculado do zero sempre e nunca salvo), o
  // `.quebra-manual` É conteúdo de verdade: fica salvo no `conteudo`,
  // força a quebra ali toda vez que a página é recalculada (mesmo
  // sobrando espaço) e, na impressão real, vira `break-before: page`
  // de verdade pro Chromium do PDF (`contrato-imprimir.scss`).
  // ------------------------------------------------------------------
  protected inserirQuebraManual(): void {
    if (this.areaFocada() !== 'corpo') return;
    const area = this.area.nativeElement;
    area.focus();
    const selecao = window.getSelection();
    if (!selecao || selecao.rangeCount === 0) return;
    const range = selecao.getRangeAt(0);

    const marcador = document.createElement('div');
    marcador.className = 'quebra-manual';
    marcador.contentEditable = 'false';
    marcador.setAttribute('data-quebra-manual', 'true');
    marcador.title = 'Quebra de página manual — clique nela e aperte Delete pra remover';
    marcador.textContent = '⤓ Quebra de página';

    const li = this.liDeListaDiretaEm(range.startContainer);

    if (li) {
      // Cursor dentro de um item de lista (`<ol class="lista-clausulas">`
      // etc.) — divide a LISTA (não o `<li>` sozinho). NUNCA divide o
      // TEXTO do `<li>` em dois (ainda que o cursor esteja no meio da
      // frase): o item inteiro vira o primeiro item da continuação —
      // dividir o texto criaria um `<li>` extra, e a numeração nativa do
      // `<ol>` contaria esse pedaço como um item A MAIS (achado testando:
      // "2. Item " na página 1 e "3. dois da lista." na página 2, com o
      // item 3 de verdade virando "4" — bug de numeração, não comportamento
      // esperado). Quebrar sempre na fronteira do item é a aproximação
      // mais simples que não corrompe a numeração.
      const lista = li.parentElement as HTMLElement;
      const indiceCorte = Array.from(lista.children).indexOf(li);

      if (indiceCorte === 0) {
        // cursor no 1º item — a lista inteira vira a continuação, sem precisar clonar nada.
        lista.before(marcador);
      } else {
        const continuacaoLista = document.createElement(lista.tagName) as HTMLElement;
        continuacaoLista.className = lista.className;
        if (lista.tagName === 'OL') {
          const inicioOriginal = parseInt(lista.getAttribute('start') || '1', 10);
          continuacaoLista.setAttribute('start', String(inicioOriginal + indiceCorte));
        }
        Array.from(lista.children)
          .slice(indiceCorte)
          .forEach((item) => continuacaoLista.appendChild(item));

        lista.after(marcador);
        marcador.after(continuacaoLista);
      }
    } else {
      const bloco = this.blocoDireto(range.startContainer);
      if (!bloco) return;
      const continuacao = this.dividirBlocoNoCursor(bloco, range);
      bloco.after(marcador);
      if (continuacao) marcador.after(continuacao);
    }

    const novoRange = document.createRange();
    novoRange.setStartAfter(marcador);
    novoRange.collapse(true);
    selecao.removeAllRanges();
    selecao.addRange(novoRange);

    this.agendarRecalculoQuebras();
  }

  /** `<li>` de uma lista de NÍVEL 1 (filha direta de `.area-edicao`) que contém `node`, ou `null` se `node` não está dentro de nenhuma. */
  private liDeListaDiretaEm(node: Node): HTMLElement | null {
    let atual: Node | null = node;
    let li: HTMLElement | null = null;
    while (atual && atual !== this.area.nativeElement) {
      if (atual instanceof HTMLElement && atual.tagName === 'LI') li = atual;
      if (atual instanceof HTMLElement && (atual.tagName === 'UL' || atual.tagName === 'OL')) {
        return atual.parentElement === this.area.nativeElement ? li : null;
      }
      atual = atual.parentNode;
    }
    return null;
  }

  /**
   * Divide `bloco` em dois no ponto do cursor (`range`, colapsado) —
   * tudo que vem DEPOIS do cursor sai de `bloco` e vai pra um clone vazio
   * dele (mesma tag/classe/estilo), inserido logo em seguida. Devolve a
   * continuação, ou `null` se o cursor já estava bem no fim de `bloco`
   * (nada pra mover — o chamador só precisa inserir o marcador depois).
   */
  private dividirBlocoNoCursor(bloco: HTMLElement, range: Range): HTMLElement | null {
    const fimDoBloco = document.createRange();
    fimDoBloco.selectNodeContents(bloco);
    fimDoBloco.collapse(false);
    if (range.compareBoundaryPoints(Range.END_TO_END, fimDoBloco) === 0) return null;

    const continuacao = bloco.cloneNode(false) as HTMLElement;
    const restante = range.cloneRange();
    restante.setEndAfter(bloco.lastChild ?? bloco);
    continuacao.appendChild(restante.extractContents());
    if (!continuacao.hasChildNodes()) continuacao.appendChild(document.createElement('br'));
    bloco.after(continuacao);
    return continuacao;
  }

  // ------------------------------------------------------------------
  // Painel "Configurações da página".
  // ------------------------------------------------------------------
  protected alternarPainelPagina(): void {
    this.painelPaginaAberto.update((v) => !v);
    // os painéis ocupam o mesmo lugar (lateral direita) — um de cada vez
    if (this.painelPaginaAberto()) {
      this.painelEstilosAberto.set(false);
      this.painelTabelaAberto.set(false);
    }
  }

  protected confirmarPagina(): void {
    this.painelPaginaAberto.set(false);
  }

  protected mudarMargem(campo: 'direita' | 'esquerda' | 'cabecalho' | 'rodape', evento: Event): void {
    const valor = Math.max(0, Number((evento.target as HTMLInputElement).value) || 0);
    (
      {
        direita: this.margemDireita,
        esquerda: this.margemEsquerda,
        cabecalho: this.margemCabecalho,
        rodape: this.margemRodape,
      }[campo]
    ).set(valor);
  }

  protected mudarTamanhoPapel(evento: Event): void {
    this.tamanhoPapel.set((evento.target as HTMLSelectElement).value as TamanhoPapelContrato);
  }

  protected mudarOrientacao(evento: Event): void {
    this.orientacao.set((evento.target as HTMLSelectElement).value as OrientacaoContrato);
  }

  protected mudarTimbradoLargura(evento: Event): void {
    const valor = Math.max(1, Math.min(200, Number((evento.target as HTMLInputElement).value) || 100));
    this.timbradoLarguraPct.set(valor);
  }

  protected mudarTimbradoAltura(evento: Event): void {
    const valor = Math.max(1, Math.min(200, Number((evento.target as HTMLInputElement).value) || 100));
    this.timbradoAlturaPct.set(valor);
  }

  protected alternarTimbradoManterProporcao(): void {
    this.timbradoManterProporcao.update((v) => !v);
  }

  protected mudarTimbradoOpacidade(evento: Event): void {
    const valor = Math.max(0, Math.min(100, Number((evento.target as HTMLInputElement).value) || 0));
    this.timbradoOpacidade.set(valor);
  }

  // ------------------------------------------------------------------
  // Painel "Gerenciar estilos".
  // ------------------------------------------------------------------
  private carregarEstilos(): void {
    this.api.listarContratoEstilos().subscribe({ next: (lista) => this.estilosDaEmpresa.set(lista) });
  }

  /** O CSS dos estilos acompanha a lista do modelo — qualquer mudança nela regera a `<style>` da folha. */
  private readonly efeitoFolhaEstilos = effect(() => {
    this.folhaEstilos.textContent = gerarCssEstilos(this.estilos());
  });

  ngOnDestroy(): void {
    this.folhaEstilos.remove();
    clearTimeout(this.temporizadorQuebras);
  }

  protected alternarPainelEstilos(): void {
    this.painelEstilosAberto.update((v) => !v);
    if (this.painelEstilosAberto()) {
      this.estiloForm.set(estiloFormVazio());
      this.painelPaginaAberto.set(false);
      this.painelTabelaAberto.set(false);
    }
  }

  protected editarEstilo(estilo: ContratoEstilo): void {
    this.estiloForm.set({
      id: estilo.id,
      nome: estilo.nome,
      tag_html: estilo.tag_html,
      fonte: estilo.fonte ?? '',
      tamanho_pt: estilo.tamanho_pt,
      cor: estilo.cor ?? '',
      negrito: estilo.negrito,
      italico: estilo.italico,
      sublinhado: estilo.sublinhado,
      alinhamento: estilo.alinhamento,
      caixa_texto: estilo.caixa_texto,
      modo: estilo.eh_lista ? 'lista' : estilo.nivel_titulo ? 'titulo' : 'normal',
      lista_formato: estilo.lista_formato,
      nivel_titulo: estilo.nivel_titulo ?? 1,
      lista_prefixo: estilo.lista_prefixo ?? '',
      lista_sufixo: estilo.lista_sufixo ?? '.',
    });
  }

  protected novoEstilo(): void {
    this.estiloForm.set(estiloFormVazio());
  }

  protected mudarCampoEstilo<K extends keyof FormEstilo>(campo: K, valor: FormEstilo[K]): void {
    this.estiloForm.update((f) => ({ ...f, [campo]: valor }));
  }

  protected salvarEstilo(): void {
    const form = this.estiloForm();
    const nome = form.nome.trim();
    if (!nome) {
      this.erroEstilo.set('Informe o nome do estilo.');
      return;
    }

    this.erroEstilo.set(null);

    // Só na lista DESTE modelo (15/10/2026) — nada vai pra API aqui; grava
    // junto com o modelo no "Salvar". O `id` entra na classe CSS do bloco
    // (`estilo-<id>`), então uma edição mantém o id e o texto já formatado
    // acompanha.
    const existente = form.id ? this.estilos().find((e) => e.id === form.id) : undefined;
    const estilo: ContratoEstilo = {
      id: form.id ?? crypto.randomUUID(),
      nome,
      tag_html: form.tag_html,
      fonte: form.fonte.trim() || null,
      tamanho_pt: form.tamanho_pt,
      cor: form.cor || null,
      negrito: form.negrito,
      italico: form.italico,
      sublinhado: form.sublinhado,
      alinhamento: form.alinhamento,
      caixa_texto: form.caixa_texto,
      eh_lista: form.modo === 'lista',
      lista_formato: form.lista_formato,
      nivel_titulo: form.modo === 'titulo' ? form.nivel_titulo : null,
      lista_prefixo: form.modo !== 'normal' ? form.lista_prefixo || null : null,
      lista_sufixo: form.modo !== 'normal' ? form.lista_sufixo || null : null,
      padrao: existente?.padrao ?? false,
    };

    const lista = this.estilos();
    this.estilosProprios.set(form.id ? lista.map((e) => (e.id === form.id ? estilo : e)) : [...lista, estilo]);
    this.estiloForm.set(estiloFormVazio());
  }

  protected excluirEstilo(estilo: ContratoEstilo): void {
    if (!confirm(`Excluir o estilo "${estilo.nome}" deste modelo? Textos já formatados com ele perdem a formatação.`)) return;
    this.estilosProprios.set(this.estilos().filter((e) => e.id !== estilo.id));
  }

  // ------------------------------------------------------------------
  // Salvar/cancelar.
  // ------------------------------------------------------------------
  protected salvar(): void {
    const nome = this.nome().trim();
    if (!nome) {
      this.erro.set('Informe o nome do modelo.');
      return;
    }

    // Os `.quebra-pagina` (separação de páginas de verdade, ver
    // `recalcularQuebrasPagina`) nunca vão pro conteúdo salvo — são
    // recalculados do zero sempre que o modelo é reaberto ou impresso,
    // então gravar eles engessaria uma altura de página que pode mudar
    // (troca de papel/orientação/margem depois). Lê de um CLONE, não do
    // DOM ao vivo, pra não mexer na tela enquanto salva.
    const clone = this.area.nativeElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.quebra-pagina').forEach((el) => el.remove());
    this.mesclarListasDivididas(clone);
    this.converterPreviasEmMarcadores(clone);
    const conteudo = clone.innerHTML.trim();
    if (!conteudo) {
      this.erro.set('O contrato está vazio.');
      return;
    }

    this.erro.set(null);
    this.salvando.set(true);
    const dados = {
      tipo: this.tipo(),
      nome,
      conteudo,
      margem_direita_mm: this.margemDireita(),
      margem_esquerda_mm: this.margemEsquerda(),
      margem_cabecalho_mm: this.margemCabecalho(),
      margem_rodape_mm: this.margemRodape(),
      tamanho_papel: this.tamanhoPapel(),
      orientacao: this.orientacao(),
      // Só o `<br>` que o contenteditable deixa depois de apagar tudo não é
      // conteúdo — vai `null`, e o PDF sai com o cabeçalho/rodapé mínimo.
      cabecalho_html: temConteudoProprio(this.areaCabecalho.nativeElement) ? this.areaCabecalho.nativeElement.innerHTML.trim() : null,
      rodape_html: temConteudoProprio(this.areaRodape.nativeElement) ? this.areaRodape.nativeElement.innerHTML.trim() : null,
      timbrado_largura_pct: this.timbradoLarguraPct(),
      timbrado_altura_pct: this.timbradoManterProporcao() ? null : this.timbradoAlturaPct(),
      timbrado_manter_proporcao: this.timbradoManterProporcao(),
      timbrado_opacidade: this.timbradoOpacidade(),
      tag_anexo_id: this.tagAnexoId() || null,
      config_proposta: this.tipo() === 'proposta' ? this.configProposta() : null,
      // Cópia dos estilos DESTE modelo (15/10/2026) — grava sempre, assim o modelo
      // nunca mais depende dos estilos da empresa nem de outro modelo.
      estilos: this.estilos().length ? this.estilos() : null,
    };
    const idAtual = this.contratoModeloId();
    const requisicao = idAtual ? this.api.atualizarContratoModelo(idAtual, dados) : this.api.criarContratoModelo(dados);

    requisicao.subscribe({
      next: (modeloSalvo) => {
        this.salvando.set(false);
        this.salvo.set(true);
        setTimeout(() => this.salvo.set(false), 2500);

        if (!idAtual) {
          this.contratoModeloId.set(modeloSalvo.id);
          this.location.replaceState(`/contrato-modelos/${modeloSalvo.id}`);
        }
      },
      error: () => {
        this.salvando.set(false);
        this.erro.set('Não foi possível salvar o modelo.');
      },
    });
  }

  protected cancelar(): void {
    window.close();
  }
}
