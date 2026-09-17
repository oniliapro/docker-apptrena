import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';

import { PermissoesService } from '../services/permissoes.service';

/**
 * "Controle de permissões" (31/08/2026) — bloqueia `/obras/:id` (e
 * todas as abas filhas, que herdam) pra quem não tem `pode_ver` nesta
 * obra específica. Aplicado uma vez só, no nível pai — não precisa
 * repetir em cada aba.
 */
export function permissaoObraGuard(): CanActivateFn {
  return (rota) => {
    const permissoes = inject(PermissoesService);
    const router = inject(Router);

    const obraId = rota.paramMap.get('id');
    if (!obraId) return router.createUrlTree(['/obras']);

    return permissoes.aguardarCarregamento().pipe(
      map(() => (permissoes.podeObra(obraId, 'ver') ? true : router.createUrlTree(['/obras']))),
    );
  };
}
