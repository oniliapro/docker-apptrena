import { AfterViewInit, Directive, DoCheck, ElementRef, OnDestroy, inject } from '@angular/core';

/**
 * Faz um `<textarea>` crescer em altura pra sempre mostrar o texto inteiro,
 * em vez de cortar com reticências — pedido do Lucas (16/08/2026) pro
 * campo de Descrição da EAP, que antes era um `<input>` de uma linha só.
 *
 * Uso:
 * ```html
 * <textarea trenaAutoAltura rows="1" [value]="texto" (input)="..."></textarea>
 * ```
 *
 * Reajusta em três situações:
 *
 *  - **Digitação** — `(input)`, imediato.
 *  - **Valor mudando por fora** — carga inicial, ou o componente atualizando
 *    `.value` — comparado a cada ciclo de detecção de mudanças (`ngDoCheck`),
 *    sem precisar de `@Input()`/`ngOnChanges` (o valor é lido direto do DOM).
 *  - **Coluna sendo redimensionada** (16/08/2026) — a largura do textarea
 *    muda (ele é `width: 100%` da célula), o texto quebra diferente, e a
 *    altura precisa acompanhar. `ngDoCheck` sozinho não pega isso, porque
 *    o `.value` não mudou — só a largura renderizada. Por isso um
 *    `ResizeObserver` observa a própria largura do elemento e reajusta
 *    quando ela muda (ignorando as mudanças de altura que a própria
 *    diretiva causa, senão viraria um loop).
 */
@Directive({
  selector: 'textarea[trenaAutoAltura]',
  host: {
    '(input)': 'ajustar()',
  },
})
export class AutoAlturaTextarea implements AfterViewInit, DoCheck, OnDestroy {
  private readonly elemento = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;
  private ultimoValor: string | null = null;
  private ultimaLargura = 0;
  private observador?: ResizeObserver;

  ngAfterViewInit(): void {
    this.ultimaLargura = this.elemento.clientWidth;
    this.ajustar();

    this.observador = new ResizeObserver(() => {
      const larguraAtual = this.elemento.clientWidth;
      if (larguraAtual === this.ultimaLargura) return;
      this.ultimaLargura = larguraAtual;
      this.ajustar();
    });
    this.observador.observe(this.elemento);
  }

  ngDoCheck(): void {
    if (this.elemento.value !== this.ultimoValor) this.ajustar();
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
  }

  protected ajustar(): void {
    this.ultimoValor = this.elemento.value;
    // Zera antes de medir: do contrário `scrollHeight` nunca encolhe (fica
    // preso na maior altura já alcançada) quando o texto diminui — seja
    // porque foi editado, seja porque a coluna alargou e agora quebra em
    // menos linhas.
    this.elemento.style.height = 'auto';
    this.elemento.style.height = `${this.elemento.scrollHeight}px`;
  }
}
