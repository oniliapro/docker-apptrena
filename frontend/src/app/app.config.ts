import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';

import { environment } from '../environments/environment';
import { eapFormulasInterceptor } from './features/eap/eap-formulas-sync';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { cacheOfflineInterceptor } from './core/offline/cache-offline.interceptor';
import { routes } from './app.routes';
import { rotasDoApp } from './app.routes.app';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // App de celular (09/10/2026): só as telas do RDO — ver app.routes.app.ts.
    provideRouter(
      environment.app ? rotasDoApp : routes,
      withComponentInputBinding(),
      // 'always': as abas da obra (rotas filhas de /obras/:id, ex. /obras/:id/eap)
      // herdam o :id do pai como input do componente. Sem isso (padrão
      // 'emptyOnly'), cada aba não recebe o id da obra — era exatamente o
      // que faltava para "obra como contexto" (ver INTEGRACAO.md).
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),
    // cacheOfflineInterceptor só age no app; fica antes do authInterceptor
    // para também pegar o tempo-limite dele (ver o arquivo).
    provideHttpClient(withInterceptors([cacheOfflineInterceptor, authInterceptor, eapFormulasInterceptor])),
  ],
};
