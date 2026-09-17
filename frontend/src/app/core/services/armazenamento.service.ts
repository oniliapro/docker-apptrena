import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { ApiService } from './api.service';

/** Prefixo usado no navegador, para não colidir com outras chaves do domínio. */
const PREFIXO_LOCAL = 'trenaapp.local.';

/**
 * Camada única de leitura e gravação dos dados de trabalho.
 *
 * Tenta a API primeiro. Se ela não responder, grava no navegador e
 * segue funcionando — o mesmo comportamento do `backend-storage.js` do
 * app vanilla, que também cai para `localStorage` quando o PHP não está
 * no ar.
 *
 * ------------------------------------------------------------------
 * Por que isso existe
 * ------------------------------------------------------------------
 * Um app de orçamento que não salva nada é inútil para avaliar: a
 * pessoa monta uma EAP, recarrega a página e perde tudo. Com esta
 * camada, o sistema funciona de verdade mesmo antes de o servidor
 * existir — e quando ele chegar, passa a usá-lo sem que nenhuma tela
 * precise mudar.
 *
 * **Limite importante:** dados no navegador ficam só naquele navegador,
 * naquele computador. Não são compartilhados entre pessoas nem
 * sobrevivem a uma limpeza de dados do navegador. Serve para revisão e
 * uso individual, não para operação de verdade — por isso a interface
 * avisa quando está nesse modo.
 * ------------------------------------------------------------------
 */
@Injectable({ providedIn: 'root' })
export class ArmazenamentoService {
  private readonly api = inject(ApiService);

  /**
   * Null enquanto não se sabe; true/false depois da primeira tentativa.
   * Guardar isso evita esperar o tempo limite a cada gravação quando já
   * se sabe que o servidor não está lá.
   */
  private readonly servidorDisponivel = signal<boolean | null>(null);

  /** Verdadeiro quando os dados estão indo só para o navegador. */
  readonly modoLocal = computed(() => this.servidorDisponivel() === false);

  /** Verdadeiro depois de confirmar que o servidor responde. */
  readonly modoServidor = computed(() => this.servidorDisponivel() === true);

  ler(chave: string): Observable<string | null> {
    // Servidor já reprovado nesta sessão: vai direto ao navegador.
    if (this.servidorDisponivel() === false) {
      return of(this.lerLocal(chave));
    }

    return this.api.lerChave(chave).pipe(
      tap(() => this.marcarDisponivel(true)),
      map(({ value }) => value),
      catchError(() => {
        this.marcarDisponivel(false);
        return of(this.lerLocal(chave));
      }),
    );
  }

  gravar(chave: string, valor: string): Observable<boolean> {
    // Grava no navegador sempre, inclusive quando o servidor responde.
    // Custa pouco e garante que uma queda de rede no meio do trabalho
    // não leve junto o que a pessoa acabou de digitar.
    this.gravarLocal(chave, valor);

    if (this.servidorDisponivel() === false) return of(false);

    return this.api.gravarChave(chave, valor).pipe(
      tap(() => this.marcarDisponivel(true)),
      map(() => true),
      catchError(() => {
        this.marcarDisponivel(false);
        return of(false);
      }),
    );
  }

  remover(chave: string): Observable<boolean> {
    this.removerLocal(chave);

    if (this.servidorDisponivel() === false) return of(false);

    return this.api.removerChave(chave).pipe(
      map(() => true),
      catchError(() => {
        this.marcarDisponivel(false);
        return of(false);
      }),
    );
  }

  /**
   * Permite tentar o servidor de novo — usado quando o usuário sobe o
   * backend sem recarregar a página.
   */
  reavaliarServidor(): void {
    this.servidorDisponivel.set(null);
  }

  /** Tudo que está guardado no navegador, para exportar ou migrar. */
  exportarLocal(): Record<string, string> {
    const dados: Record<string, string> = {};

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const chaveCompleta = localStorage.key(i);
        if (!chaveCompleta?.startsWith(PREFIXO_LOCAL)) continue;

        const valor = localStorage.getItem(chaveCompleta);
        if (valor !== null) dados[chaveCompleta.slice(PREFIXO_LOCAL.length)] = valor;
      }
    } catch {
      // Navegador sem acesso ao armazenamento: devolve o que tiver.
    }

    return dados;
  }

  /** Quantas chaves estão guardadas localmente — para o aviso na tela. */
  contarLocal(): number {
    return Object.keys(this.exportarLocal()).length;
  }

  limparLocal(): void {
    try {
      const chaves: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const chave = localStorage.key(i);
        if (chave?.startsWith(PREFIXO_LOCAL)) chaves.push(chave);
      }
      chaves.forEach((chave) => localStorage.removeItem(chave));
    } catch {
      // sem acesso ao armazenamento
    }
  }

  // ------------------------------------------------------------------
  private marcarDisponivel(disponivel: boolean): void {
    if (this.servidorDisponivel() !== disponivel) {
      this.servidorDisponivel.set(disponivel);
    }
  }

  private lerLocal(chave: string): string | null {
    try {
      return localStorage.getItem(PREFIXO_LOCAL + chave);
    } catch {
      return null;
    }
  }

  private gravarLocal(chave: string, valor: string): void {
    try {
      localStorage.setItem(PREFIXO_LOCAL + chave, valor);
    } catch {
      // Cota estourada ou armazenamento bloqueado. Não há o que fazer
      // aqui além de não quebrar a tela — o usuário verá pelo aviso que
      // as alterações não foram salvas.
    }
  }

  private removerLocal(chave: string): void {
    try {
      localStorage.removeItem(PREFIXO_LOCAL + chave);
    } catch {
      // sem acesso ao armazenamento
    }
  }
}
