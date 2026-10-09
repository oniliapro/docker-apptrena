/**
 * Banco local do celular (IndexedDB) — app ComTrena, 09/10/2026.
 *
 * Guarda duas coisas, só no app (no site não é usado):
 * - `cache`: a última resposta de cada consulta à API (obras, permissões,
 *   preparo do RDO, EAP, lista de RDOs...), para as telas abrirem sem
 *   internet — ver `cache-offline.interceptor.ts`;
 * - `fila_rdo`: os RDOs lançados no celular que ainda não chegaram ao
 *   servidor, com as fotos e os vídeos — ver `rdo-fila.service.ts`.
 *
 * IndexedDB e não localStorage porque o localStorage só guarda texto e tem
 * limite de ~5 MB; aqui vão fotos e vídeos inteiros (Blob).
 */
const NOME_BANCO = 'comtrena-offline';
const VERSAO_BANCO = 1;

export const LOJA_CACHE = 'cache';
export const LOJA_FILA_RDO = 'fila_rdo';

let conexao: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (!conexao) {
    conexao = new Promise<IDBDatabase>((resolve, reject) => {
      const pedido = indexedDB.open(NOME_BANCO, VERSAO_BANCO);
      pedido.onupgradeneeded = () => {
        const banco = pedido.result;
        if (!banco.objectStoreNames.contains(LOJA_CACHE)) banco.createObjectStore(LOJA_CACHE);
        if (!banco.objectStoreNames.contains(LOJA_FILA_RDO)) banco.createObjectStore(LOJA_FILA_RDO, { keyPath: 'id' });
      };
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => {
        conexao = null;
        reject(pedido.error);
      };
    });
  }

  return conexao;
}

function executar<T>(loja: string, modo: IDBTransactionMode, acao: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (banco) =>
      new Promise<T>((resolve, reject) => {
        const transacao = banco.transaction(loja, modo);
        const pedido = acao(transacao.objectStore(loja));
        transacao.oncomplete = () => resolve(pedido.result);
        transacao.onerror = () => reject(transacao.error ?? pedido.error);
        transacao.onabort = () => reject(transacao.error ?? pedido.error);
      }),
  );
}

export const bancoLocal = {
  ler<T>(loja: string, chave: IDBValidKey): Promise<T | undefined> {
    return executar<T | undefined>(loja, 'readonly', (s) => s.get(chave) as IDBRequest<T | undefined>);
  },

  /** `chave` só para lojas sem keyPath (o cache); a fila usa o próprio `id` do item. */
  gravar(loja: string, valor: unknown, chave?: IDBValidKey): Promise<IDBValidKey> {
    return executar(loja, 'readwrite', (s) => (chave === undefined ? s.put(valor) : s.put(valor, chave)));
  },

  apagar(loja: string, chave: IDBValidKey): Promise<undefined> {
    return executar(loja, 'readwrite', (s) => s.delete(chave));
  },

  listar<T>(loja: string): Promise<T[]> {
    return executar<T[]>(loja, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
  },
};
