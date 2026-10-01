/**
 * Realizado da EAP a partir dos pagamentos (F5, 21/09/2026) — puro, sem Angular.
 *
 * Só pagamentos CONFIRMADOS contam. Separa o que tem etapa (`eapId`) do que não
 * tem ("S/ Definição"); dentro de cada grupo só as 5 categorias padrão entram
 * (item de pagamento com tipo fora delas vira a coluna "S/ Categoria", que as
 * fórmulas não usam). É a mesma conta que a tela da EAP mostra no Realizado e
 * que o motor de fórmulas usa em `Real.*` e `Saldo.*`.
 */
import { expandirItensPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { ContextoRealizado } from './eap-formulas';
import { criarVazioPorTipo } from './eap-normalize';
import { ChaveTipo, PorTipo, TIPOS_CUSTO } from './eap.models';

export function calcularContextoRealizado(pagamentos: Pagamento[]): ContextoRealizado {
  return calcularContexto(pagamentos, 'confirmado');
}

/**
 * Mesma conta de `calcularContextoRealizado`, só que para pagamentos
 * PENDENTES (01/10/2026, "saldo não comprometido" da EAP) — a soma de
 * "qualquer pagamento que estiver em aberto", por item×categoria. Mesma
 * fonte/estrutura, só o filtro de status muda.
 */
export function calcularContextoPendente(pagamentos: Pagamento[]): ContextoRealizado {
  return calcularContexto(pagamentos, 'pendente');
}

function calcularContexto(pagamentos: Pagamento[], status: 'confirmado' | 'pendente'): ContextoRealizado {
  const quer = status === 'pendente';
  const chaves = new Set(TIPOS_CUSTO.map((t) => t.chave));
  const porItem = new Map<string, PorTipo>();
  const semDefinicao = criarVazioPorTipo();

  for (const pagamento of pagamentos) {
    if ((pagamento.status === 'pendente') !== quer) continue;
    for (const item of expandirItensPagamento(pagamento)) {
      const tipo = item.tipo as ChaveTipo;
      if (!chaves.has(tipo)) continue;
      if (item.eapId) {
        const atual = porItem.get(item.eapId) ?? criarVazioPorTipo();
        atual[tipo] += item.valorCalculado;
        porItem.set(item.eapId, atual);
      } else {
        semDefinicao[tipo] += item.valorCalculado;
      }
    }
  }
  return { porItem, semDefinicao };
}
