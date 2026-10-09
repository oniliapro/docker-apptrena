import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { permissaoModuloGuard } from './core/guards/permissao-modulo.guard';
import { permissaoObraGuard } from './core/guards/permissao-obra.guard';
import { AppMovel, AppMovelInicio } from './layout/app-movel/app-movel';

/**
 * Rotas do APP de celular (09/10/2026) — usadas no lugar de `app.routes.ts`
 * quando `environment.app` está ligado (ver `app.config.ts`). O site não
 * muda nada.
 *
 * Primeira versão do app = só o RDO (decisão do Lucas). As URLs do RDO são
 * as MESMAS do site (`/obras/:id/rdo/...`), só que sem a tela da obra
 * (`ObraDetalhe`, pensada para o computador) por fora: o editor e a lista
 * abrem direto dentro da casca do celular (`AppMovel`).
 */
const carregarLista = () => import('./features/rdo/rdo-lista').then((m) => m.RdoLista);
const carregarEditor = () => import('./features/rdo/rdo').then((m) => m.Rdo);

export const rotasDoApp: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: '',
    component: AppMovel,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
      // Os guards de permissão mandam para '/inicio' quando falta acesso —
      // aqui é uma tela de aviso, não um redirecionamento (evita laço).
      { path: 'inicio', component: AppMovelInicio },
      {
        path: 'rdo',
        canActivate: [permissaoModuloGuard('diario_obra')],
        loadComponent: carregarLista,
      },
      {
        path: 'obras/:id/rdo',
        canActivate: [permissaoObraGuard(), permissaoModuloGuard('diario_obra')],
        loadComponent: carregarLista,
      },
      {
        path: 'obras/:id/rdo/novo',
        data: { rdoId: 'novo' },
        canActivate: [permissaoObraGuard(), permissaoModuloGuard('diario_obra')],
        loadComponent: carregarEditor,
      },
      {
        path: 'obras/:id/rdo/:rdoId',
        canActivate: [permissaoObraGuard(), permissaoModuloGuard('diario_obra')],
        loadComponent: carregarEditor,
      },
      { path: '**', redirectTo: 'inicio' },
    ],
  },
];
