import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { permissaoModuloGuard } from './core/guards/permissao-modulo.guard';
import { permissaoObraGuard } from './core/guards/permissao-obra.guard';
import { AppShell } from './layout/app-shell/app-shell';

/**
 * Abas de uma obra — a estrutura do protótipo do Lucas, em que a obra é
 * a entidade central e cada módulo vive dentro dela.
 *
 * Só a EAP tem tela própria por enquanto; as demais entram conforme
 * forem portadas. Como são rotas filhas, cada aba tem URL própria
 * (/obras/:id/pagamentos), então dá para favoritar e compartilhar.
 */
const abasDaObra: Routes = [
  {
    // Tela de entrada da obra (28/09/2026, item 16) — grade de botões pra
    // escolher a aba, no lugar do antigo `redirectTo: 'eap'` (a faixa
    // horizontal de abas tinha virado muitas e difícil de navegar). Cada
    // aba ganha um "← Voltar" pra cá (`ObraDetalhe.dentroDeAba`).
    path: '',
    loadComponent: () => import('./features/obras/obra-inicio/obra-inicio').then((m) => m.ObraInicio),
  },
  {
    // EAP — exceção de "Controle de permissões" (31/08/2026): sempre
    // visível a quem tem acesso à obra (o guard de obra já roda no pai,
    // `obras/:id`), sem `permissaoModuloGuard` — só a edição dentro da
    // tela é que segue a regra normal de módulo.
    path: 'eap',
    loadComponent: () => import('./features/eap/eap').then((m) => m.Eap),
  },
  {
    // Cronograma de obra (CPM — Critical Path Method, 02/10/2026, pedido
    // do Lucas) — tarefas com precedência (TI/II/TT/IT), latência, marcos,
    // cálculo automático de datas e caminho crítico. Não confundir com
    // 'desembolso' (Cronograma de Desembolso, financeiro) logo abaixo.
    path: 'cronograma',
    data: { titulo: 'Cronograma' },
    canActivate: [permissaoModuloGuard('cronograma')],
    loadComponent: () => import('./features/cronograma-obra/cronograma-obra').then((m) => m.CronogramaObra),
  },
  {
    // Matriz EAP x período (item 3 do roteiro, 04/08/2026) — cruza os
    // itens da EAP com os pagamentos confirmados da obra, agrupados por
    // mês. Ver comentário em cronograma-desembolso.ts pras decisões de
    // escopo tomadas na ausência da spec original.
    path: 'desembolso',
    data: { titulo: 'Cronograma de desembolso' },
    canActivate: [permissaoModuloGuard('desembolso')],
    loadComponent: () =>
      import('./features/cronograma-desembolso/cronograma-desembolso').then(
        (m) => m.CronogramaDesembolso,
      ),
  },
  {
    // Linha do tempo de saldo acumulado (recebimentos − pagamentos) da obra
    // (01/10/2026, pedido do Lucas — Parte 3 das pendências de outubro,
    // item adiantado antes do Cronograma de obra). Período trocável (dia a
    // ano) — ver `fluxo-caixa-engine.ts`.
    path: 'fluxo-caixa',
    data: { titulo: 'Fluxo de caixa' },
    canActivate: [permissaoModuloGuard('fluxo_caixa')],
    loadComponent: () => import('./features/fluxo-caixa/fluxo-caixa').then((m) => m.FluxoCaixa),
  },
  {
    // Lista de medições desta obra (23/08/2026, pedido do Lucas — mesmo
    // padrão de mapas/empreitas: lista + editor em rotas irmãs).
    path: 'medicoes',
    data: { titulo: 'Medições da obra' },
    canActivate: [permissaoModuloGuard('medicoes')],
    loadComponent: () => import('./features/medicoes/medicoes-obra').then((m) => m.MedicoesObra),
  },
  {
    path: 'medicoes/:medicaoId',
    data: { titulo: 'Medição' },
    canActivate: [permissaoModuloGuard('medicoes')],
    loadComponent: () => import('./features/medicoes/medicao').then((m) => m.Medicao),
  },
  {
    // Lista de empreitas desta obra (uma obra pode ter várias — task
    // "várias por obra", 31/07/2026). O editor de uma empreita
    // específica vive em 'empreitas/:empreitaId', logo abaixo.
    path: 'empreitas',
    data: { titulo: 'Empreitas da obra' },
    canActivate: [permissaoModuloGuard('empreitas')],
    loadComponent: () =>
      import('./features/empreita/empreitas-obra').then((m) => m.EmpreitasObra),
  },
  {
    path: 'empreitas/:empreitaId',
    data: { titulo: 'Empreita' },
    canActivate: [permissaoModuloGuard('empreitas')],
    loadComponent: () => import('./features/empreita/empreita').then((m) => m.Empreita),
  },
  {
    // Lista de mapas desta obra (mesma ideia: várias por obra).
    path: 'mapas',
    data: { titulo: 'Mapas da obra' },
    canActivate: [permissaoModuloGuard('mapas')],
    loadComponent: () => import('./features/mapa/mapas-obra').then((m) => m.MapasObra),
  },
  {
    path: 'mapas/:mapaId',
    data: { titulo: 'Mapa' },
    canActivate: [permissaoModuloGuard('mapas')],
    loadComponent: () => import('./features/mapa/mapa').then((m) => m.Mapa),
  },
  {
    path: 'pagamentos',
    data: { titulo: 'Pagamentos da obra' },
    canActivate: [permissaoModuloGuard('pagamentos')],
    loadComponent: () => import('./features/pagamentos/pagamentos').then((m) => m.Pagamentos),
  },
  {
    // Recebimentos (01/09/2026, pedido do Lucas) — mirror exato da aba de
    // Pagamentos acima, ver features/recebimentos/.
    path: 'recebimentos',
    data: { titulo: 'Recebimentos da obra' },
    canActivate: [permissaoModuloGuard('recebimentos')],
    loadComponent: () => import('./features/recebimentos/recebimentos').then((m) => m.Recebimentos),
  },
  {
    // Diárias (22/09/2026, F7) — lançamento manual; o lançamento automático
    // a partir do RDO ao finalizar o dia chega na F9.
    path: 'diarias',
    data: { titulo: 'Diárias da obra' },
    canActivate: [permissaoModuloGuard('diarias')],
    loadComponent: () => import('./features/diarias/diarias').then((m) => m.Diarias),
  },
  {
    // Agenda da obra (26/09/2026) — compromissos com horário só desta obra; a Agenda geral
    // (menu lateral) junta os de todas as obras.
    path: 'agenda',
    data: { titulo: 'Agenda da obra' },
    canActivate: [permissaoModuloGuard('agenda')],
    loadComponent: () => import('./features/agenda/agenda').then((m) => m.Agenda),
  },
  {
    // Lista de RDOs desta obra (F8, 22/09/2026) — o calendário É a lista
    // (`rdo-lista.ts`); "Novo RDO" e clicar num relatório levam pro editor
    // (`rdo.ts`), embaixo. Substituiu o placeholder "Diários desta obra".
    path: 'rdo',
    data: { titulo: 'RDO da obra' },
    canActivate: [permissaoModuloGuard('diario_obra')],
    loadComponent: () => import('./features/rdo/rdo-lista').then((m) => m.RdoLista),
  },
  {
    path: 'rdo/novo',
    // 'rdo/novo' é literal na rota, sem `:rdoId` — o valor 'novo' que o
    // componente espera (`Rdo.rdoId`) vem daqui, do `data`, que o
    // `withComponentInputBinding()` liga do mesmo jeito que um param de rota.
    data: { titulo: 'Novo RDO', rdoId: 'novo' },
    canActivate: [permissaoModuloGuard('diario_obra')],
    loadComponent: () => import('./features/rdo/rdo').then((m) => m.Rdo),
  },
  {
    path: 'rdo/:rdoId',
    data: { titulo: 'RDO' },
    canActivate: [permissaoModuloGuard('diario_obra')],
    loadComponent: () => import('./features/rdo/rdo').then((m) => m.Rdo),
  },
  {
    // Controle de contrato de equipamentos (26/09/2026) — só a lista da obra;
    // criar/editar/renovar um contrato acontece num popup (26/09/2026, pedido
    // do Lucas: "coloque a edição do contrato por meio de popup" — era uma
    // página própria antes), ver `EditarContratoEquipamentoModal`.
    path: 'contratos-equipamentos',
    data: { titulo: 'Contratos de equipamentos' },
    canActivate: [permissaoModuloGuard('contratos_equipamentos')],
    loadComponent: () =>
      import('./features/contratos-equipamentos/contratos-equipamentos-obra').then(
        (m) => m.ContratosEquipamentosObra,
      ),
  },
  {
    path: 'relatorios',
    data: { titulo: 'Relatórios da obra' },
    canActivate: [permissaoModuloGuard('relatorios')],
    loadComponent: () => import('./features/relatorios/relatorios').then((m) => m.Relatorios),
  },
  {
    path: 'arquivos',
    data: { titulo: 'Arquivos anexados' },
    canActivate: [permissaoModuloGuard('arquivos')],
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
    // Versão "para imprimir" do RDO (17/09/2026) — é esta rota que o Chromium
    // headless do RdoPdfController abre para gerar o PDF. Mesma ideia das
    // rotas de impressão acima: fora do AppShell, CSS de A4.
    path: 'imprimir/rdo/:id',
    loadComponent: () => import('./features/rdo-imprimir/rdo-imprimir').then((m) => m.RdoImprimir),
  },
  {
    // Versão "para imprimir" da Empreita (23/08/2026) — mesma ideia das
    // rotas acima. Ver EmpreitaPdfController.
    path: 'imprimir/obras/:id/empreitas/:empreitaId',
    loadComponent: () =>
      import('./features/empreita/empreita-imprimir').then((m) => m.EmpreitaImprimir),
  },
  {
    // Versão "para imprimir" do Resumo para o profissional (19/09/2026) —
    // várias empreitas num PDF só. Ver EmpreitaPdfController::resumoProfissional.
    path: 'imprimir/obras/:id/resumo-profissional',
    loadComponent: () =>
      import('./features/empreita/empreita-resumo-profissional-imprimir').then(
        (m) => m.EmpreitaResumoProfissionalImprimir,
      ),
  },
  {
    // Versão "para imprimir" de uma Medição (24/08/2026) — mesma ideia das
    // rotas acima. Ver MedicaoPdfController.
    path: 'imprimir/obras/:id/medicoes/:medicaoId',
    loadComponent: () =>
      import('./features/medicoes/medicao-imprimir').then((m) => m.MedicaoImprimir),
  },
  {
    // Versão "para imprimir" do contrato de uma Empreita (28/09/2026, itens
    // 8/9) — mesma ideia das rotas acima. Ver ContratoPdfController.
    path: 'imprimir/obras/:id/contratos/empreita/:empreitaId',
    data: { tipo: 'empreita' },
    loadComponent: () => import('./features/contrato-imprimir/contrato-imprimir').then((m) => m.ContratoImprimir),
  },
  {
    // Versão "para imprimir" do contrato de uma Obra/proposta (28/09/2026,
    // itens 8/9) — mesma ideia acima. Ver ContratoPdfController.
    path: 'imprimir/obras/:id/contratos/obra',
    data: { tipo: 'obra' },
    loadComponent: () => import('./features/contrato-imprimir/contrato-imprimir').then((m) => m.ContratoImprimir),
  },
  {
    // Proposta gerada da página da EAP (14/10/2026) — mesma tela do
    // contrato de obra, com a tabela da EAP injetada em `{{tabela_eap}}`.
    path: 'imprimir/obras/:id/contratos/proposta',
    data: { tipo: 'proposta' },
    loadComponent: () => import('./features/contrato-imprimir/contrato-imprimir').then((m) => m.ContratoImprimir),
  },
  {
    // Acompanhamento do contratante no RDO (17/09/2026) — o único diário
    // daqui pra frente (F8, 22/09/2026: a rota pública do Diário antigo,
    // `publico/diario/:token`, foi retirada daqui — os links antigos param
    // de abrir, mas nada foi apagado do banco, ver `MigrarDiarioParaRdo`).
    // Mesmo regime: fora do AppShell e sem authGuard, porque quem abre é o
    // dono da obra, que não tem conta no ComTrena. Somente leitura.
    path: 'publico/rdo/:token',
    loadComponent: () => import('./features/publico-rdo/publico-rdo').then((m) => m.PublicoRdo),
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
        canActivate: [permissaoModuloGuard('obras')],
        loadComponent: () => import('./features/obras/obras').then((m) => m.Obras),
      },
      {
        path: 'obras/:id',
        data: { titulo: 'Obra' },
        canActivate: [permissaoObraGuard()],
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
        data: { titulo: 'Profissionais' },
        loadComponent: () =>
          import('./features/cadastros/empreiteiros/empreiteiros').then((m) => m.Empreiteiros),
      },
      {
        path: 'materiais-equipamentos',
        data: { titulo: 'Materiais e equipamentos' },
        loadComponent: () =>
          import('./features/cadastros/materiais-equipamentos/materiais-equipamentos').then(
            (m) => m.MateriaisEquipamentos,
          ),
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
        canActivate: [permissaoModuloGuard('mapas')],
        loadComponent: () => import('./features/mapas/mapas').then((m) => m.Mapas),
      },
      {
        // Página de controle geral de Contratos de equipamentos (27/09/2026,
        // pedido do Lucas) — mesma lista da aba da obra, cruzando todas as obras.
        path: 'contratos-equipamentos',
        data: { titulo: 'Contratos de equipamentos' },
        canActivate: [permissaoModuloGuard('contratos_equipamentos')],
        loadComponent: () =>
          import('./features/contratos-equipamentos/contratos-equipamentos-geral').then(
            (m) => m.ContratosEquipamentosGeral,
          ),
      },
      {
        path: 'empreitas',
        data: { titulo: 'Empreitas' },
        canActivate: [permissaoModuloGuard('empreitas')],
        loadComponent: () => import('./features/empreitas/empreitas').then((m) => m.Empreitas),
      },
      {
        path: 'empreitas/:id/medicoes',
        data: { titulo: 'Medições da empreita' },
        canActivate: [permissaoModuloGuard('empreitas')],
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
        canActivate: [permissaoModuloGuard('pagamentos')],
        loadComponent: () =>
          import('./features/pagamentos-geral/pagamentos-geral').then((m) => m.PagamentosGeral),
      },
      {
        // Recebimentos (01/09/2026, pedido do Lucas) — mirror exato da lista
        // geral de Pagamentos acima.
        path: 'recebimentos',
        data: { titulo: 'Recebimentos' },
        canActivate: [permissaoModuloGuard('recebimentos')],
        loadComponent: () =>
          import('./features/recebimentos/recebimentos-geral').then((m) => m.RecebimentosGeral),
      },
      // A rota 'diario-obra' (Diário antigo) foi retirada em 22/09/2026 (F8)
      // — o RDO abaixo é o único diário daqui pra frente. Nada foi apagado
      // do banco (tabelas `diario_*` e os arquivos continuam intactos); só a
      // TELA saiu do ar, e quem tinha o link direto agora cai em "página não
      // encontrada". Os registros existentes viram RDO com
      // `php artisan diario:migrar-para-rdo`, ver `MigrarDiarioParaRdo`.
      {
        // Agenda geral (26/09/2026): compromissos de todas as obras, compartilhados com todos os
        // usuários da empresa — estilo Google Agenda.
        path: 'agenda',
        data: { titulo: 'Agenda' },
        canActivate: [permissaoModuloGuard('agenda')],
        loadComponent: () => import('./features/agenda/agenda').then((m) => m.Agenda),
      },
      {
        // Editor de um modelo de contrato (29/09/2026, pedido do Lucas: mais
        // visual, "parecido com o Word", numa aba própria em vez do
        // textarea dentro do popup de Configurações). `window.open` em
        // `ContratoModelosConfig.novo/editar` — funciona igual acessada
        // direto (só sem o `window.close()` automático depois de salvar).
        path: 'contrato-modelos/novo',
        data: { titulo: 'Novo modelo de documento' },
        loadComponent: () =>
          import('./features/configuracoes/contrato-modelos/contrato-modelo-editor/contrato-modelo-editor').then(
            (m) => m.ContratoModeloEditor,
          ),
      },
      {
        path: 'contrato-modelos/:contratoModeloId',
        data: { titulo: 'Editar modelo de documento' },
        loadComponent: () =>
          import('./features/configuracoes/contrato-modelos/contrato-modelo-editor/contrato-modelo-editor').then(
            (m) => m.ContratoModeloEditor,
          ),
      },
      {
        // Lista geral de RDOs, todas as obras (F8, 22/09/2026: virou lista +
        // calendário, mesma forma que as outras listas gerais — o editor de
        // um RDO específico vive em /obras/:id/rdo/:rdoId, obra-scoped, ver
        // `abasDaObra`). Reaproveita a permissão `diario_obra`, então quem já
        // tinha acesso ao Diário antigo entra aqui sem mexer em permissão.
        path: 'rdo',
        data: { titulo: 'RDO' },
        canActivate: [permissaoModuloGuard('diario_obra')],
        loadComponent: () => import('./features/rdo/rdo-lista').then((m) => m.RdoLista),
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
