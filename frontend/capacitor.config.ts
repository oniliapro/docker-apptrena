import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App ComTrena para Android (e, no futuro, iOS) via Capacitor — 09/10/2026.
 *
 * O app é o MESMO frontend Angular deste projeto, empacotado dentro de um
 * aplicativo nativo. Ele fala com a mesma API de produção.
 *
 * `appId` é a identidade única do app nas lojas (Play Store e App Store):
 * o domínio do site ao contrário + "app". NÃO PODE MUDAR depois da
 * primeira publicação — trocar o appId cria outro app, sem os usuários e
 * avaliações do anterior. O nome que aparece embaixo do ícone (`appName`)
 * pode mudar à vontade.
 *
 * `webDir` é onde `npm run build:mobile` deixa o site pronto
 * (configuração `mobile` do angular.json, pasta separada da do site para
 * não misturar com o build que vai pro VPS). O `npx cap sync` copia de lá
 * para dentro do projeto Android (`android/`).
 */
const config: CapacitorConfig = {
  appId: 'br.com.comtrena.app',
  appName: 'ComTrena',
  webDir: 'dist/mobile/browser',
};

export default config;
