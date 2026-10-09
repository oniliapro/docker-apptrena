/**
 * Ambiente de REVISÃO — build publicado para o Lucas avaliar as telas
 * antes de o backend existir.
 *
 * `producao: false` é intencional e não é engano: é o que mantém o botão
 * "Entrar sem servidor" disponível. Sem ele, e sem API no ar, ninguém
 * conseguiria passar da tela de login — o build seria inútil para o que
 * ele serve.
 *
 * **Não usar este arquivo no build definitivo.** Quando a API estiver
 * de pé, publique com `environment.prod.ts`, que fecha o acesso de
 * demonstração.
 */
export const environment = {
  producao: false,
  revisao: true,
  app: false,
  apiUrl: '/api',
};
