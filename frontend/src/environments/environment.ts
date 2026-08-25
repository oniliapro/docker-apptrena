export const environment = {
  producao: false,
  /** Build publicado só para revisão visual, sem backend. */
  revisao: false,

  /**
   * API do Controle de Obra.
   *
   * O backend roda em Docker, nesta mesma pasta (`docker-apptrena`), com
   * o nginx do container exposto em 127.0.0.1:8088 — ver `nginx` em
   * `docker-compose.yml` (`"127.0.0.1:8088:80"`). Esta constante já
   * apontou pra 8188 (herdado de uma pasta antiga, `D:\projetos\apptrena`,
   * que não é mais onde o projeto mora — ver CLAUDE.md), o que fazia
   * qualquer chamada de API falhar direto, sem chegar no backend: login
   * "não funcionava" com nenhuma senha porque a porta simplesmente não
   * tinha nada escutando (22/08/2026, corrigido depois do Lucas reportar
   * que nem a senha certa logava localmente).
   *
   * Para subir: `docker-compose --project-name controleobra up -d`
   * dentro desta pasta.
   */
  apiUrl: 'http://localhost:8088/api',
};
