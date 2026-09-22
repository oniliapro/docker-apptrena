/**
 * Motor de cálculo das Diárias (F7, 22/09/2026) — puro, sem Angular.
 *
 * O ponto delicado, que o Lucas pediu pra garantir com testes ANTES da tela:
 * ao fechar VÁRIAS diárias num mesmo Pagamento, os adicionais (vale
 * transporte, vale alimentação, combustível, valor extra) de UMA diária só
 * podem ser rateados entre as etapas DAQUELA diária — nunca entre as etapas
 * de outra diária do mesmo lote. `gerarItensPagamento` garante isso
 * processando cada diária isoladamente (nunca soma valores de diárias
 * diferentes antes de aplicar o percentual de cada uma).
 */
import { ChaveTipo } from '../eap/eap.models';
import { CampoDiaria, CAMPOS_DIARIA, CategoriasDiaria, Diaria, EtapaDiaria, ROTULO_CAMPO_DIARIA } from './diarias.models';

/** Valor da diária em si (sem os adicionais): a base do cadastro, pela metade se for meia diária. */
export function valorDiaria(d: Pick<Diaria, 'valorDiariaBase' | 'meiaDiaria'>): number {
  const base = Number(d.valorDiariaBase) || 0;
  return d.meiaDiaria ? base / 2 : base;
}

/** Valor de um campo específico (a diária em si ou um dos 4 adicionais). */
export function valorDoCampo(d: Diaria, campo: CampoDiaria): number {
  if (campo === 'diaria') return valorDiaria(d);
  return Number(d[campo]) || 0;
}

/** Diária + todos os adicionais — o valor total do lançamento. */
export function valorTotalDiaria(d: Diaria): number {
  return CAMPOS_DIARIA.reduce((soma, campo) => soma + valorDoCampo(d, campo), 0);
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(6));
}

/**
 * Erro nas etapas de uma diária (etapa vazia, percentual inválido, soma
 * diferente de 100, etapa repetida), ou `null` se está tudo certo.
 * Tolerância de 0,05 na soma — cobre arredondamentos comuns tipo
 * 33,33 + 33,33 + 33,34.
 */
export function erroDasEtapas(etapas: EtapaDiaria[]): string | null {
  if (!etapas.length) return 'Informe ao menos uma etapa da EAP.';

  const vistos = new Set<string>();
  for (const etapa of etapas) {
    if (!etapa.eapItemId) return 'Etapa da EAP não informada.';
    if (vistos.has(etapa.eapItemId)) return 'A mesma etapa foi informada mais de uma vez.';
    vistos.add(etapa.eapItemId);
    if (!(Number(etapa.percentual) > 0)) return 'O percentual de cada etapa precisa ser maior que zero.';
  }

  const soma = etapas.reduce((s, e) => s + (Number(e.percentual) || 0), 0);
  if (Math.abs(soma - 100) > 0.05) {
    return `A soma dos percentuais das etapas precisa ser 100% (está em ${soma.toFixed(2).replace('.', ',')}%).`;
  }
  return null;
}

/** Por que esta diária não pode ser fechada agora, ou `null` se pode. */
export function erroParaFechar(d: Diaria): string | null {
  if (d.status === 'fechada') return 'Esta diária já foi fechada — não pode gerar pagamento de novo.';
  if (!(valorTotalDiaria(d) > 0)) return 'O valor total da diária é zero.';
  return erroDasEtapas(d.etapas);
}

export interface ItemPagamentoGerado {
  descricao: string;
  tipo: ChaveTipo;
  eapId: string;
  valor: number;
  /** De onde este item veio — pra rastrear/auditar depois que virou Pagamento. */
  diariaId: string;
  profissionalId: string;
  campo: CampoDiaria;
}

export interface ResultadoFechamento {
  /** Um item de Pagamento por (diária × campo com valor > 0 × etapa) — nunca soma entre diárias diferentes. */
  itens: ItemPagamentoGerado[];
  /** Diárias que não puderam ser fechadas, com o motivo (chave = `Diaria.id`). */
  erros: Map<string, string>;
  /** Soma de `itens` — o que vai virar `valor_total` do Pagamento. */
  total: number;
}

/**
 * Gera os itens de Pagamento para fechar uma ou mais diárias de uma vez.
 * Cada diária é resolvida isoladamente: o valor de cada campo dela (diária
 * + adicionais) é dividido só entre AS PRÓPRIAS etapas, pelo percentual de
 * cada uma. Diárias com etapas inválidas ou já fechadas ficam de fora de
 * `itens` e entram em `erros` — as outras são geradas normalmente.
 */
export function gerarItensPagamento(diarias: Diaria[], categorias: CategoriasDiaria): ResultadoFechamento {
  const erros = new Map<string, string>();
  const itens: ItemPagamentoGerado[] = [];

  for (const diaria of diarias) {
    const erro = erroParaFechar(diaria);
    if (erro) {
      erros.set(diaria.id, erro);
      continue;
    }

    for (const campo of CAMPOS_DIARIA) {
      const valorCampo = valorDoCampo(diaria, campo);
      if (!(valorCampo > 0)) continue;

      for (const etapa of diaria.etapas) {
        const valor = arredondar(valorCampo * (etapa.percentual / 100));
        if (!(valor > 0)) continue;

        itens.push({
          descricao: `${diaria.profissionalNome} — ${ROTULO_CAMPO_DIARIA[campo]} (${diaria.data})`,
          tipo: categorias[campo],
          eapId: etapa.eapItemId,
          valor,
          diariaId: diaria.id,
          profissionalId: diaria.profissionalId,
          campo,
        });
      }
    }
  }

  const total = arredondar(itens.reduce((soma, item) => soma + item.valor, 0));
  return { itens, erros, total };
}
