/**
 * Rateio dos resumos do Mapa — portado de js/mapa/04b-summaries.js.
 *
 * ------------------------------------------------------------------
 * O que estes cálculos resolvem
 * ------------------------------------------------------------------
 * Depois de decidir de quem comprar cada item, ainda falta responder:
 * **de qual etapa da obra sai esse dinheiro?** Um mesmo item pode
 * atender duas etapas, e o frete e o desconto de uma nota precisam ser
 * divididos entre as etapas que aquela nota atende.
 *
 * A divisão é feita em percentual, e começa proporcional ao valor de
 * cada etapa. Mas o usuário pode **travar** um percentual — "desta etapa
 * eu quero exatamente 30% do frete" — e então o restante se redistribui
 * entre as destravadas, mantendo a soma em 100%.
 *
 * É esse jogo entre valores travados e redistribuição automática que
 * estas funções implementam. Diferente do original, elas não alteram um
 * objeto de estado global: recebem o que precisam e devolvem valores
 * novos, o que permitiu testá-las contra o app antigo.
 * ------------------------------------------------------------------
 */

/** Uma etapa de obra à qual parte de um item se destina. */
export interface EtapaDoItem {
  eapId: string;
  valor: number;
}

/** Quanto do valor de um item vai para cada etapa. */
export interface RateioEtapa {
  etapaKey: string;
  /** Fração de 0 a 1. */
  fator: number;
}

/** Item visto pelo cálculo de rateio. */
export interface ItemComEtapas {
  etapa?: string;
  etapas?: EtapaDoItem[];
  /** "percentual" (padrão) ou "quantidade". */
  modoEtapa?: string;
}

export const ETAPA_SEM_NOME = 'Sem etapa';

/**
 * Etapas de um item. Aceita o formato novo (lista `etapas`) e o antigo
 * (campo único `etapa`, que equivale a 100% numa só etapa).
 */
export function obterEtapasDoItem(item: ItemComEtapas | null | undefined): EtapaDoItem[] {
  if (Array.isArray(item?.etapas) && item.etapas.length) return item.etapas;

  const etapa = String(item?.etapa ?? '').trim();
  return etapa ? [{ eapId: etapa, valor: 100 }] : [];
}

/**
 * Divide o valor de um item entre suas etapas.
 *
 * Nos dois modos — percentual e quantidade — o cálculo é o mesmo: cada
 * etapa fica com sua parte do total informado. A diferença é só de
 * intenção: em "quantidade" o usuário digita unidades físicas em vez de
 * porcentagens, e a soma delas passa a ser o denominador.
 *
 * Item sem etapa cai numa etapa fictícia, para o dinheiro não
 * desaparecer do resumo.
 */
export function obterRateiosDoItem(item: ItemComEtapas | null | undefined): RateioEtapa[] {
  const etapas = obterEtapasDoItem(item);
  if (!etapas.length) return [{ etapaKey: ETAPA_SEM_NOME, fator: 1 }];

  const soma = etapas.reduce((acc, e) => acc + (Number(e?.valor) || 0), 0);

  return etapas.map((e) => ({
    etapaKey: String(e.eapId || ETAPA_SEM_NOME),
    fator: soma > 0 ? (Number(e.valor) || 0) / soma : 0,
  }));
}

/**
 * Redistribui percentuais entre etapas, respeitando as travadas.
 *
 * Regras, na ordem em que importam:
 *
 *  1. Só entram etapas com base maior que zero — não há o que ratear em
 *     etapa sem valor.
 *  2. Se as travadas já somam mais de 100%, elas são normalizadas
 *     proporcionalmente para caber em 100% e as destravadas vão a zero.
 *     Preferir isso a recusar a entrada evita deixar o usuário preso num
 *     estado que ele mesmo criou.
 *  3. O que resta de 100% se divide entre as destravadas, proporcional à
 *     base de cada uma.
 *  4. Sem base nenhuma nas destravadas, divide igualmente — melhor que
 *     dividir por zero.
 *
 * @returns novo mapa etapa → percentual
 */
export function redistribuirPercentuaisPorEtapa(
  etapas: string[],
  basePorEtapa: Map<string, number>,
  percentuaisAtuais: Record<string, number>,
  travadas: Record<string, boolean>,
): Record<string, number> {
  const resultado: Record<string, number> = { ...percentuaisAtuais };

  const ativas = etapas.filter((e) => (basePorEtapa.get(e) || 0) > 0);
  if (!ativas.length) return resultado;

  const travadasAtivas: Array<{ etapa: string; percentual: number }> = [];
  const destravadas: string[] = [];

  for (const etapa of ativas) {
    if (travadas[etapa]) {
      travadasAtivas.push({ etapa, percentual: Number(percentuaisAtuais[etapa]) || 0 });
    } else {
      destravadas.push(etapa);
    }
  }

  const somaTravadas = travadasAtivas.reduce((acc, t) => acc + t.percentual, 0);

  // Travadas estouraram 100%: normaliza e zera o resto.
  if (somaTravadas > 100) {
    const fator = 100 / somaTravadas;
    for (const t of travadasAtivas) resultado[t.etapa] = t.percentual * fator;
    for (const e of destravadas) resultado[e] = 0;
    return resultado;
  }

  if (!destravadas.length) return resultado;

  const restante = 100 - somaTravadas;
  const somaPesos = destravadas.reduce((acc, e) => acc + (basePorEtapa.get(e) || 0), 0);

  if (somaPesos <= 0) {
    const cada = restante / destravadas.length;
    for (const e of destravadas) resultado[e] = cada;
    return resultado;
  }

  for (const e of destravadas) {
    resultado[e] = restante * ((basePorEtapa.get(e) || 0) / somaPesos);
  }

  return resultado;
}
