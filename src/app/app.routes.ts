import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { AppShell } from './layout/app-shell/app-shell';

/** Rota de tela ainda não construída, com o título exibido no cabeçalho. */
const reservada = (caminho: string, titulo: string) => ({
  path: caminho,
  data: { titulo },
  loadComponent: () =>
    import('./shared/pagina-reservada/pagina-reservada').then((m) => m.PaginaReservada),
});

/**
 * Abas de uma obra — a estrutura do protótipo do Lucas, em que a obra é
 * a entidade central e cada módulo vive dentro dela.
 *
 * Só a EAP tem tela própria por enquanto; as demais entram conforme
 * forem portadas. Como são rotas filhas, cada aba tem URL própria
 * (/obras/:id/pagamentos), então dá para favoritar e compartilhar.
 */
const abasDaObra: Routes = [
  { path: '', redirectTo: 'eap', pathMatch: 'full' },
  {
    path: 'eap',
    loadComponent: () => import('./features/eap/eap').then((m) => m.Eap),
  },
  reservada('cronograma', 'Cronograma'),
  reservada('desembolso', 'Cronograma de desembolso'),
  reservada('medicoes', 'Medições de Obra'),
  reservada('empreitas', 'Empreitas da obra'),
  {
    path: 'medicao-empreitas',
    data: { titulo: 'Medição de Empreitas' },
    loadComponent: () => import('./features/empreita/empreita').then((m) => m.Empreita),
  },
  {
    path: 'mapas',
    data: { titulo: 'Mapas da obra' },
    loadComponent: () => import('./features/mapa/mapa').then((m) => m.Mapa),
  },
  reservada('compras', 'Compras'),
  {
    path: 'pagamentos',
    data: { titulo: 'Pagamentos da obra' },
    loadComponent: () => import('./features/pagamentos/pagamentos').then((m) => m.Pagamentos),
  },
  reservada('diarios', 'Diários desta obra'),
  {
    path: 'relatorios',
    data: { titulo: 'Relatórios da obra' },
    loadComponent: () => import('./features/relatorios/relatorios').then((m) => m.Relatorios),
  },
  reservada('arquivos', 'Arquivos anexados'),
];

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'cadastro',
    loadComponent: () => import('./features/auth/cadastro/cadastro').then((m) => m.Cadastro),
  },
  {
    path: '',
    component: AppShell,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },

      {
        path: 'inicio',
        data: { titulo: 'Principal' },
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },

      // ---- Cadastros ----
      {
        path: 'clientes',
        data: { titulo: 'Clientes' },
        loadComponent: () =>
          import('./features/cadastros/clientes/clientes').then((m) => m.Clientes),
      },
      {
        path: 'obras',
        data: { titulo: 'Obras' },
        loadComponent: () => import('./features/obras/obras').then((m) => m.Obras),
      },
      {
        path: 'obras/:id',
        data: { titulo: 'Obra' },
        loadComponent: () =>
          import('./features/obras/obra-detalhe/obra-detalhe').then((m) => m.ObraDetalhe),
        children: abasDaObra,
      },
      {
        path: 'responsaveis',
        data: { titulo: 'Responsáveis' },
        loadComponent: () =>
          import('./features/cadastros/responsaveis/responsaveis').then((m) => m.Responsaveis),
      },
      {
        path: 'empreiteiros',
        data: { titulo: 'Empreiteiros' },
        loadComponent: () =>
          import('./features/cadastros/empreiteiros/empreiteiros').then((m) => m.Empreiteiros),
      },

      // ---- Listas gerais (todas as obras) ----
      {
        path: 'mapas',
        data: { titulo: 'Mapas' },
        loadComponent: () => import('./features/mapas/mapas').then((m) => m.Mapas),
      },
      {
        path: 'empreitas',
        data: { titulo: 'Empreitas' },
        loadComponent: () => import('./features/empreitas/empreitas').then((m) => m.Empreitas),
      },
      {
        path: 'empreitas/:id/medicoes',
        data: { titulo: 'Medições da empreita' },
        loadComponent: () =>
          import('./features/empreitas/medicoes/medicoes').then((m) => m.Medicoes),
      },
      // Pagamentos (editor único) mudou para /obras/:id/pagamentos — task
      // "obra como contexto" (28/07/2026). Sem essa rota geral, cada
      // pagamento agora só existe dentro de uma obra.
      {
        path: 'diario-obra',
        data: { titulo: 'Diários de obra' },
        loadComponent: () =>
          import('./features/diario-obra/diario-obra').then((m) => m.DiarioObra),
      },
      // Relatórios também mudou para /obras/:id/relatorios (mesma task,
      // 28/07/2026): o relatório cruza a EAP com os Pagamentos de UMA
      // obra, então nunca fez sentido como página "geral" — essa rota
      // sem :id lia uma chave global que ficou órfã e sempre mostrava
      // vazio. Removida.

      // Os editores únicos de Mapa e Empreita mudaram para dentro das
      // abas da obra (/obras/:id/mapas e /obras/:id/medicao-empreitas) —
      // mesma task. As rotas gerais "mapa" e "empreita" (sem :id) foram
      // removidas porque os componentes agora exigem o id da obra.
    ],
  },
  { path: '**', redirectTo: '' },
];
