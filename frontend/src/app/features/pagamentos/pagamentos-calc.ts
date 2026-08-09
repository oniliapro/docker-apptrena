/**
 * Regras de cálculo de Pagamentos — funções puras, portadas de
 * js/shared/pagamentos-utils.js e js/pagamentos/01-state.js.
 *
 * Ficam separadas do componente de propósito: são as regras de negócio
 * que precisam produzir exatamente os mesmos números do app atual, e
 * assim podem ser testadas sem montar nenhuma tela.
 */

import {
  ItemPagamento,
  ItemPagamentoCalculado,
  ModoValor,
  Pagamento,
  TIPOS_CUSTO_PAGAMENTO,
} from './pagamentos.models';

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

/**
 * Lê número no formato brasileiro, tolerando "R$", "%", espaços,
 * separador de milhar e vírgula decimal. Ex.: "R$ 1.234,56" -> 1234.56
 */
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

export function normalizarItemPagamento(bruto: Partial<ItemPagamento> & Record<string, unknown>): ItemPagamento {
  return {
    id: bruto?.id ? String(bruto.id) : gerarId(),
    descricao: String(bruto?.descricao ?? bruto?.['desc'] ?? ''),
    tipo: String(bruto?.tipo ?? ''),
    eapId: String(bruto?.eapId ?? ''),
    valor: numeroSeguro(bruto?.valor),
    modoValor: normalizarModoValor(bruto?.modoValor),
  };
}

/**
 * Normaliza um pagamento vindo de qualquer versão do formato — incluindo
 * o "legado" de item único, em que tipo/eapId/valor ficavam direto no
 * pagamento, sem lista de itens.
 */
export function normalizarPagamento(bruto: Record<string, unknown>): Pagamento {
  const p = bruto ?? {};
  const brutoItens = (p['itens'] ?? p['items']) as unknown;
  const itens = Array.isArray(brutoItens)
    ? brutoItens.map((i) => normalizarItemPagamento(i as Record<string, unknown>))
    : [];

  const ehLegado = !itens.length && (p['tipo'] || p['eapId'] || p['valor']);
  if (ehLegado) {
    itens.push(
      normalizarItemPagamento({
        descricao: String(p['desc'] ?? p['descricao'] ?? ''),
        tipo: p['tipo'] as string,
        eapId: p['eapId'] as string,
        valor: p['valor'] as number,
        modoValor: 'valor',
      }),
    );
  }

  let valorTotal = numeroSeguro(p['valorTotal']);
  if (!(valorTotal > 0)) {
    // Só dá para somar os itens quando todos estão em reais; se algum for
    // percentual, a soma dependeria do total — que é justamente o que
    // estamos tentando descobrir.
    const todosEmReais = itens.every((it) => it.modoValor === 'valor');
    valorTotal = todosEmReais
      ? itens.reduce((soma, it) => soma + numeroSeguro(it.valor), 0)
      : numeroSeguro(p['valor']);
  }

  const data = String(p['date'] ?? '');

  return {
    id: p['id'] ? String(p['id']) : gerarId(),
    numeroPagamento: String(p['numeroPagamento'] ?? p['numero'] ?? ''),
    obraNumber: String(p['obraNumber'] ?? p['obra'] ?? ''),
    dataSolicitacao: String(p['dataSolicitacao'] ?? data),
    dataPagamento: String(p['dataPagamento'] ?? data),
    fornecedor: String(p['fornecedor'] ?? ''),
    descricao: String(p['descricao'] ?? p['desc'] ?? ''),
    valorTotal,
    itens,
    origem: p['origem'] ? { ...(p['origem'] as object) } : null,
    // Bug corrigido em 31/07/2026: pagamentos gravados antes de existir esse
    // campo (todo lançamento manual até aqui) não podem virar "pendente" do
    // nada — só entra como pendente o que for explicitamente marcado assim
    // (hoje, só o que a aba Mapas gera). Qualquer outra coisa é confirmado.
    status: p['status'] === 'pendente' ? 'pendente' : 'confirmado',
  };
}

