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

  return {
    id: raw['id'] ? String(raw['id']) : gerarId(),
    isGroup: Boolean(raw['isGroup']),
    eap: String(raw['eap'] ?? ''),
    desc: String(raw['desc'] ?? ''),
    qtde,
    unid: String(raw['unid'] ?? ''),
    unit: temCustosLegado ? normalizarPorTipo(custosLegado) : normalizarPorTipo(raw['unit']),
    bdiMode: normalizarModoBdi(raw['bdiMode'], raw['bdiValue'], raw['bdiPercent']),
    bdiPercent: Number(raw['bdiPercent']) || 0,
    bdiValue: Number(raw['bdiValue']) || 0,
  };
}

/**
 * Renumera a EAP conforme a ordem das linhas: grupos viram "1", "2"…, e
 * os itens dentro de cada grupo viram "1.1", "1.2"… Itens antes de
 * qualquer grupo recebem numeração de primeiro nível.
 *
 * Altera os itens no lugar, como no original.
 */
export function aplicarNumeracaoAutomatica(itens: ItemEap[]): ItemEap[] {
  let numeroGrupo = 0;
  let numeroNoGrupo = 0;
  let numeroTopo = 0;

  for (const item of itens) {
    if (!item) continue;

    if (item.isGroup) {
      numeroGrupo += 1;
      numeroNoGrupo = 0;
      item.eap = String(numeroGrupo);
      continue;
    }

    if (numeroGrupo > 0) {
      numeroNoGrupo += 1;
      item.eap = `${numeroGrupo}.${numeroNoGrupo}`;
    } else {
      numeroTopo += 1;
      item.eap = String(numeroTopo);
    }
  }

  return itens;
}
