import { HttpContextToken, HttpErrorResponse, HttpHeaders, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { TimeoutError, catchError, from, of, switchMap, tap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { LOJA_CACHE, bancoLocal } from './banco-local';

/** Marca uma consulta que NÃO pode vir do cache (ex.: conferir se um RDO já chegou ao servidor). */
export const SEM_CACHE_OFFLINE = new HttpContextToken<boolean>(() => false);

/** Cabeçalho posto nas respostas que vieram do celular, e não do servidor. */
export const CABECALHO_DO_CACHE = 'X-ComTrena-Cache';

interface RespostaGuardada {
  corpo: unknown;
  salvoEm: string;
}

/**
 * Consultas sem internet — SÓ no app (environment.app), 09/10/2026.
 *
 * Toda consulta (GET) que dá certo tem a resposta guardada no celular. Sem
 * internet (ou quando a internet da obra não responde), a tela recebe a
 * última resposta guardada em vez de um erro — é o que deixa abrir a lista
 * de RDOs, as permissões, o preparo do RDO e a EAP no meio do canteiro.
 * Gravações (POST/DELETE) não passam por aqui: o RDO novo vai para a fila de
 * envio (`rdo-fila.service.ts`).
 *
 * A chave inclui o usuário: dois logins no mesmo celular não veem os dados
 * um do outro. Fica ANTES do authInterceptor na lista (app.config.ts) para
 * também pegar o tempo-limite que ele impõe.
 */
export const cacheOfflineInterceptor: HttpInterceptorFn = (req, next) => {
  if (
    !environment.app ||
    req.method !== 'GET' ||
    req.responseType !== 'json' ||
    req.context.get(SEM_CACHE_OFFLINE) ||
    !req.url.startsWith(environment.apiUrl)
  ) {
    return next(req);
  }

  const auth = inject(AuthService);
  const chave = `${auth.usuario()?.id ?? 'anonimo'}|${req.urlWithParams}`;

  const servirDoCache = (erroOriginal: unknown) =>
    from(bancoLocal.ler<RespostaGuardada>(LOJA_CACHE, chave).catch(() => undefined)).pipe(
      switchMap((guardada) =>
        guardada
          ? of(
              new HttpResponse({
                status: 200,
                body: guardada.corpo,
                url: req.urlWithParams,
                headers: new HttpHeaders({ [CABECALHO_DO_CACHE]: guardada.salvoEm }),
              }),
            )
          : throwError(() => erroOriginal),
      ),
    );

  // Celular sabidamente sem rede: nem tenta (evita esperar o tempo-limite).
  if (navigator.onLine === false) {
    return servirDoCache(new HttpErrorResponse({ status: 0, statusText: 'Sem internet', url: req.urlWithParams }));
  }

  return next(req).pipe(
    tap((evento) => {
      if (evento instanceof HttpResponse && evento.status === 200) {
        const guardar: RespostaGuardada = { corpo: evento.body, salvoEm: new Date().toISOString() };
        void bancoLocal.gravar(LOJA_CACHE, guardar, chave).catch(() => undefined);
      }
    }),
    catchError((erro: unknown) => {
      const semRede = erro instanceof TimeoutError || (erro instanceof HttpErrorResponse && erro.status === 0);
      return semRede ? servirDoCache(erro) : throwError(() => erro);
    }),
  );
};
