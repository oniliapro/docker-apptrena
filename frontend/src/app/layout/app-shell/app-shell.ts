import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { environment } from '../../../environments/environment';
import { nomeDaEmpresa } from '../../core/models/api.models';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { AuthService } from '../../core/services/auth.service';
import { PermissoesService } from '../../core/services/permissoes.service';
import { Configuracoes } from '../../features/configuracoes/configuracoes';

const CHAVE_UI_SHELL = 'trenaapp.ui.shell.v1';

/**
 * Item de menu. `filhos` presente = grupo expansível (ex.: Cadastros).
 * `moduloChave` ausente = sempre visível, sem gate de "Controle de
 * permissões" (31/08/2026) — hoje é o caso de "Principal" e dos 4
 * cadastros que ainda não têm backend relacional próprio
 * (Clientes/Responsáveis/Empreiteiros/Fornecedores).
 */
interface ItemNavegacao {
  id: string;
  rota?: string;
  icone: string;
  texto: string;
  moduloChave?: string;
  filhos?: Array<{ rota: string; texto: string; moduloChave?: string }>;
}

/**
 * Casca da aplicação: barra lateral + barra de topo + <router-outlet>.
 *
 * A estrutura do menu segue o protótipo do Lucas (obracontrol.html):
 * Principal, Cadastros (com submenu), Mapas, Empreitas, Pagamentos,
 * Diários de obra e Relatórios — com ícones em traço e o box de
 * assinatura no rodapé.
 *
 * Os comportamentos herdados de js/shared/shell.js foram preservados:
 * recolher a barra lateral com persistência, destacar a rota atual, e o
 * menu do usuário que fecha ao clicar fora ou apertar Esc.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Configuracoes],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  host: {
    '(document:click)': 'fecharMenus()',
    '(document:keydown.escape)': 'fecharMenus()',
  },
})
export class AppShell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly permissoes = inject(PermissoesService);

  protected readonly menuLancarAberto = signal(false);

  /** Build publicado só para revisão visual — mostra o aviso no topo. */
  protected readonly ehRevisao = environment.revisao;

  /** Dados indo só para o navegador — o servidor não respondeu. */
  protected readonly modoLocal = inject(ArmazenamentoService).modoLocal;
  protected readonly avisoFechado = signal(false);

  /**
   * Título da rota atual, para a trilha da barra superior. Vem de
   * `data.titulo` na definição da rota; desce até a rota-folha para
   * pegar o título da aba quando há rotas aninhadas.
   */
  protected readonly tituloRota = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let atual = this.rota.firstChild;
        let titulo = '';
        while (atual) {
          titulo = String(atual.snapshot?.data?.['titulo'] ?? titulo);
          atual = atual.firstChild;
        }
        return titulo || 'Principal';
      }),
    ),
    { initialValue: 'Principal' },
  );

  protected readonly recolhida = signal(this.lerPreferencia());
  protected readonly menuUsuarioAberto = signal(false);
  protected readonly usuario = this.auth.usuario;

  /** Ids dos grupos expandidos. Cadastros já abre aberto. */
  protected readonly gruposAbertos = signal<Set<string>>(new Set(['cadastros']));

  /**
   * Id do grupo com o popup flutuante aberto — só existe com a barra
   * lateral recolhida (20/08/2026, pedido do Lucas). Recolhida, o
   * submenu inline vira `display:none` (não tem espaço pro texto), então
   * clicar em "Cadastros" não mostrava nada; agora abre um popup ao lado
   * do ícone com as subopções por extenso. Null = nenhum popup aberto.
   */
  protected readonly popupGrupoAberto = signal<string | null>(null);

  /**
   * Posição vertical (viewport) do popup — `.nav` tem `overflow-y: auto`,
   * o que faz o navegador também clipar overflow-x (regra do CSS: um dos
   * eixos não-"visible" força o outro a "auto"), cortando um popup
   * `position: absolute` que tentasse escapar pela lateral. `position:
   * fixed` não sofre esse corte, mas precisa da posição calculada na
   * hora do clique.
   */
  protected readonly popupGrupoTopoPx = signal(0);

  /** Nome da empresa para a trilha; cai para um rótulo genérico. */
  protected readonly empresa = computed(() => nomeDaEmpresa(this.usuario()) || 'Construtora');

  protected readonly iniciais = computed(() => {
    const nome = this.usuario()?.name?.trim();
    if (!nome) return '?';
    const partes = nome.split(/\s+/);
    const primeira = partes[0]?.[0] ?? '';
    const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
    return (primeira + ultima).toUpperCase();
  });

  /**
   * Todos os itens, sem filtro — Clientes/Responsáveis/Empreiteiros/
   * Fornecedores não têm `moduloChave` de propósito (ainda fora do
   * "Controle de permissões", ver `PermissaoService::MODULOS` no
   * backend), então nunca são escondidos.
   */
  private readonly todosOsItens: ReadonlyArray<ItemNavegacao> = [
    { id: 'principal', rota: '/inicio', icone: 'grade', texto: 'Principal' },
    {
      id: 'cadastros',
      icone: 'pasta',
      texto: 'Cadastros',
      filhos: [
        { rota: '/clientes', texto: 'Clientes' },
        { rota: '/responsaveis', texto: 'Responsáveis' },
        { rota: '/empreiteiros', texto: 'Profissionais' },
        { rota: '/fornecedores', texto: 'Fornecedores' },
      ],
    },
    // Fora de Cadastros (19/08/2026, pedido do Lucas) — Obras é o ponto de
    // entrada mais usado do sistema (todo o resto vive dentro de uma
    // obra), não faz sentido ficar escondido num submenu que precisa
    // abrir primeiro.
    { id: 'obras', rota: '/obras', icone: 'predio', texto: 'Obras', moduloChave: 'obras' },
    { id: 'mapas', rota: '/mapas', icone: 'camadas', texto: 'Mapas', moduloChave: 'mapas' },
    {
      id: 'empreitas',
      rota: '/empreitas',
      icone: 'ferramenta',
      texto: 'Empreitas',
      moduloChave: 'empreitas',
    },
    {
      id: 'pagamentos',
      rota: '/pagamentos',
      icone: 'moeda',
      texto: 'Pagamentos',
      moduloChave: 'pagamentos',
    },
    {
      id: 'recebimentos',
      rota: '/recebimentos',
      icone: 'moeda',
      texto: 'Recebimentos',
      moduloChave: 'recebimentos',
    },
    {
      id: 'diarios',
      rota: '/diario-obra',
      icone: 'caderno',
      texto: 'Diários de obra',
      moduloChave: 'diario_obra',
    },
    {
      // Relatório Diário de Obra (RDO) — módulo reconstruído em 17/09/2026.
      // Entra ao lado do Diário antigo, não no lugar dele: os dois convivem
      // até a migração terminar, para não tirar do ar o que já está em uso.
      // Mesma chave de permissão, então quem já via o Diário vê este também.
      id: 'rdo',
      rota: '/rdo',
      icone: 'caderno',
      texto: 'RDO',
      moduloChave: 'diario_obra',
    },
    {
      id: 'relatorios',
      rota: '/relatorios',
      icone: 'grafico',
      texto: 'Relatórios',
      moduloChave: 'relatorios',
    },
  ];

  /**
   * "Controle de permissões" (31/08/2026) — esconde item e sub-item sem
   * `pode_usar` no módulo correspondente (admin sempre vê tudo). Um
   * grupo com `filhos` só some por inteiro se NENHUM filho sobrar.
   */
  protected readonly itens = computed<ReadonlyArray<ItemNavegacao>>(() => {
    const podeVerItem = (item: { moduloChave?: string }) =>
      !item.moduloChave || this.permissoes.podeModulo(item.moduloChave, 'usar');

    return this.todosOsItens
      .map((item) =>
        item.filhos ? { ...item, filhos: item.filhos.filter(podeVerItem) } : item,
      )
      .filter((item) => podeVerItem(item) && (!item.filhos || item.filhos.length > 0));
  });

  protected grupoAberto(id: string): boolean {
    return this.gruposAbertos().has(id);
  }

  protected alternarGrupo(id: string, evento: Event): void {
    evento.stopPropagation();

    // Barra recolhida: não tem como expandir inline (o submenu fica
    // escondido, sem espaço pro texto) — abre num popup ao lado do
    // ícone, em vez do `gruposAbertos` normal.
    if (this.recolhida()) {
      if (this.popupGrupoAberto() === id) {
        this.popupGrupoAberto.set(null);
        return;
      }
      const alvo = evento.currentTarget as HTMLElement;
      this.popupGrupoTopoPx.set(alvo.getBoundingClientRect().top);
      this.popupGrupoAberto.set(id);
      return;
    }

    this.gruposAbertos.update((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  protected alternarBarraLateral(): void {
    const novo = !this.recolhida();
    this.recolhida.set(novo);
    this.salvarPreferencia(novo);
  }

  protected alternarMenuLancar(evento: Event): void {
    evento.stopPropagation();
    this.menuUsuarioAberto.set(false);
    this.menuLancarAberto.update((aberto) => !aberto);
  }

  protected fecharMenus(): void {
    if (this.menuUsuarioAberto()) this.menuUsuarioAberto.set(false);
    if (this.menuLancarAberto()) this.menuLancarAberto.set(false);
    if (this.popupGrupoAberto()) this.popupGrupoAberto.set(null);
  }

  protected alternarMenuUsuario(evento: Event): void {
    evento.stopPropagation();
    this.menuLancarAberto.set(false);
    this.menuUsuarioAberto.update((aberto) => !aberto);
  }

  protected fecharMenuUsuario(): void {
    if (this.menuUsuarioAberto()) this.menuUsuarioAberto.set(false);
  }

  protected readonly configuracoesAberto = signal(false);

  protected abrirConfiguracoes(): void {
    this.configuracoesAberto.set(true);
    this.fecharMenuUsuario();
  }

  protected fecharConfiguracoes(): void {
    this.configuracoesAberto.set(false);
  }

  protected sair(): void {
    if (!window.confirm('Sair da conta?')) return;
    this.auth.sair();
  }

  private lerPreferencia(): boolean {
    try {
      const bruto = localStorage.getItem(CHAVE_UI_SHELL);
      if (!bruto) return false;
      return Boolean((JSON.parse(bruto) as { sidebarCollapsed?: boolean }).sidebarCollapsed);
    } catch {
      return false;
    }
  }

  private salvarPreferencia(recolhida: boolean): void {
    try {
      localStorage.setItem(CHAVE_UI_SHELL, JSON.stringify({ sidebarCollapsed: recolhida }));
    } catch {
      // sem persistência: a preferência vale só para esta sessão.
    }
  }
}
