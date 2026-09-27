import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable } from 'rxjs';

import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { CHAVE_EMPREITEIROS } from '../../features/cadastros/empreiteiros/empreiteiros';
import { CHAVE_FORNECEDORES } from '../../features/cadastros/fornecedores/fornecedores.fonte';

/**
 * Dados de pagamento (PIX) cadastrados pra um fornecedor ou profissional
 * (27/09/2026, mensagem de solicitação de pagamento) — lê os `dadosRecebimento`
 * já existentes nos cadastros de Fornecedores e Profissionais (a ponte de
 * storage, sem backend relacional). Um mesmo nome pode aparecer nos dois
 * cadastros (ex.: um freteiro cadastrado como profissional) — junta os dois.
 */
export interface OpcaoPix {
  rotulo: string;
  valor: string;
}

function extrairOpcoesPix(bruto: string | null, nomeAlvo: string): OpcaoPix[] {
  if (!bruto) return [];
  try {
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];

    const alvo = nomeAlvo.trim().toLowerCase();
    const opcoes: OpcaoPix[] = [];

    for (const bruto of lista as Record<string, unknown>[]) {
      const nome = String(bruto?.['nome'] ?? '').trim();
      if (nome.toLowerCase() !== alvo) continue;

      const recebimentos = Array.isArray(bruto?.['dadosRecebimento'])
        ? (bruto['dadosRecebimento'] as Record<string, unknown>[])
        : [];

      for (const r of recebimentos) {
        const chave = String(r?.['chavePix'] ?? '').trim();
        if (!chave) continue;
        const titular = String(r?.['nomeTitular'] ?? '').trim();
        opcoes.push({ rotulo: titular ? `${chave} (${titular})` : chave, valor: chave });
      }
    }

    return opcoes;
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class DadosPagamentoService {
  private readonly armazenamento = inject(ArmazenamentoService);

  /** Opções de PIX já cadastradas pra este nome (Fornecedores + Profissionais) — vazio se não achar nada. */
  buscarOpcoesPix(nome: string): Observable<OpcaoPix[]> {
    return forkJoin([this.armazenamento.ler(CHAVE_FORNECEDORES), this.armazenamento.ler(CHAVE_EMPREITEIROS)]).pipe(
      map(([fornecedores, profissionais]) => [
        ...extrairOpcoesPix(fornecedores, nome),
        ...extrairOpcoesPix(profissionais, nome),
      ]),
    );
  }
}
