/**
 * Diária: texto bruto da API (ou de um formulário) ⇄ `Diaria` tipada
 * (F7, 22/09/2026). Mesma ideia de `eap-normalize.ts`/`pagamentos-calc.ts`
 * — nunca confia cegamente no formato de fora.
 */
import { CategoriasDiaria, Diaria, EtapaDiaria, StatusDiaria } from './diarias.models';

function numero(valor: unknown): number {
  return Number(valor) || 0;
}

function normalizarEtapa(bruto: unknown): EtapaDiaria | null {
  const item = bruto as Record<string, unknown>;
  const eapItemId = String(item?.['eapItemId'] ?? item?.['eap_item_id'] ?? '');
  if (!eapItemId) return null;
  return { eapItemId, percentual: numero(item?.['percentual']) };
}

export function normalizarDiaria(bruto: Record<string, unknown>): Diaria {
  const etapasBrutas = Array.isArray(bruto['etapas']) ? bruto['etapas'] : [];
  const status = bruto['status'] === 'fechada' ? 'fechada' : ('rascunho' as StatusDiaria);

  return {
    id: String(bruto['id'] ?? ''),
    obraId: String(bruto['obraId'] ?? bruto['obra_id'] ?? ''),
    profissionalId: String(bruto['profissionalId'] ?? bruto['profissional_id'] ?? ''),
    profissionalNome: String(bruto['profissionalNome'] ?? bruto['profissional_nome'] ?? ''),
    profissionalFuncao: String(bruto['profissionalFuncao'] ?? bruto['profissional_funcao'] ?? ''),
    data: String(bruto['data'] ?? ''),
    meiaDiaria: Boolean(bruto['meiaDiaria'] ?? bruto['meia_diaria']),
    valorDiariaBase: numero(bruto['valorDiariaBase'] ?? bruto['valor_diaria_base']),
    etapas: etapasBrutas.map(normalizarEtapa).filter((e): e is EtapaDiaria => e !== null),
    valeTransporte: numero(bruto['valeTransporte'] ?? bruto['vale_transporte']),
    valeAlimentacao: numero(bruto['valeAlimentacao'] ?? bruto['vale_alimentacao']),
    combustivel: numero(bruto['combustivel']),
    valorExtra: numero(bruto['valorExtra'] ?? bruto['valor_extra']),
    observacoes: String(bruto['observacoes'] ?? ''),
    status,
    pagamentoId: bruto['pagamentoId'] ? String(bruto['pagamentoId']) : (bruto['pagamento_id'] ? String(bruto['pagamento_id']) : null),
    origem: bruto['origem'] === 'rdo' ? 'rdo' : 'manual',
  };
}

/** Payload no formato que o backend espera (`DiariaController::validarDiaria`). */
export interface PayloadDiaria {
  profissional_id: string;
  profissional_nome: string;
  profissional_funcao: string;
  data: string;
  meia_diaria: boolean;
  valor_diaria_base: number;
  vale_transporte: number;
  vale_alimentacao: number;
  combustivel: number;
  valor_extra: number;
  observacoes: string;
  etapas: { eap_item_id: string; percentual: number }[];
}

export function paraPayload(d: Diaria): PayloadDiaria {
  return {
    profissional_id: d.profissionalId,
    profissional_nome: d.profissionalNome,
    profissional_funcao: d.profissionalFuncao,
    data: d.data,
    meia_diaria: d.meiaDiaria,
    valor_diaria_base: d.valorDiariaBase,
    vale_transporte: d.valeTransporte,
    vale_alimentacao: d.valeAlimentacao,
    combustivel: d.combustivel,
    valor_extra: d.valorExtra,
    observacoes: d.observacoes,
    etapas: d.etapas.map((e) => ({ eap_item_id: e.eapItemId, percentual: e.percentual })),
  };
}

/** Categorias: a API só devolve as linhas que a empresa customizou — completa com o padrão. */
export function normalizarCategorias(bruto: unknown, padrao: CategoriasDiaria): CategoriasDiaria {
  const objeto = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const resultado = { ...padrao };
  for (const campo of Object.keys(padrao) as Array<keyof CategoriasDiaria>) {
    const valor = objeto[campo];
    if (typeof valor === 'string' && valor) resultado[campo] = valor as CategoriasDiaria[typeof campo];
  }
  return resultado;
}
