export const environment = {
  producao: false,
  /** Build publicado só para revisão visual, sem backend. */
  revisao: false,

  /**
   * API do Controle de Obra.
   *
   * O backend roda em Docker (`AppTrena/backend-docker`, dentro de
   * Projetos), com o nginx do container exposto em 127.0.0.1:8088 — a
   * mesma porta que o app vanilla já usava.
   *
   * Para subir: `docker-compose --project-name controleobra up -d`
   * dentro daquela pasta, pelo WSL.
   */
  apiUrl: 'http://localhost:8088/api',
};
