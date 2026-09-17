import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';

import { authInterceptor } from './core/interceptors/auth.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // 'always': as abas da obra (rotas filhas de /obras/:id, ex. /obras/:id/eap)
      // herdam o :id do pai como input do componente. Sem isso (padrão
      // 'emptyOnly'), cada aba não recebe o id da obra — era exatamente o
      // que faltava para "obra como contexto" (ver INTEGRACAO.md).
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
