import { computed, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';

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

  /** Marca ou desmarca exatamente estes itens (ex.: um grupo da EAP e todos os filhos dele). */
  definir(itens: readonly T[], marcado: boolean): void {
    this.ids.update((atual) => {
      const novo = new Set(atual);
      for (const item of itens) {
        const id = this.idDe(item);
        if (marcado) novo.add(id);
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

/**
 * Confirmação ÚNICA de exclusão em lote (20/09/2026): "Excluir N itens?".
 * `tipoUm`/`tipoVarios` são o substantivo no singular/plural
 * ("cliente"/"clientes"); `nomes` lista o que será apagado (até 8, depois
 * "e mais N"); `aviso` é uma frase extra opcional (ex.: "prefira
 * desativar"). Devolve `true` se a pessoa confirmou.
 */
export function confirmarExclusaoEmLote(
  quantidade: number,
  tipoUm = 'item',
  tipoVarios = 'itens',
  aviso = '',
  nomes: readonly string[] = [],
): boolean {
  const alvo = quantidade === 1 ? `1 ${tipoUm}` : `${quantidade} ${tipoVarios}`;
  let texto = `Excluir ${alvo} definitivamente?`;

  if (nomes.length > 1) {
    const mostrados = nomes.slice(0, 8).map((nome) => `• ${nome || '(sem nome)'}`);
    if (nomes.length > 8) mostrados.push(`… e mais ${nomes.length - 8}`);
    texto += '\n\n' + mostrados.join('\n');
  }
  if (aviso) texto += '\n\n' + aviso;
  return window.confirm(texto);
}

/**
 * Executa uma operação sobre vários itens, UMA chamada por item, todas em
 * paralelo (excluir, confirmar…). Uma falha não cancela as outras: devolve o
 * que deu certo (com o resultado de cada chamada) e o que falhou, e a tela
 * decide o que mostrar (normalmente, atualiza a lista e avisa das falhas com
 * `avisarFalhasDeExclusao`).
 */
export function processarEmLote<T, R>(
  alvos: readonly T[],
  operacao: (item: T) => Observable<R>,
): Observable<{ sucessos: { item: T; resultado: R }[]; falhas: T[] }> {
  if (!alvos.length) return of({ sucessos: [], falhas: [] });
  return forkJoin(
    alvos.map((item) =>
      operacao(item).pipe(
        map((resultado) => ({ item, resultado, ok: true as const })),
        catchError(() => of({ item, ok: false as const })),
      ),
    ),
  ).pipe(
    map((resultados) => ({
      sucessos: resultados.flatMap((r) => (r.ok ? [{ item: r.item, resultado: r.resultado }] : [])),
      falhas: resultados.filter((r) => !r.ok).map((r) => r.item),
    })),
  );
}

/** Exclusão em lote: `processarEmLote` devolvendo só quais itens foram excluídos e quais falharam. */
export function excluirEmLote<T>(
  alvos: readonly T[],
  excluir: (item: T) => Observable<unknown>,
): Observable<{ excluidos: T[]; falhas: T[] }> {
  return processarEmLote(alvos, excluir).pipe(
    map(({ sucessos, falhas }) => ({ excluidos: sucessos.map((s) => s.item), falhas })),
  );
}

/** Avisa, se houver, as exclusões que falharam (`nome` diz como chamar cada item). */
export function avisarFalhasDeExclusao<T>(
  falhas: readonly T[],
  tipo: string,
  nome: (item: T) => string,
  verbo = 'excluir',
): void {
  if (!falhas.length) return;
  window.alert(`Não foi possível ${verbo} ${falhas.length} ${tipo}: ${falhas.map(nome).join(', ')}.`);
}
