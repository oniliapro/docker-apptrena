/**
 * Normalização do estado da EAP — portado de js/eap/02-state-utils.js.
 *
 * Toda entrada vinda do storage passa por aqui antes de ser usada. O
 * app tem dados gravados em formatos de várias épocas, e é este arquivo
 * que os concilia — inclusive o formato legado, em que os custos vinham
 * em `costs.orcado` em vez de `unit`.
 */

import {
  BdiDoTipo,
  CabecalhoObra,
  ChaveTipo,
  EscopoBdi,
  EstadoUi,
  ItemEap,
  ModoBdi,
  PorTipo,
  TIPOS_CUSTO,
} from './eap.models';

/** "1.2" é descendente de "1"; "12" não é. O ponto evita o falso positivo. */
export function ehDescendente(eapPai: string, eapFilho: string): boolean {
  const pai = String(eapPai ?? '').trim();
  const filho = String(eapFilho ?? '').trim();
  if (!pai || !filho) return false;
  return filho.startsWith(pai + '.');
}

/** Nível de recuo visual: "1.2.3" recua dois níveis. Usado pela EAP e pelo Cronograma de Desembolso. */
export function recuoDoCodigoEap(codigoEap: string): number {
  return Math.max(0, String(codigoEap ?? '').split('.').filter(Boolean).length - 1);
}

/**
 * Ids ocultos por causa de recolher/expandir grupos (17/08/2026, pedido
 * do Lucas — EAP e Cronograma de Desembolso). Um item some quando
 * QUALQUER um dos seus ancestrais (não só o pai direto) está na lista de
 * colapsados — é assim que recolher o grupo "1" esconde "1.1", "1.1.2"
 * etc., todos de uma vez. O estado de cada grupo é independente: se
 * "1.1" também estiver marcado como colapsado, reabrir "1" não reabre
 * "1.1" — ele continua escondendo os próprios descendentes.
 */
export function itensOcultosPorColapso<T extends { id: string; eap: string }>(
  itens: T[],
  colapsados: ReadonlySet<string>,
): Set<string> {
  const ocultos = new Set<string>();
  if (!colapsados.size) return ocultos;

  const codigosColapsados = itens.filter((i) => colapsados.has(i.id)).map((i) => i.eap);
  if (!codigosColapsados.length) return ocultos;

  for (const item of itens) {
    if (codigosColapsados.some((pai) => ehDescendente(pai, item.eap))) ocultos.add(item.id);
  }
  return ocultos;
}

export function gerarId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function criarVazioPorTipo(): PorTipo {
  return TIPOS_CUSTO.reduce((acc, t) => {
    acc[t.chave] = 0;
    return acc;
  }, {} as PorTipo);
}

export function normalizarPorTipo(bruto: unknown): PorTipo {
  const origem = (bruto ?? {}) as Record<string, unknown>;
  return TIPOS_CUSTO.reduce((acc, t) => {
    acc[t.chave] = Number(origem[t.chave]) || 0;
    return acc;
  }, {} as PorTipo);
}

export function somarPorTipo(valores: Partial<PorTipo> | undefined): number {
  return TIPOS_CUSTO.reduce((soma, t) => soma + (Number(valores?.[t.chave]) || 0), 0);
}

export function multiplicarPorTipo(valores: Partial<PorTipo> | undefined, fator: unknown): PorTipo {
  const f = Number(fator) || 0;
  return TIPOS_CUSTO.reduce((acc, t) => {
    acc[t.chave] = (Number(valores?.[t.chave]) || 0) * f;
    return acc;
  }, {} as PorTipo);
}

/** Soma `adicional` dentro de `alvo`, alterando-o. */
export function somarEmPorTipo(alvo: PorTipo, adicional: Partial<PorTipo> | undefined): PorTipo {
  TIPOS_CUSTO.forEach((t) => {
    alvo[t.chave] = (Number(alvo[t.chave]) || 0) + (Number(adicional?.[t.chave]) || 0);
  });
  return alvo;
}

/**
 * Decide entre percentual e valor absoluto.
 *
 * Quando o modo vem explícito, respeita. Quando não vem — dado antigo,
 * importação — deduz por qual dos dois campos está preenchido, com
 * empate resolvido a favor de "value".
 */
export function normalizarModoBdi(modoBruto: unknown, valor: unknown, percentual: unknown): ModoBdi {
  const modo = String(modoBruto ?? '').toLowerCase();
  if (modo === 'pct' || modo === 'value') return modo;

  const v = Number(valor) || 0;
  const p = Number(percentual) || 0;

  if (v > 0 && p <= 0) return 'value';
  if (p > 0 && v <= 0) return 'pct';
  return v > 0 ? 'value' : 'pct';
}

