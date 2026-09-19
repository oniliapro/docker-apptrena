import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Esc fecha o popup que está no TOPO (19/09/2026, pedido dos usuários:
 * popups não fecham mais ao clicar fora; em troca, Esc e o botão ✖ fecham).
 *
 * Como funciona: cada popup tem um elemento de fundo (`.modal-fundo`, ou
 * `.popup-fundo` no RDO) que escuta o evento DOM `fecharModal` no lugar do
 * antigo `(click)`. Este serviço tem UM listener de teclado no documento;
 * ao apertar Esc, acha o fundo do popup mais alto na tela e dispara nele o
 * `fecharModal` — o mesmo método `fechar…()` que o botão ✖ já chama. Não
 * exige registrar nem desregistrar nada em cada popup: popup aberto tem
 * fundo no DOM, popup fechado não tem (todos são `@if`).
 *
 * "Mais alto" = maior `z-index` efetivo (200 nos popups normais, 210 nos
 * popups internos de Configurações); em empate, o que vem depois no DOM
 * (popup aninhado é sempre renderizado depois do pai).
 *
 * Quem quiser tratar o Esc por conta própria (ex.: fechar uma lista
 * suspensa antes do popup) chama `preventDefault()` ou `stopPropagation()`
 * no próprio elemento — o evento chega aqui só depois (fase de bubbling) e
 * `defaultPrevented` faz o serviço ignorar.
 *
 * Quando fecha um popup, também interrompe a propagação: o `AppShell` fecha
 * menus com Esc e não deve fechar o menu junto com o popup.
 */
@Injectable({ providedIn: 'root' })
export class ModalEscService {
  private readonly documento = inject(DOCUMENT);

  constructor() {
    this.documento.addEventListener('keydown', (evento) => this.aoApertarTecla(evento));
  }

  private aoApertarTecla(evento: KeyboardEvent): void {
    if (evento.key !== 'Escape' || evento.defaultPrevented) return;

    const fundo = this.fundoDoPopupDoTopo();
    if (!fundo) return;

    evento.preventDefault();
    evento.stopImmediatePropagation();
    fundo.dispatchEvent(new CustomEvent('fecharModal'));
  }

  private fundoDoPopupDoTopo(): HTMLElement | null {
    const fundos = Array.from(
      this.documento.querySelectorAll<HTMLElement>('.modal-fundo, .popup-fundo'),
    );
    let topo: HTMLElement | null = null;
    let zTopo = Number.NEGATIVE_INFINITY;

    for (const fundo of fundos) {
      const z = this.zIndexEfetivo(fundo);
      if (z >= zTopo) {
        topo = fundo;
        zTopo = z;
      }
    }
    return topo;
  }

  /** Sobe pelos ancestrais até achar um `z-index` numérico (o do contêiner `position: fixed`). */
  private zIndexEfetivo(elemento: HTMLElement): number {
    const janela = this.documento.defaultView;
    let atual: HTMLElement | null = elemento;
    while (atual && janela) {
      const z = Number(janela.getComputedStyle(atual).zIndex);
      if (Number.isFinite(z)) return z;
      atual = atual.parentElement;
    }
    return 0;
  }
}
