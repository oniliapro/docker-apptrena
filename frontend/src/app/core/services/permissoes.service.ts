import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { filter, take } from 'rxjs/operators';

import { MinhasPermissoes } from '../models/api.models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export type AcaoModulo = 'usar' | 'criar' | 'editar' | 'excluir' | 'reabrir';
export type TipoAcessoObra = 'ver' | 'lancar';

/**
 * "Controle de permissões" (31/08/2026, pedido do Lucas) — fonte única
 * consultada por `app-shell` (filtro do menu lateral) e pelos guards de
 * rota (`permissaoModuloGuard`/`permissaoObraGuard`). Busca
 * `GET /me/permissoes` uma vez sempre que a sessão fica autenticada
 * (reage a `AuthService.autenticado()`, não precisa ninguém lembrar de
 * chamar na hora certa) — admin nunca tem linha nas tabelas de
 * permissão, então `ehAdmin` já resolve tudo sozinho.
 *
 * Backend só protege de verdade os módulos `mapas` e `eap` nesta
 * rodada (prova de padrão) — os outros já aparecem aqui e na matriz de
 * permissão da aba de Configurações, mas ainda não bloqueiam nada via
 * API direta; só escondem a navegação. Ver o plano "Controle de
 * permissões" pra extensão mecânica dos demais módulos.
 */
@Injectable({ providedIn: 'root' })
export class PermissoesService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly _permissoes = signal<MinhasPermissoes | null>(null);
  private readonly _carregado = signal(false);

  readonly carregado = this._carregado.asReadonly();
  private readonly carregadoObservable$ = toObservable(this._carregado);
  readonly ehAdmin = computed(() => this._permissoes()?.ehAdmin ?? false);
  readonly podeGerenciarPermissoes = computed(() => {
    const p = this._permissoes();
    return Boolean(p?.ehAdmin || p?.podeGerenciarPermissoes);
  });

  constructor() {
    effect(() => {
      if (this.auth.autenticado()) {
        this.carregar();
      } else {
        this._permissoes.set(null);
        this._carregado.set(false);
      }
    });
  }

  private carregar(): void {
    this.api.obterMinhasPermissoes().subscribe({
      next: (permissoes) => {
        this._permissoes.set(permissoes);
        this._carregado.set(true);
      },
      error: () => {
        this._permissoes.set(null);
        this._carregado.set(true);
      },
    });
  }

  podeModulo(modulo: string, acao: AcaoModulo = 'usar'): boolean {
    const permissoes = this._permissoes();
    if (!permissoes) return false;
    if (permissoes.ehAdmin) return true;

    const linha = permissoes.modulos[modulo];
    if (!linha) return false;
    if (acao === 'usar') return linha.podeUsar;
    if (!linha.podeUsar) return false;

    switch (acao) {
      case 'criar': return linha.podeCriar;
      case 'editar': return linha.podeEditar;
      case 'excluir': return linha.podeExcluir;
      case 'reabrir': return linha.podeReabrir;
    }
  }

  /**
   * 31/08/2026, pedido do Lucas: acesso por obra é "aberto por
   * exceção" — sem linha explícita pra essa obra, o usuário TEM acesso
   * (todas as obras liberadas por padrão); só uma restrição explícita
   * (`obras[obraId]` presente com a flag em `false`) nega.
   */
  podeObra(obraId: string, tipo: TipoAcessoObra = 'ver'): boolean {
    const permissoes = this._permissoes();
    if (!permissoes) return false;
    if (permissoes.ehAdmin) return true;

    const linha = permissoes.obras[obraId];
    if (!linha) return true;
    return tipo === 'lancar' ? linha.podeLancar : linha.podeVer;
  }

  /**
   * Pros guards de rota (31/08/2026) — `GET /me/permissoes` é uma
   * chamada de rede; sem isso, um guard rodando logo após o login
   * (antes da resposta chegar) veria `_permissoes` ainda nulo e negaria
   * acesso por engano a quem tem permissão de verdade.
   */
  aguardarCarregamento(): Observable<boolean> {
    return this.carregadoObservable$.pipe(
      filter((carregado) => carregado),
      take(1),
    );
  }
}