export function cabecalhoVazio(): CabecalhoObra {
  return {
    mapNumber: '',
    obraNome: '',
    cliente: '',
    dataBase: '',
    responsavel: '',
    local: '',
    periodo: '',
    obs: '',
    bdiScope: 'global',
    bdiMode: 'pct',
    bdiPercent: 0,
    bdiValue: 0,
    bdiByType: TIPOS_CUSTO.reduce((acc, t) => {
      acc[t.chave] = { mode: 'pct', percent: 0, value: 0 };
      return acc;
    }, {} as Record<ChaveTipo, BdiDoTipo>),
    isConfirmed: false,
    confirmedAt: '',
  };
}

export function normalizarCabecalho(bruto: Record<string, unknown> | null | undefined): CabecalhoObra {
  const raw = bruto ?? {};
  const cabecalho = cabecalhoVazio();

  cabecalho.mapNumber = String(raw['mapNumber'] ?? '');
  cabecalho.obraNome = String(raw['obraNome'] ?? '');
  cabecalho.cliente = String(raw['cliente'] ?? '');
  cabecalho.dataBase = String(raw['dataBase'] ?? '');
  cabecalho.responsavel = String(raw['responsavel'] ?? '');
  cabecalho.local = String(raw['local'] ?? '');
  cabecalho.periodo = String(raw['periodo'] ?? '');
  cabecalho.obs = String(raw['obs'] ?? '');

  const escopo = String(raw['bdiScope'] ?? '').toLowerCase();
  cabecalho.bdiScope =
    escopo === 'global' || escopo === 'category' || escopo === 'item'
      ? (escopo as EscopoBdi)
      : 'global';

  cabecalho.bdiMode = normalizarModoBdi(raw['bdiMode'], raw['bdiValue'], raw['bdiPercent']);
  cabecalho.bdiPercent = Number(raw['bdiPercent']) || 0;
  cabecalho.bdiValue = Number(raw['bdiValue']) || 0;

  // `bdiByCategory` é o nome antigo de `bdiByType`.
  const porTipoBruto = (raw['bdiByType'] ?? {}) as Record<string, unknown>;
  const porCategoriaBruto = (raw['bdiByCategory'] ?? {}) as Record<string, unknown>;

  cabecalho.bdiByType = TIPOS_CUSTO.reduce((acc, t) => {
    const slot = ((porTipoBruto[t.chave] ?? porCategoriaBruto[t.chave]) ?? {}) as Record<string, unknown>;
    const percent = Number(slot['percent'] ?? slot['bdiPercent']) || 0;
    const value = Number(slot['value'] ?? slot['bdiValue']) || 0;

    acc[t.chave] = {
      mode: normalizarModoBdi(slot['mode'] ?? slot['bdiMode'], value, percent),
      percent,
      value,
    };
    return acc;
  }, {} as Record<ChaveTipo, BdiDoTipo>);

  cabecalho.isConfirmed = Boolean(raw['isConfirmed']);
  cabecalho.confirmedAt = String(raw['confirmedAt'] ?? '');

  return cabecalho;
}

export function normalizarUi(bruto: Record<string, unknown> | null | undefined): EstadoUi {
  const raw = bruto ?? {};
  const visiveis = (raw['visibleTypes'] ?? {}) as Record<string, unknown>;

  return {
    // Ausente significa ligado — só `false` explícito desliga.
    showUnit: raw['showUnit'] !== false,
    showTotal: raw['showTotal'] !== false,
    showBDI: raw['showBDI'] !== false,
    showTypes: raw['showTypes'] !== false,
    orcRealMode: String(raw['orcRealMode'] ?? '').toLowerCase() === 'pct' ? 'pct' : 'value',
    modoTotais: String(raw['modoTotais'] ?? '').toLowerCase() === 'saldo' ? 'saldo' : 'detalhado',
    visibleTypes: TIPOS_CUSTO.reduce((acc, t) => {
      acc[t.chave] = visiveis[t.chave] !== false;
      return acc;
    }, {} as Record<ChaveTipo, boolean>),
  };
}

