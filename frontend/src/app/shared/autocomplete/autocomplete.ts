import { Component, ElementRef, computed, effect, input, model, output, signal, viewChild } from '@angular/core';

export interface OpcaoAutocomplete {
  /** Valor guardado (o `id` da etapa, por exemplo). Em `modo="livre"` com só rótulos, repita o rótulo. */
  id: string;
  /** Texto mostrado e pesquisado. */
  rotulo: string;
}

/** Sem acento e sem maiúscula, pra "eletrica" achar "Elétrica". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Campo de texto com busca relacionada (19/09/2026, pedido dos usuários):
 * digita e a lista filtra; ↑/↓ navegam, Enter escolhe, Esc fecha a lista.
 *
 * Dois modos:
 *  - `restrito` — só aceita uma das opções (ex.: etapa da EAP da obra). O
 *    valor guardado é o `id` da opção; se o texto digitado não bater com
 *    nenhuma opção, ao sair do campo volta ao que estava. Campo vazio é
 *    aceito (= sem etapa).
 *  - `livre` — sugere as opções, mas aceita qualquer texto (ex.: fornecedor
 *    de um pagamento avulso). O valor guardado é o texto.
 *
 * A lista é `position: fixed` (calculada pelo retângulo do campo) pra não
 * ser cortada pelo `overflow` das tabelas e popups onde o campo mora.
 *
 * O Esc com a lista aberta só fecha a lista: `preventDefault()` faz o
 * `ModalEscService` ignorar o evento, senão o popup inteiro fecharia junto.
 */
@Component({
  selector: 'app-autocomplete',
  templateUrl: './autocomplete.html',
  styleUrl: './autocomplete.scss',
})
export class Autocomplete {
  readonly opcoes = input.required<OpcaoAutocomplete[]>();
  readonly modo = input<'restrito' | 'livre'>('livre');
  readonly placeholder = input('');
  readonly desabilitado = input(false);
  readonly mensagemVazia = input('Nenhuma opção encontrada');

  /** `id` da opção escolhida (modo restrito) ou o texto digitado (modo livre). */
  readonly valor = model('');
  /** Dispara ao confirmar uma escolha (opção clicada/Enter, texto livre ou campo limpo). */
  readonly confirmou = output<OpcaoAutocomplete | null>();

  private readonly campo = viewChild.required<ElementRef<HTMLInputElement>>('campo');

  protected readonly texto = signal('');
  protected readonly aberto = signal(false);
  protected readonly indiceAtivo = signal(0);
  protected readonly posicao = signal<{ top: number; left: number; largura: number; maxAltura: number } | null>(null);
  /** Só filtra depois que o usuário digita — ao abrir com o valor já escolhido, mostra tudo. */
  private readonly filtrando = signal(false);
  private focado = false;

  protected readonly filtradas = computed(() => {
    const todas = this.opcoes();
    if (!this.filtrando()) return todas;
    const termo = normalizar(this.texto());
    return termo ? todas.filter((op) => normalizar(op.rotulo).includes(termo)) : todas;
  });

  constructor() {
    // Mantém o texto do campo em sincronia com o valor de fora (carregamento,
    // troca de linha, opções que chegam depois) — exceto enquanto digita.
    effect(() => {
      const valor = this.valor();
      const opcoes = this.opcoes();
      if (this.focado) return;
      this.texto.set(this.rotuloDe(valor, opcoes));
    });
  }

  private rotuloDe(valor: string, opcoes: OpcaoAutocomplete[]): string {
    const achada = opcoes.find((op) => op.id === valor);
    if (achada) return achada.rotulo;
    return this.modo() === 'livre' ? valor : '';
  }

  protected aoFocar(): void {
    this.focado = true;
    this.filtrando.set(false);
    this.abrir();
  }

  protected aoDigitar(evento: Event): void {
    this.texto.set((evento.target as HTMLInputElement).value);
    this.filtrando.set(true);
    this.indiceAtivo.set(0);
    this.abrir();
  }

