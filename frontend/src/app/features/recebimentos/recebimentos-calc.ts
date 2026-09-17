/**
 * Regras de cálculo de Recebimentos (01/09/2026) — mirror de
 * `pagamentos-calc.ts`, sem os campos específicos de Empreita
 * (parcela/empreitaItemId/valorReferencia), que não fazem sentido aqui.
 */

import {
  ItemRecebimento,
  ItemRecebimentoCalculado,
  ModoValor,
  Recebimento,
  TIPOS_CUSTO_RECEBIMENTO,
} from './recebimentos.models';

export function gerarId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function numeroSeguro(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Lê número no formato brasileiro, tolerando "R$", "%", espaços, separador de milhar e vírgula decimal. */
export function parsearBR(entrada: unknown): number {
  const limpo = String(entrada ?? '')
    .replace(/[R$\s%]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return Number(limpo) || 0;
}

export function formatarPercentual(valor: unknown): string {
  return (Number(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' %';
}

export function normalizarModoValor(bruto: unknown): ModoValor {
  const m = String(bruto ?? '').toLowerCase();
  return m === 'percentual' || m === 'pct' || m === '%' || m === 'percent' ? 'percentual' : 'valor';
}

export function normalizarItemRecebimento(
  bruto: Partial<ItemRecebimento> & Record<string, unknown>,
): ItemRecebimento {
  return {
    id: bruto?.id ? String(bruto.id) : gerarId(),
    descricao: String(bruto?.descricao ?? bruto?.['desc'] ?? ''),
    tipo: String(bruto?.tipo ?? ''),
    eapId: String(bruto?.eapId ?? ''),
    valor: numeroSeguro(bruto?.valor),
    modoValor: normalizarModoValor(bruto?.modoValor),
  };
}

export function normalizarRecebimento(bruto: Record<string, unknown>): Recebimento {
  const r = bruto ?? {};
  const brutoItens = (r['itens'] ?? r['items']) as unknown;
  const itens = Array.isArray(brutoItens)
    ? brutoItens.map((i) => normalizarItemRecebimento(i as Record<string, unknown>))
    : [];

  let valorTotal = numeroSeguro(r['valorTotal']);
  if (!(valorTotal > 0)) {
    const todosEmReais = itens.every((it) => it.modoValor === 'valor');
    valorTotal = todosEmReais ? itens.reduce((soma, it) => soma + numeroSeguro(it.valor), 0) : 0;
  }

  return {
    id: r['id'] ? String(r['id']) : gerarId(),
    numeroRecebimento: String(r['numeroRecebimento'] ?? ''),
    obraId: r['obraId'] ? String(r['obraId']) : undefined,
    obraNome: r['obraNome'] ? String(r['obraNome']) : undefined,
    obraNumber: String(r['obraNumber'] ?? ''),
    dataSolicitacao: String(r['dataSolicitacao'] ?? ''),
    dataRecebimento: String(r['dataRecebimento'] ?? ''),
    cliente: String(r['cliente'] ?? ''),
    descricao: String(r['descricao'] ?? ''),
    valorTotal,
    itens,
    origem: r['origem'] ? { ...(r['origem'] as object) } : null,
    status: r['status'] === 'pendente' ? 'pendente' : 'confirmado',
    anexosCount: numeroSeguro(r['anexosCount']),
  };
}

/** Resolve o valor em reais de um item, aplicando o percentual se for o caso. */
export function calcularValorItem(item: Partial<ItemRecebimento>, valorTotal: unknown): number {
  const total = numeroSeguro(valorTotal);
  const valor = numeroSeguro(item?.valor);
  return normalizarModoValor(item?.modoValor) === 'percentual' ? total * (valor / 100) : valor;
}

export function expandirItensRecebimento(recebimento: Recebimento): ItemRecebimentoCalculado[] {
  return recebimento.itens.map((item) => ({
    ...item,
    valorCalculado: calcularValorItem(item, recebimento.valorTotal),
  }));
}

export function calcularSomaItens(recebimento: Recebimento): number {
  return expandirItensRecebimento(recebimento).reduce(
    (soma, item) => soma + numeroSeguro(item.valorCalculado),
    0,
  );
}

/**
 * Payload no formato snake_case que `RecebimentoController::syncCompleto`
 * espera (POST/PUT /api/recebimentos) — mirror de
 * `pagamentos-calc.ts::paraPayloadApi`.
 */
export function paraPayloadApi(recebimento: Recebimento, obraId: string): Record<string, unknown> {
  const origemTipo = recebimento.origem?.tipo || 'manual';
  const origemRefId = recebimento.origem?.refId || null;

  return {
    numero_recebimento: recebimento.numeroRecebimento,
    obra_id: obraId,
    obra_number: recebimento.obraNumber,
    data_solicitacao: recebimento.dataSolicitacao || null,
    data_recebimento: recebimento.dataRecebimento || null,
    cliente: recebimento.cliente,
    descricao: recebimento.descricao,
    valor_total: recebimento.valorTotal,
    origem_tipo: origemTipo,
    origem_ref_id: origemRefId,
    medicao_id: origemTipo === 'medicao' ? origemRefId : null,
    status: recebimento.status,
    itens: recebimento.itens.map((item) => ({
      id: item.id,
      descricao: item.descricao,
      tipo: item.tipo || null,
      eapId: item.eapId || null,
      valor: item.valor,
      modoValor: item.modoValor,
    })),
  };
}

/** Próximo número no formato RC-0001, olhando o maior sufixo já usado. */
export function gerarNumeroRecebimento(lista: Recebimento[]): string {
  const maior = (lista ?? []).reduce((max, r) => {
    const encontrado = String(r.numeroRecebimento ?? '').match(/(\d+)$/);
    if (!encontrado) return max;
    const valor = Number(encontrado[1]);
    return Number.isFinite(valor) ? Math.max(max, valor) : max;
  }, 0);

  return `RC-${String(maior + 1).padStart(4, '0')}`;
}

export function rotuloTipo(chave: string): string {
  return TIPOS_CUSTO_RECEBIMENTO.find((t) => t.chave === chave)?.rotulo || chave || '—';
}

/**
 * Erros que impedem o recebimento de ser salvo — mirror de
 * `pagamentos-calc.ts::validarPagamento`.
 */
export function validarRecebimento(recebimento: Recebimento): string[] {
  const erros: string[] = [];

  if (!(recebimento.valorTotal > 0)) erros.push('Informe o valor total do recebimento.');
  if (!recebimento.itens.length) erros.push('Adicione pelo menos 1 item.');

  recebimento.itens.forEach((item, indice) => {
    if (!String(item.tipo ?? '').trim()) erros.push(`Item ${indice + 1}: selecione o tipo.`);
    if ((Number(item.valor) || 0) === 0) erros.push(`Item ${indice + 1}: informe o valor.`);
  });

  const diferenca = Math.abs(recebimento.valorTotal - calcularSomaItens(recebimento));
  if (diferenca > 0.01) {
    erros.push('A soma dos itens deve ser igual ao valor total do recebimento.');
  }

  return erros;
}
