/**
 * Endereço completo de uma tela do sistema, respeitando onde o Angular está
 * publicado (15/10/2026).
 *
 * Em produção o app é servido sob `/app/` (build com `--base-href /app/`),
 * enquanto no desenvolvimento ele vive na raiz. Montar o link com
 * `window.location.origin + '/publico/...'` ignorava esse prefixo e mandava
 * quem abrisse o link para a raiz do domínio — que não é o app. O `<base
 * href>` do documento já carrega o prefixo certo nos dois ambientes.
 */
export function urlDoApp(caminho: string): string {
  const relativo = caminho.replace(/^\/+/, '');
  try {
    return new URL(relativo, document.baseURI).toString();
  } catch {
    return `${window.location.origin}/${relativo}`;
  }
}
