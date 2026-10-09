import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { PermissoesService } from '../../core/services/permissoes.service';
import { RdoFilaService } from '../../features/rdo/rdo-fila.service';

/**
 * Casca do APP de celular (09/10/2026) — usada no lugar da `AppShell` do
 * site quando `environment.app` está ligado (ver `app.routes.app.ts`).
 *
 * Primeira versão do app = só o RDO (decisão do Lucas): nada de menu
 * lateral nem atalhos dos outros módulos, só uma barra no topo com o estado
 * da internet, os RDOs que ainda estão no celular esperando envio e o
 * menu do usuário. É aqui que a fila de envio do RDO é ligada.
 */
@Component({
  selector: 'app-movel',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app-movel.html',
  styleUrl: './app-movel.scss',
})
export class AppMovel implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly fila = inject(RdoFilaService);

  protected readonly usuario = this.auth.usuario;
  protected readonly menuAberto = signal(false);

  protected readonly iniciais = computed(() => {
    const nome = this.usuario()?.name || this.usuario()?.email || '?';
    return nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0].toUpperCase())
      .join('');
  });

  protected readonly textoFila = computed(() => {
    const total = this.fila.pendentes();
    if (this.fila.enviando()) return 'Enviando…';
    if (this.fila.comErro() > 0) return `${this.fila.comErro()} não enviado${this.fila.comErro() === 1 ? '' : 's'}`;
    return `${total} aguardando envio`;
  });

  ngOnInit(): void {
    this.fila.iniciar();
  }

  protected enviarAgora(): void {
    void this.fila.enviarTudo();
  }

  protected sair(): void {
    const total = this.fila.pendentes();
    if (
      total > 0 &&
      !confirm(
        `${total} RDO${total === 1 ? '' : 's'} ainda está${total === 1 ? '' : 'ão'} só no celular. ` +
          'Eles continuam guardados e são enviados quando você entrar de novo com este mesmo usuário. Sair mesmo assim?',
      )
    ) {
      return;
    }
    this.menuAberto.set(false);
    this.auth.sair();
  }
}

/**
 * Entrada do app ('/inicio'). Quem tem acesso ao RDO vai direto para a
 * lista; quem não tem vê um aviso — sem isso o guard de permissão
 * (que manda para '/inicio') e o redirecionamento para o RDO ficariam
 * se chamando um ao outro.
 */
@Component({
  selector: 'app-movel-inicio',
  imports: [],
  template: `
    @if (!permissoes.carregado()) {
      <p class="app-aviso">Carregando…</p>
    } @else if (!permissoes.podeModulo('diario_obra')) {
      <p class="app-aviso">
        Seu usuário não tem acesso ao RDO. Peça para quem administra o ComTrena liberar o módulo
        "Diário de obra" para você.
      </p>
    }
  `,
  styles: `.app-aviso { padding: 1.5rem 1rem; color: var(--cor-texto-suave); }`,
})
export class AppMovelInicio implements OnInit {
  protected readonly permissoes = inject(PermissoesService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.permissoes.aguardarCarregamento().subscribe(() => {
      if (this.permissoes.podeModulo('diario_obra')) void this.router.navigate(['/rdo'], { replaceUrl: true });
    });
  }
}
