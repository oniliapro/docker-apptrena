/**
 * Opções do PDF da Empreita (25/09/2026, pedido do Lucas) — antes de gerar,
 * um popup pergunta O QUE mostrar. Todas as colunas (Contrato, Medição, Já
 * pago, Pagamento, Saldo após pagamento) e os Pagamentos registrados
 * aparecem sempre; a escolha decide QUAIS VALORES entram neles:
 *
 *  - `empreiteiro`: só os valores do empreiteiro (contrato, já pago,
 *    pagamento, saldo, pagamentos registrados). Serviços sem valor do
 *    empreiteiro somem da tabela.
 *  - `reserva`: idem, só a reserva (e os serviços sem reserva somem).
 *  - `total`: os totais de cada bloco, o "Saldo disp.", a linha "Etapa" do
 *    saldo após pagamento, o "Saldo empreita" dos pagamentos e o painel
 *    "Contrato x orçado". Com "Total" marcado nenhum serviço é escondido.
 *
 * Podem ser combinadas: cada bloco mostra as linhas das opções marcadas, e um
 * serviço só some se NENHUMA das opções marcadas tem valor nele.
 *
 * Trafegam como `?opcoes=empreiteiro,reserva,total` até `EmpreitaImprimir`
 * (mesmo mecanismo stateless de `token`/`apiUrl`) — só as chaves LIGADAS vão
 * na lista; sem o parâmetro, tudo aparece.
 */
export interface OpcoesPdfEmpreita {
  empreiteiro: boolean;
  reserva: boolean;
  total: boolean;
}

export const OPCOES_PDF_EMPREITA_TODAS: OpcoesPdfEmpreita = {
  empreiteiro: true,
  reserva: true,
  total: true,
};

export const CHAVES_OPCOES_PDF_EMPREITA = Object.keys(OPCOES_PDF_EMPREITA_TODAS) as (keyof OpcoesPdfEmpreita)[];

export const ROTULOS_OPCOES_PDF_EMPREITA: Record<keyof OpcoesPdfEmpreita, string> = {
  empreiteiro: 'Valor do empreiteiro',
  reserva: 'Reserva',
  total: 'Total',
};

/** Explicação curta de cada opção, mostrada embaixo dela no popup. */
export const DICAS_OPCOES_PDF_EMPREITA: Record<keyof OpcoesPdfEmpreita, string> = {
  empreiteiro: 'Só as informações do empreiteiro; serviços sem valor dele não aparecem.',
  reserva: 'Só as informações da reserva; serviços sem reserva não aparecem.',
  total: 'Totais, saldo disponível e "Contrato x orçado"; mostra todos os serviços.',
};

/**
 * Ponto de partida do popup a partir do "Simplificar" da tela: simplificado
 * mostra só o Total; desmarcado, tudo.
 */
export function opcoesDoSimplificado(simplificado: boolean): OpcoesPdfEmpreita {
  return { empreiteiro: !simplificado, reserva: !simplificado, total: true };
}

/** Lê `?opcoes=` da tela de impressão. `null` (parâmetro ausente) = mostra tudo. */
export function lerOpcoesPdfEmpreita(bruto: string | null): OpcoesPdfEmpreita {
  if (bruto === null) return { ...OPCOES_PDF_EMPREITA_TODAS };
  const ligadas = new Set(bruto.split(',').map((chave) => chave.trim()));
  return {
    empreiteiro: ligadas.has('empreiteiro'),
    reserva: ligadas.has('reserva'),
    total: ligadas.has('total'),
  };
}

/**
 * Colunas visíveis da tabela de serviços (25/09/2026, pedido do Lucas — "opção
 * de definir as colunas que serão visíveis também"). "#" e "Serviço" são
 * fixas. `medicao` é o bloco logo depois do Contrato: "Quantidades" enquanto
 * a empreita está em edição, "Medição de contrato" depois de confirmada;
 * `jaPago`, `pagamento` e `saldoApos` só existem na empreita confirmada.
 *
 * Trafegam como `?colunas=tipo,etapa,...` (só as LIGADAS); sem o parâmetro,
 * todas aparecem.
 */
export interface ColunasPdfEmpreita {
  tipo: boolean;
  etapa: boolean;
  contrato: boolean;
  medicao: boolean;
  jaPago: boolean;
  pagamento: boolean;
  saldoApos: boolean;
}

export const COLUNAS_PDF_EMPREITA_TODAS: ColunasPdfEmpreita = {
  tipo: true,
  etapa: true,
  contrato: true,
  medicao: true,
  jaPago: true,
  pagamento: true,
  saldoApos: true,
};

export const CHAVES_COLUNAS_PDF_EMPREITA = Object.keys(COLUNAS_PDF_EMPREITA_TODAS) as (keyof ColunasPdfEmpreita)[];

/** Rótulo de cada coluna no popup; `medicao` muda conforme a empreita esteja confirmada ou não. */
export function rotuloColunaPdfEmpreita(chave: keyof ColunasPdfEmpreita, confirmada: boolean): string {
  switch (chave) {
    case 'tipo': return 'Tipo';
    case 'etapa': return 'Etapa (EAP)';
    case 'contrato': return 'Contrato';
    case 'medicao': return confirmada ? 'Medição de contrato' : 'Quantidades';
    case 'jaPago': return 'Já pago';
    case 'pagamento': return 'Pagamento';
    case 'saldoApos': return 'Saldo após pagamento';
  }
}

/** Colunas que existem na tela de impressão — as três últimas só com a empreita confirmada. */
export function chavesColunasDisponiveis(confirmada: boolean): (keyof ColunasPdfEmpreita)[] {
  return CHAVES_COLUNAS_PDF_EMPREITA.filter(
    (chave) => confirmada || (chave !== 'jaPago' && chave !== 'pagamento' && chave !== 'saldoApos'),
  );
}

/** Lê `?colunas=` da tela de impressão. `null` (parâmetro ausente) = todas. */
export function lerColunasPdfEmpreita(bruto: string | null): ColunasPdfEmpreita {
  if (bruto === null) return { ...COLUNAS_PDF_EMPREITA_TODAS };
  const ligadas = new Set(bruto.split(',').map((chave) => chave.trim()));
  const resultado = { ...COLUNAS_PDF_EMPREITA_TODAS };
  for (const chave of CHAVES_COLUNAS_PDF_EMPREITA) resultado[chave] = ligadas.has(chave);
  return resultado;
}
