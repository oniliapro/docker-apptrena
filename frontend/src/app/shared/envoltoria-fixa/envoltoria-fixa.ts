/**
 * 27/09/2026, pedido do Lucas ("fixar cabeçalhos de listas e tabelas"):
 * `.envoltoria-fixa` (ver `_base.scss`) precisa de um `max-height` que caiba
 * exatamente no que sobra da janela abaixo de tudo que vem antes dela
 * (título, barra de ferramentas, filtros — a altura disso varia de tela pra
 * tela, e até dentro da mesma tela quando os filtros quebram linha). Até
 * aqui só a Empreita resolvia isso, marcando uma faixa própria
 * (`trenaBarraFixa`) bem em cima da tabela pra medir.
 *
 * Em vez de repetir essa marcação em ~20 telas diferentes (cada uma exigindo
 * mexer no `.ts` do componente pra importar uma diretiva), isto roda uma vez
 * só, iniciado pelo `AppShell` (raiz de toda tela autenticada): observa o
 * documento inteiro por qualquer `.envoltoria-fixa` que apareça (troca de
 * rota, popup, filtro escondendo/mostrando linhas) e ajusta o `max-height`
 * de cada um por conta própria, pela posição real dele na tela — nenhuma
 * tela precisa saber que isto existe.
 */
export class ObservadorEnvoltoriaFixa {
  private readonly conhecidos = new WeakSet<HTMLElement>();
  private readonly observadorMutacao: MutationObserver;
  private readonly observadorResize: ResizeObserver | null;

  constructor() {
    this.varrer();

    this.observadorMutacao = new MutationObserver(() => this.varrer());
    this.observadorMutacao.observe(document.body, { childList: true, subtree: true });

    if (typeof ResizeObserver !== 'undefined') {
      this.observadorResize = new ResizeObserver(() => this.reajustarTodos());
      this.observadorResize.observe(document.documentElement);
    } else {
      this.observadorResize = null;
      window.addEventListener('resize', () => this.reajustarTodos());
    }
  }

  destruir(): void {
    this.observadorMutacao.disconnect();
    this.observadorResize?.disconnect();
  }

  private varrer(): void {
    document.querySelectorAll<HTMLElement>('.envoltoria-fixa').forEach((el) => {
      if (this.conhecidos.has(el)) return;
      this.conhecidos.add(el);
      this.ajustar(el);
    });
  }

  private reajustarTodos(): void {
    document.querySelectorAll<HTMLElement>('.envoltoria-fixa').forEach((el) => this.ajustar(el));
  }

  private ajustar(el: HTMLElement): void {
    // Zera antes de medir: a altura antiga do próprio elemento não pode
    // influenciar a nova medição da posição dele na tela.
    el.style.maxHeight = '';
    requestAnimationFrame(() => {
      const topo = el.getBoundingClientRect().top;
      el.style.maxHeight = `calc(100vh - ${Math.ceil(topo)}px - 12px)`;
    });
  }
}
