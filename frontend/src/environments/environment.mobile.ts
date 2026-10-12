/**
 * Ambiente do APP (Android/iOS via Capacitor) — 09/10/2026.
 *
 * Igual ao de produção, com UMA diferença: `apiUrl` é o endereço
 * COMPLETO da API.
 *
 * No site, as telas e a API moram no mesmo domínio, então '/api' basta
 * (o navegador completa com o domínio da página). No app, as telas ficam
 * guardadas dentro do celular e abrem num endereço interno
 * (`https://localhost` no Android, `capacitor://localhost` no iOS) —
 * '/api' apontaria para o próprio aparelho, onde não existe API.
 *
 * Duas consequências:
 * - A API precisa liberar essas origens no CORS: `CORS_ALLOWED_ORIGINS`
 *   no `controleobra-api/.env` de PRODUÇÃO (no VPS) tem que incluir
 *   `https://localhost,capacitor://localhost`. Sem isso o login do app
 *   falha com erro de CORS (conferido em 09/10/2026: hoje a API só libera
 *   `https://trenadigital.com.br`).
 * - Quando o sistema migrar para comtrena.com.br, trocar o endereço aqui
 *   E manter o domínio antigo respondendo a API até todo mundo atualizar o
 *   app — cada versão instalada continua chamando o endereço com que foi
 *   gerada. Redirecionamento (301) não serve: quebra os POSTs.
 */
export const environment = {
  producao: true,
  revisao: false,
  /**
   * Liga o modo app (09/10/2026): só as telas do RDO, barra própria do
   * celular, consultas guardadas para uso sem internet e fila de envio do
   * RDO — ver `app.routes.app.ts` e `core/offline/`.
   */
  app: true,
  apiUrl: 'https://comtrena.com.br/api',
};
