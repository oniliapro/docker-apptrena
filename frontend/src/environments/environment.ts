export const environment = {
  producao: false,
  /** Build publicado só para revisão visual, sem backend. */
  revisao: false,

  /**
   * API do Controle de Obra.
   *
   * O backend roda em Docker (`D:\projetos\apptrena`), com o nginx do
   * container exposto em 127.0.0.1:8188 (não 8088 — porta remapeada
   * porque o projeto ImigraParaguai já usa 8088/3306/8084/4200/9000
   * nesta máquina; ver docs/CONTEXTO.md).
   *
   * Para subir: `docker-compose --project-name controleobra up -d`
   * dentro daquela pasta.
   */
  apiUrl: 'http://localhost:8188/api',
};