  protected aoSairDoCampo(): void {
    this.focado = false;
    this.fechar();
    this.confirmarTexto();
  }

  protected aoTeclar(evento: KeyboardEvent): void {
    const lista = this.filtradas();

    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        if (!this.aberto()) this.abrir();
        else this.indiceAtivo.update((i) => Math.min(i + 1, Math.max(lista.length - 1, 0)));
        break;
      case 'ArrowUp':
        evento.preventDefault();
        this.indiceAtivo.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        if (this.aberto() && lista[this.indiceAtivo()]) {
          evento.preventDefault();
          this.escolher(lista[this.indiceAtivo()]);
        }
        break;
      case 'Escape':
        if (this.aberto()) {
          evento.preventDefault();
          evento.stopPropagation();
          this.fechar();
        }
        break;
    }
  }

  /** `mousedown` (não `click`): roda antes do `blur` do campo, senão a lista sumiria antes de escolher. */
  protected escolher(opcao: OpcaoAutocomplete, evento?: Event): void {
    evento?.preventDefault();
    this.texto.set(opcao.rotulo);
    this.valor.set(this.modo() === 'livre' ? opcao.rotulo : opcao.id);
    this.confirmou.emit(opcao);
    this.filtrando.set(false);
    this.fechar();
  }

  private confirmarTexto(): void {
    const texto = this.texto().trim();
    const opcoes = this.opcoes();

    if (this.modo() === 'livre') {
      if (texto !== this.valor()) {
        this.valor.set(texto);
        this.confirmou.emit(opcoes.find((op) => normalizar(op.rotulo) === normalizar(texto)) ?? null);
      }
      return;
    }

    // Restrito: campo vazio limpa; texto que bate com uma opção escolhe; o resto volta ao anterior.
    if (!texto) {
      if (this.valor()) {
        this.valor.set('');
        this.confirmou.emit(null);
      }
      return;
    }
    const exata = opcoes.find((op) => normalizar(op.rotulo) === normalizar(texto));
    if (exata) {
      this.texto.set(exata.rotulo);
      if (exata.id !== this.valor()) {
        this.valor.set(exata.id);
        this.confirmou.emit(exata);
      }
      return;
    }
    this.texto.set(this.rotuloDe(this.valor(), opcoes));
  }

  private abrir(): void {
    if (this.desabilitado()) return;
    const retangulo = this.campo().nativeElement.getBoundingClientRect();
    const abaixo = window.innerHeight - retangulo.bottom - 8;
    const acima = retangulo.top - 8;
    const emCima = abaixo < 160 && acima > abaixo;

    // Um ancestral com `transform` (o cartão dos popups, centralizado com translate)
    // vira o "bloco de contenção" do `position: fixed`: as coordenadas passam a
    // ser relativas a ele, não à janela — desconta a origem dele.
    const origem = this.origemDoBlocoFixo();

    this.posicao.set({
      top: (emCima ? Math.max(retangulo.top - Math.min(acima, 240) - 2, 4) : retangulo.bottom + 2) - origem.top,
      left: retangulo.left - origem.left,
      largura: Math.max(retangulo.width, 220),
      maxAltura: Math.min(emCima ? acima : abaixo, 240),
    });
    this.aberto.set(true);
  }

  private origemDoBlocoFixo(): { top: number; left: number } {
    for (let pai = this.campo().nativeElement.parentElement; pai; pai = pai.parentElement) {
      const estilo = getComputedStyle(pai);
      if (estilo.transform !== 'none' || estilo.filter !== 'none' || estilo.perspective !== 'none') {
        const retangulo = pai.getBoundingClientRect();
        return { top: retangulo.top, left: retangulo.left };
      }
    }
    return { top: 0, left: 0 };
  }

  private fechar(): void {
    this.aberto.set(false);
  }
}
