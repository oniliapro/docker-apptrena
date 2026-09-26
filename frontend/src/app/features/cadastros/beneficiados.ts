import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, forkJoin, from, map, of, switchMap, toArray } from 'rxjs';

import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { gerarId } from '../eap/eap-normalize';
import { CHAVE_EMPREITEIROS } from './empreiteiros/empreiteiros';
import { CHAVE_FORNECEDORES, FornecedoresCadastro } from './fornecedores/fornecedores.fonte';

export type TipoBeneficiado = 'fornecedor' | 'profissional';

/** Nome comparável: sem acento, sem diferença de maiúscula e com espaços colapsados. */
export function chaveDoNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function lerLista(bruto: string | null): Record<string, unknown>[] {
  if (!bruto) return [];
  try {
    const lista: unknown = JSON.parse(bruto);
    return Array.isArray(lista) ? (lista as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

/**
 * Regra do beneficiado (26/09/2026, pedido do Lucas): só é possível realizar
 * (confirmar) um pagamento para quem está cadastrado como Fornecedor ou como
 * Profissional. Quando o nome digitado não está em nenhum dos dois cadastros,
 * o sistema pergunta se a pessoa quer cadastrá-lo; se quiser, pergunta se é
 * fornecedor ou profissional e já cadastra só com o nome (o resto se completa
 * depois no cadastro). Se ela recusar, o chamador NÃO confirma o pagamento e
 * devolve o usuário à edição, com um aviso.
 *
 * Os dois cadastros ainda moram na ponte chave-valor (`/api/storage`), então
 * a conferência lê essas duas listas e o cadastro novo é acrescentado nelas.
 */
@Injectable({ providedIn: 'root' })
export class Beneficiados {
  private readonly armazenamento = inject(ArmazenamentoService);
  private readonly fornecedoresCadastro = inject(FornecedoresCadastro);

  /**
   * Confere os nomes; para cada um sem cadastro, pergunta e cadastra.
   * Devolve os nomes que ficaram SEM cadastro (recusados, vazios ou com erro):
   * lista vazia = pode seguir com o pagamento.
   */
  resolver(nomes: readonly string[]): Observable<string[]> {
    const vistos = new Set<string>();
    const unicos: string[] = [];
    for (const nome of nomes) {
      const chave = chaveDoNome(nome ?? '');
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      unicos.push((nome ?? '').trim());
    }

    return forkJoin([
      this.armazenamento.ler(CHAVE_FORNECEDORES),
      this.armazenamento.ler(CHAVE_EMPREITEIROS),
    ]).pipe(
      map(([fornecedores, profissionais]) => {
        const cadastrados = new Set<string>();
        for (const registro of [...lerLista(fornecedores), ...lerLista(profissionais)]) {
          cadastrados.add(chaveDoNome(String(registro['nome'] ?? '')));
        }
        return unicos.filter((nome) => !cadastrados.has(chaveDoNome(nome)));
      }),
      switchMap((faltando) =>
        faltando.length
          ? from(faltando).pipe(
              concatMap((nome) => this.perguntarECadastrar(nome)),
              toArray(),
              map((resultados) => resultados.filter((nome): nome is string => nome !== null)),
            )
          : of([] as string[]),
      ),
    );
  }

  /** Texto padrão do aviso quando o pagamento não pôde ser confirmado. */
  static mensagemRecusa(recusados: readonly string[], pagamentos = 1): string {
    const quem = recusados.map((nome) => (nome ? `"${nome}"` : '(beneficiado em branco)')).join(', ');
    return (
      (pagamentos === 1 ? 'Pagamento NÃO confirmado' : 'Pagamentos NÃO confirmados') +
      `: o beneficiado ${quem} não está cadastrado como fornecedor nem como profissional.\n\n` +
      'Só é possível realizar pagamento para fornecedores ou profissionais cadastrados. ' +
      'Cadastre o beneficiado (ou corrija o nome na edição do pagamento) e confirme de novo.'
    );
  }

  /** `null` = cadastrado agora (pode seguir); o nome = ficou sem cadastro. */
  private perguntarECadastrar(nome: string): Observable<string | null> {
    if (!nome) return of(nome);

    const quer = window.confirm(
      `O beneficiado "${nome}" não está cadastrado como fornecedor nem como profissional.\n\nDeseja cadastrá-lo agora?`,
    );
    if (!quer) return of(nome);

    const tipo = this.perguntarTipo(nome);
    if (!tipo) return of(nome);

    return this.cadastrar(nome, tipo).pipe(
      map(() => null),
      catchError(() => {
        window.alert(`Não foi possível cadastrar "${nome}". Tente pelo menu Cadastros.`);
        return of(nome);
      }),
    );
  }

  private perguntarTipo(nome: string): TipoBeneficiado | null {
    for (;;) {
      const resposta = window.prompt(
        `"${nome}" é fornecedor ou profissional?\n\nDigite F para Fornecedor ou P para Profissional.`,
        'F',
      );
      if (resposta === null) return null;
      const letra = resposta.trim().charAt(0).toLowerCase();
      if (letra === 'f') return 'fornecedor';
      if (letra === 'p') return 'profissional';
    }
  }

  /** Acrescenta o beneficiado (só com o nome) ao cadastro escolhido. */
  private cadastrar(nome: string, tipo: TipoBeneficiado): Observable<boolean> {
    const fornecedor = tipo === 'fornecedor';
    const chave = fornecedor ? CHAVE_FORNECEDORES : CHAVE_EMPREITEIROS;
    const prefixo = fornecedor ? 'FORN' : 'EMP';

    return this.armazenamento.ler(chave).pipe(
      switchMap((bruto) => {
        const lista = lerLista(bruto);
        const maior = lista.reduce<number>((max, registro) => {
          const combinacao = new RegExp(`^${prefixo}-(\\d+)$`).exec(String(registro['codigo'] ?? '').trim());
          return combinacao && Number(combinacao[1]) > max ? Number(combinacao[1]) : max;
        }, 0);
        const codigo = `${prefixo}-${String(maior + 1).padStart(3, '0')}`;

        const novo: Record<string, unknown> = fornecedor
          ? {
              id: gerarId(),
              codigo,
              nome,
              tipo: 'PF',
              documento: '',
              endereco: '',
              especialidade: '',
              observacoes: '',
              contatos: [],
              dadosRecebimento: [],
              ativo: true,
            }
          : {
              id: gerarId(),
              codigo,
              nome,
              tipo: 'PF',
              documento: '',
              telefone: '',
              email: '',
              especialidade: '',
              valorDiaria: 0,
              vinculo: 'externo',
              ativo: true,
              observacoes: '',
              dadosRecebimento: [],
            };

        return this.armazenamento.gravar(chave, JSON.stringify([...lista, novo]));
      }),
      map((gravou) => {
        if (fornecedor) this.fornecedoresCadastro.carregar();
        return gravou;
      }),
    );
  }
}
