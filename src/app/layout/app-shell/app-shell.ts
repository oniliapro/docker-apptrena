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

const CHAVE_UI_SHELL = 'trenaapp.ui.shell.v1';

/** Item de menu. `filhos` presente = grupo expansível (ex.: Cadastros). */
interface ItemNavegacao {
  id: string;
  rota?: string;
  icone: string;
  texto: string;
  filhos?: Array<{ rota: string; texto: string }>;
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
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

  protected readonly itens: ReadonlyArray<ItemNavegacao> = [
    { id: 'principal', rota: '/inicio', icone: 'grade', texto: 'Principal' },
    {
      id: 'cadastros',
      icone: 'pasta',
      texto: 'Cadastros',
      filhos: [
        { rota: '/clientes', texto: 'Clientes' },
        { rota: '/obras', texto: 'Obras' },
        { rota: '/responsaveis', texto: 'Responsáveis' },
        { rota: '/empreiteiros', texto: 'Empreiteiros' },
        { rota: '/fornecedores', texto: 'Fornecedores' },
      ],
    },
    { id: 'mapas', rota: '/mapas', icone: 'camadas', texto: 'Mapas' },
    { id: 'empreitas', rota: '/empreitas', icone: 'ferramenta', texto: 'Empreitas' },
    { id: 'pagamentos', rota: '/pagamentos', icone: 'moeda', texto: 'Pagamentos' },
    { id: 'diarios', rota: '/diario-obra', icone: 'caderno', texto: 'Diários de obra' },
    { id: 'relatorios', rota: '/relatorios', icone: 'grafico', texto: 'Relatórios' },
  ];

  protected grupoAberto(id: string): boolean {
    return this.gruposAbertos().has(id);
  }

  protected alternarGrupo(id: string, evento: Event): void {
    evento.stopPropagation();
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
  }

  protected alternarMenuUsuario(evento: Event): void {
    evento.stopPropagation();
    this.menuLancarAberto.set(false);
    this.menuUsuarioAberto.update((aberto) => !aberto);
  }

  protected fecharMenuUsuario(): void {
    if (this.menuUsuarioAberto()) this.menuUsuarioAberto.set(false);
  }

  protected abrirConfiguracoes(): void {
    window.alert('Configurações: em breve.');
    this.fecharMenuUsuario();
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
