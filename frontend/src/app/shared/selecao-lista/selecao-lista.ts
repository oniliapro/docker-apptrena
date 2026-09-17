import { computed, signal } from '@angular/core';

/**
 * Seleção múltipla por checkbox nas telas de lista (02/09/2026, pedido do
 * Lucas: selecionar vários itens — Mapas, Empreitas, Pagamentos,
 * Recebimentos — pra montar uma mensagem de WhatsApp com o que foi
 * marcado). Guarda só os IDS selecionados; cada tela decide o resto
 * (colunas mostradas, texto da mensagem gerada a partir da seleção).
 *
 * Instanciada uma vez por componente (mesmo padrão de `ResumoEtapas` no
 * Mapa) — não é um serviço `providedIn: 'root'` porque cada tela tem sua
 * própria seleção, independente das outras.
 */
export class SelecaoMultipla<T> {
  constructor(private readonly idDe: (item: T) => string) {}

  private readonly ids = signal<ReadonlySet<string>>(new Set());

  readonly contagem = computed(() => this.ids().size);
  readonly temSelecao = computed(() => this.ids().size > 0);

  estaSelecionado(item: T): boolean {
    return this.ids().has(this.idDe(item));
  }

  alternar(item: T): void {
    const id = this.idDe(item);
    this.ids.update((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  /** Todos os itens da lista ATUAL (já filtrada/ordenada) estão selecionados? — pro checkbox do cabeçalho. */
  todosSelecionados(lista: readonly T[]): boolean {
    return lista.length > 0 && lista.every((item) => this.ids().has(this.idDe(item)));
  }

  /** Marca/desmarca todos os itens da lista atual de uma vez — não mexe em seleções de fora dela (ex.: outra página). */
  alternarTodos(lista: readonly T[]): void {
    const marcarTodos = !this.todosSelecionados(lista);
    this.ids.update((atual) => {
      const novo = new Set(atual);
      for (const item of lista) {
        const id = this.idDe(item);
        if (marcarTodos) novo.add(id);
        else novo.delete(id);
      }
      return novo;
    });
  }

  selecionados(lista: readonly T[]): T[] {
    return lista.filter((item) => this.ids().has(this.idDe(item)));
  }

  limpar(): void {
    this.ids.set(new Set());
  }
}

/**
 * Copia um texto pra área de transferência (02/09/2026) — usado pelo
 * botão "Copiar mensagem" das telas de lista. `navigator.clipboard`
 * exige HTTPS ou `localhost`; se falhar (contexto inseguro, permissão
 * negada), devolve `false` pra tela avisar o usuário em vez de falhar
 * silenciosamente.
 */
export async function copiarParaAreaDeTransferencia(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
