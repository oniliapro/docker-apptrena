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
  {
    // Matriz EAP x período (item 3 do roteiro, 04/08/2026) — cruza os
    // itens da EAP com os pagamentos confirmados da obra, agrupados por
    // mês. Ver comentário em cronograma-desembolso.ts pras decisões de
    // escopo tomadas na ausência da spec original.
    path: 'desembolso',
    data: { titulo: 'Cronograma de desembolso' },
    loadComponent: () =>
      import('./features/cronograma-desembolso/cronograma-desembolso').then(
        (m) => m.CronogramaDesembolso,
      ),
  },
  {
    // Lista de medições desta obra (23/08/2026, pedido do Lucas — mesmo
    // padrão de mapas/empreitas: lista + editor em rotas irmãs).
    path: 'medicoes',
    data: { titulo: 'Medições da obra' },
    loadComponent: () => import('./features/medicoes/medicoes-obra').then((m) => m.MedicoesObra),
  },
  {
    path: 'medicoes/:medicaoId',
    data: { titulo: 'Medição' },
    loadComponent: () => import('./features/medicoes/medicao').then((m) => m.Medicao),
  },
  {
    // Lista de empreitas desta obra (uma obra pode ter várias — task
    // "várias por obra", 31/07/2026). O editor de uma empreita
    // específica vive em 'empreitas/:empreitaId', logo abaixo.
    path: 'empreitas',
    data: { titulo: 'Empreitas da obra' },
    loadComponent: () =>
      import('./features/empreita/empreitas-obra').then((m) => m.EmpreitasObra),
  },
  {
    path: 'empreitas/:empreitaId',
    data: { titulo: 'Empreita' },
    loadComponent: () => import('./features/empreita/empreita').then((m) => m.Empreita),
  },
  {
    // Lista de mapas desta obra (mesma ideia: várias por obra).
    path: 'mapas',
    data: { titulo: 'Mapas da obra' },
    loadComponent: () => import('./features/mapa/mapas-obra').then((m) => m.MapasObra),
  },
  {
    path: 'mapas/:mapaId',
    data: { titulo: 'Mapa' },
    loadComponent: () => import('./features/mapa/mapa').then((m) => m.Mapa),
  },
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
  {
    path: 'arquivos',
    data: { titulo: 'Arquivos anexados' },
    loadComponent: () => import('./features/arquivos/arquivos').then((m) => m.Arquivos),
  },
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
    // Versão "para imprimir" do relatório Orçado x Realizado — SEM o
    // AppShell (nada de menu lateral/cabeçalho) e SEM o authGuard
    // (22/08/2026). Existe só para ser aberta pelo Chromium headless que
    // o backend controla (RelatorioPdfController, via Browsershot) na
    // geração do PDF — a autenticação vem de um token de vida curta na
    // query string (`?token=...`), lido por RelatoriosImprimir e
    // aplicado via AuthService.definirTokenParaImpressao. Não é uma tela
    // pensada para uso manual: um humano abrindo esta URL sem o token
    // certo só veria erros 401 da API, como qualquer sessão não
    // autenticada.
    path: 'imprimir/obras/:id/relatorios',
    loadComponent: () =>
      import('./features/relatorios/relatorios-imprimir').then((m) => m.RelatoriosImprimir),
  },
  {
    // Versão "para imprimir" do Mapa de Fornecedores (22/08/2026) — mesma
    // ideia da rota de relatórios acima: sem AppShell, sem authGuard,
    // autenticada só pelo token de vida curta na query string. Ver
    // MapaPdfController/MapaImprimir e docs/GERAR-PDF.md.
    path: 'imprimir/obras/:id/mapas/:mapaId',
    loadComponent: () => import('./features/mapa/mapa-imprimir').then((m) => m.MapaImprimir),
  },
  {
    // Versão "para imprimir" do Cronograma de Desembolso (23/08/2026) —
    // mesma ideia das rotas acima. Ver CronogramaPdfController.
    path: 'imprimir/obras/:id/desembolso',
    loadComponent: () =>
      import('./features/cronograma-desembolso/cronograma-desembolso-imprimir').then(
        (m) => m.CronogramaDesembolsoImprimir,
      ),
  },
  {
    // Versão "para imprimir" da EAP (23/08/2026) — mesma ideia das rotas
    // acima. Ver EapPdfController.
    path: 'imprimir/obras/:id/eap',
    loadComponent: () => import('./features/eap/eap-imprimir').then((m) => m.EapImprimir),
  },
  {
    // Versão "para imprimir" da Empreita (23/08/2026) — mesma ideia das
    // rotas acima. Ver EmpreitaPdfController.
    path: 'imprimir/obras/:id/empreitas/:empreitaId',
    loadComponent: () =>
      import('./features/empreita/empreita-imprimir').then((m) => m.EmpreitaImprimir),
  },
  {
    // Versão "para imprimir" de uma Medição (24/08/2026) — mesma ideia das
    // rotas acima. Ver MedicaoPdfController.
    path: 'imprimir/obras/:id/medicoes/:medicaoId',
    loadComponent: () =>
      import('./features/medicoes/medicao-imprimir').then((m) => m.MedicaoImprimir),
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
      {
        path: 'fornecedores',
        data: { titulo: 'Fornecedores' },
        loadComponent: () =>
          import('./features/cadastros/fornecedores/fornecedores').then((m) => m.Fornecedores),
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
      // "obra como contexto" (28/07/2026). A rota geral abaixo voltou em
      // 03/08/2026 (item 4) como LISTA (todos os pagamentos de todas as
      // obras, via /api/pagamentos relacional), não editor — o "Ver" de
      // cada linha manda pra página que originou o lançamento.
      {
        path: 'pagamentos',
        data: { titulo: 'Pagamentos' },
        loadComponent: () =>
          import('./features/pagamentos-geral/pagamentos-geral').then((m) => m.PagamentosGeral),
      },
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

      // Mapa e Empreita mudaram para dentro das abas da obra (mesma
      // task, 28/07/2026) e depois viraram "vários por obra" em vez de
      // "um editor único" (31/07/2026): /obras/:id/mapas e
      // /obras/:id/empreitas agora são listas (MapasObra/EmpreitasObra),
      // com criação de registros de verdade, e o editor de cada um vive
      // em /obras/:id/mapas/:mapaId e /obras/:id/empreitas/:empreitaId.
      // As rotas gerais "mapa" e "empreita" (sem :id) continuam
      // removidas porque os componentes exigem o id da obra.
    ],
  },
  { path: '**', redirectTo: '' },
];
