import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Faixa que fica fixa sob a barra de topo enquanto a página rola (19/09/2026,
 * pedido dos usuários: botões, totais e cabeçalho da tabela sempre visíveis
 * nas telas de Empreita).
 *
 * A faixa (botões + barra de totais, no mesmo bloco) ganha `position: sticky`
 * pela classe `.barra-fixa` (`_base.scss`). Como a altura dela muda (a barra
 * de totais aparece/some, os botões quebram linha em tela estreita), a
 * diretiva mede com `ResizeObserver` e publica em `--barra-fixa-fim` a
 * distância do topo da janela até o FIM da faixa — é ali que o cabeçalho da
 * tabela (`table.cabecalho-fixo`) gruda, logo abaixo dela.
 *
 * Só há uma faixa fixa por tela; ao sair da tela a variável é removida.
 */
@Directive({
  selector: '[trenaBarraFixa]',
  host: { class: 'barra-fixa' },
})
export class BarraFixa implements OnInit, OnDestroy {
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly raiz = inject(DOCUMENT).documentElement;
  private observador: ResizeObserver | null = null;

  ngOnInit(): void {
    this.publicar();
    if (typeof ResizeObserver === 'undefined') return;
    this.observador = new ResizeObserver(() => this.publicar());
    this.observador.observe(this.elemento.nativeElement);
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
    this.raiz.style.removeProperty('--barra-fixa-fim');
  }

  private publicar(): void {
    const alturaTopo = parseFloat(getComputedStyle(this.raiz).getPropertyValue('--barra-topo-altura')) || 48;
    const altura = this.elemento.nativeElement.getBoundingClientRect().height;
    this.raiz.style.setProperty('--barra-fixa-fim', `${Math.ceil(alturaTopo + altura)}px`);
  }
}
