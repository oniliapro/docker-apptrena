import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';

import { AcaoModulo, PermissoesService } from '../services/permissoes.service';

/**
 * "Controle de permissões" (31/08/2026) — bloqueia a rota de um módulo
 * pra quem não tem `pode_usar` nele (`acao` default). Espera o
 * `GET /me/permissoes` terminar antes de decidir (`aguardarCarregamento`)
 * — sem isso, um guard rodando logo após o login negaria acesso por
 * engano enquanto a resposta ainda não chegou.
 */
export function permissaoModuloGuard(modulo: string, acao: AcaoModulo = 'usar'): CanActivateFn {
  return () => {
    const permissoes = inject(PermissoesService);
    const router = inject(Router);

    return permissoes.aguardarCarregamento().pipe(
      map(() => (permissoes.podeModulo(modulo, acao) ? true : router.createUrlTree(['/inicio']))),
    );
  };
}
