export const environment = {
  producao: true,
  revisao: false,

  /**
   * Em produção o frontend e a API ficam no mesmo domínio
   * (trenadigital.com.br), com o nginx do servidor repassando /api para
   * o container. Caminho relativo evita problema de CORS e funciona
   * igual em http e https.
   */
  apiUrl: '/api',
};