/** Resolve o valor em reais de um item, aplicando o percentual se for o caso. */
export function calcularValorItem(item: Partial<ItemPagamento>, valorTotal: unknown): number {
  const total = numeroSeguro(valorTotal);
  const valor = numeroSeguro(item?.valor);
  return normalizarModoValor(item?.modoValor) === 'percentual' ? total * (valor / 100) : valor;
}

export function expandirItensPagamento(pagamento: Pagamento): ItemPagamentoCalculado[] {
  return pagamento.itens.map((item) => ({
    ...item,
    valorCalculado: calcularValorItem(item, pagamento.valorTotal),
  }));
}

export function calcularSomaItens(pagamento: Pagamento): number {
  return expandirItensPagamento(pagamento).reduce(
    (soma, item) => soma + numeroSeguro(item.valorCalculado),
    0,
  );
}

/**
 * Payload no formato snake_case que `PagamentoController::syncCompleto`
 * espera (POST/PUT /api/pagamentos) — espelha `paraFrontend()` no
 * controller, na direção contrária. `mapa_id`/`empreita_id` saem de
 * `origem`: são a mesma coisa que `origem.refId`, só que como coluna
 * própria (é o que o backend usa pra JOIN com Mapa/Empreita).
 */
export function paraPayloadApi(pagamento: Pagamento, obraId: string): Record<string, unknown> {
  const origemTipo = pagamento.origem?.tipo || 'manual';
  const origemRefId = pagamento.origem?.refId || null;

  return {
    numero_pagamento: pagamento.numeroPagamento,
    obra_id: obraId,
    obra_number: pagamento.obraNumber,
    data_solicitacao: pagamento.dataSolicitacao || null,
    data_pagamento: pagamento.dataPagamento || null,
    fornecedor: pagamento.fornecedor,
    descricao: pagamento.descricao,
    valor_total: pagamento.valorTotal,
    origem_tipo: origemTipo,
    origem_ref_id: origemRefId,
    mapa_id: origemTipo === 'mapa' ? origemRefId : null,
    empreita_id: origemTipo === 'empreita' ? origemRefId : null,
    status: pagamento.status,
    itens: pagamento.itens.map((item) => ({
      id: item.id,
      descricao: item.descricao,
      tipo: item.tipo || null,
      eapId: item.eapId || null,
      valor: item.valor,
      modoValor: item.modoValor,
    })),
  };
}

/** Próximo número no formato PG-0001, olhando o maior sufixo já usado. */
export function gerarNumeroPagamento(lista: Pagamento[]): string {
  const maior = (lista ?? []).reduce((max, p) => {
    const encontrado = String(p.numeroPagamento ?? '').match(/(\d+)$/);
    if (!encontrado) return max;
    const valor = Number(encontrado[1]);
    return Number.isFinite(valor) ? Math.max(max, valor) : max;
  }, 0);

  return `PG-${String(maior + 1).padStart(4, '0')}`;
}

export function rotuloTipo(chave: string): string {
  return TIPOS_CUSTO_PAGAMENTO.find((t) => t.chave === chave)?.rotulo || chave || '—';
}

/**
 * Erros que impedem o pagamento de ser salvo. A regra mais importante é
 * a última: a soma dos itens tem que bater com o total, com tolerância
 * de um centavo para absorver arredondamento de percentuais.
 */
export function validarPagamento(pagamento: Pagamento): string[] {
  const erros: string[] = [];

  if (!(pagamento.valorTotal > 0)) erros.push('Informe o valor total do pagamento.');
  if (!pagamento.itens.length) erros.push('Adicione pelo menos 1 item.');

  pagamento.itens.forEach((item, indice) => {
    if (!String(item.tipo ?? '').trim()) erros.push(`Item ${indice + 1}: selecione o tipo.`);
    if ((Number(item.valor) || 0) === 0) erros.push(`Item ${indice + 1}: informe o valor.`);
  });

  const diferenca = Math.abs(pagamento.valorTotal - calcularSomaItens(pagamento));
  if (diferenca > 0.01) {
    erros.push('A soma dos itens deve ser igual ao valor total do pagamento.');
  }

  return erros;
}