export function normalizarItemEap(bruto: Record<string, unknown> | null | undefined): ItemEap {
  const raw = bruto ?? {};

  // Formato antigo: custos em costs.orcado, sem quantidade.
  const custosLegado = (raw['costs'] as Record<string, unknown> | undefined)?.['orcado'];
  const temCustosLegado = Boolean(custosLegado);

  const qtdeBruta = Number(raw['qtde']);
  const qtde = Number.isFinite(qtdeBruta) ? qtdeBruta : temCustosLegado ? 1 : 0;

  const nivelBruto = Number(raw['nivel']);
  const nivel =
    Number.isInteger(nivelBruto) && nivelBruto >= 1 && nivelBruto <= NIVEL_MAX ? nivelBruto : 0;

  const orcadoCongeladoBruto = raw['orcadoCongelado'];
  const orcadoCongelado =
    orcadoCongeladoBruto && typeof orcadoCongeladoBruto === 'object'
      ? normalizarPorTipo(orcadoCongeladoBruto)
      : null;

  return {
    id: raw['id'] ? String(raw['id']) : gerarId(),
    isGroup: Boolean(raw['isGroup']),
    nivel,
    adicional: Boolean(raw['adicional']),
    eap: String(raw['eap'] ?? ''),
    desc: String(raw['desc'] ?? ''),
    qtde,
    unid: String(raw['unid'] ?? ''),
    unit: temCustosLegado ? normalizarPorTipo(custosLegado) : normalizarPorTipo(raw['unit']),
    bdiMode: normalizarModoBdi(raw['bdiMode'], raw['bdiValue'], raw['bdiPercent']),
    bdiPercent: Number(raw['bdiPercent']) || 0,
    bdiValue: Number(raw['bdiValue']) || 0,
    orcadoCongelado,
  };
}

/** Quantos níveis a EAP suporta (select "Nível" na tela vai de 1 a este valor). */
export const NIVEL_MAX = 4;

/**
 * Renumera a EAP conforme a ordem das linhas e o `nivel` (1 a `NIVEL_MAX`)
 * de cada uma, e deriva quem é "grupo" a partir do resultado. Faz duas
 * passadas:
 *
 * **1ª passada — códigos EAP.** O índice de uma linha é a numeração
 * acumulada até o seu nível, ex. nível 3 vira "1.2.1". Cada nível tem seu
 * próprio contador, que zera quando aparece uma linha de nível mais raso.
 * Itens sem `nivel` definido (`0`, dado antigo de antes de 14/08/2026, ou
 * item novo ainda não editado) recebem o comportamento legado, herdado de
 * quando só existiam 2 níveis inferidos do então-checkbox "Grupo" (já
 * removido da tela, ver `ItemEap.isGroup`): grupo sempre vira nível 1;
 * item dentro de um grupo vira nível 2. Um item solto antes de qualquer
 * grupo é o único caso especial: no app original ele tinha um contador
 * próprio, separado do dos grupos — por isso "Solto 1"/"Solto 2" viram
 * "0"/"1" (nível 1 sempre começa em 0, 17/08/2026, pedido do Lucas) e o
 * primeiro grupo que aparecer depois também começa em "0" (número
 * repetido, mas é o comportamento herdado, preservado aqui pra não
 * quebrar dados antigos). O nível resolvido é gravado de volta no
 * item (como já acontecia com `eap`), então da segunda renumeração em
 * diante o valor já é explícito e esse caso especial não se aplica mais.
 *
 * **2ª passada — quem é grupo.** Só pode rodar depois da 1ª, porque
 * precisa dos códigos EAP finais de todo mundo. Ver `ItemEap.isGroup`.
 *
 * Altera os itens no lugar, como no original.
 */
export function aplicarNumeracaoAutomatica(itens: ItemEap[]): ItemEap[] {
  const contadores = Array.from({ length: NIVEL_MAX }, () => 0);
  // Nível 1 começa em 0, os demais em 1 (17/08/2026, pedido do Lucas) —
  // "0" e "0.1" podem existir, mas "1.0"/"1.1.0" nunca. Só o primeiro
  // contador nasce em -1 pra o primeiro incremento cair em 0; os outros
  // níveis mantêm a contagem de sempre (começando em 1).
  let numeroTopoLegado = -1;
  let nivelUltimoGrupo = 0;

  for (const item of itens) {
    if (!item) continue;

    const nivelExplicito =
      Number.isInteger(item.nivel) && item.nivel >= 1 && item.nivel <= NIVEL_MAX;

    if (!nivelExplicito && !item.isGroup && nivelUltimoGrupo === 0) {
      numeroTopoLegado += 1;
      item.nivel = 1;
      item.eap = String(numeroTopoLegado);
      continue;
    }

    const nivel = nivelExplicito
      ? item.nivel
      : item.isGroup
        ? 1
        : Math.min(nivelUltimoGrupo + 1, NIVEL_MAX);

    item.nivel = nivel;

    for (let i = nivel; i < NIVEL_MAX; i++) contadores[i] = 0;
    contadores[nivel - 1] += 1;
    item.eap = contadores
      .slice(0, nivel)
      .map((valor, indice) => (indice === 0 ? valor - 1 : valor))
      .join('.');

    if (item.isGroup) nivelUltimoGrupo = nivel;
  }

  for (const item of itens) {
    if (!item) continue;
    item.isGroup = itens.some((outro) => outro !== item && ehDescendente(item.eap, outro.eap));
  }

  return itens;
}
