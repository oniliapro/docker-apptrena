/**
 * Fuso horário do sistema (15/10/2026, pedido do Lucas: "adicionar opção de
 * escolher fuso horário e ajustar as funções que utilizam data para sempre
 * colocarem o horário conforme o fuso escolhido").
 *
 * O fuso é uma escolha da EMPRESA (Configurações → Dados da empresa) e vale
 * para todo mundo que usa a conta. O padrão é São Paulo (GMT-3), que era o
 * fuso fixo do sistema até aqui.
 *
 * Por que um módulo com estado, e não um serviço injetável: as funções de data
 * (`hojeIso`, `formatarData`, os motores de cálculo) são funções puras
 * importadas em dezenas de lugares, inclusive fora de qualquer componente. O
 * fuso é lido a cada chamada, então trocar a opção vale na hora, sem recarregar.
 *
 * REGRA para quem mexer em datas daqui pra frente: nunca use `new Date()` para
 * descobrir "que dia/hora é agora" nem `toISOString().slice(0, 10)` para obter
 * o dia — o primeiro usa o fuso do navegador, o segundo usa UTC (à noite, no
 * Brasil, já é "amanhã"). Use `hojeIso()`, `agoraDeParede()` e `agoraIsoLocal()`.
 */

export const FUSO_PADRAO = 'America/Sao_Paulo';

export interface OpcaoFuso {
  /** Identificador IANA — é o que o backend grava em `empresas.fuso_horario`. */
  valor: string;
  rotulo: string;
}

/**
 * Fusos oferecidos. Brasil primeiro (o público do sistema); os de outros países
 * cobrem quem tem obra fora (Paraguai, Portugal etc.).
 */
export const FUSOS_DISPONIVEIS: readonly OpcaoFuso[] = [
  { valor: 'America/Sao_Paulo', rotulo: 'São Paulo, SP (GMT-3)' },
  { valor: 'America/Noronha', rotulo: 'Fernando de Noronha, PE (GMT-2)' },
  { valor: 'America/Manaus', rotulo: 'Manaus, AM (GMT-4)' },
  { valor: 'America/Cuiaba', rotulo: 'Cuiabá, MT (GMT-4)' },
  { valor: 'America/Campo_Grande', rotulo: 'Campo Grande, MS (GMT-4)' },
  { valor: 'America/Porto_Velho', rotulo: 'Porto Velho, RO (GMT-4)' },
  { valor: 'America/Boa_Vista', rotulo: 'Boa Vista, RR (GMT-4)' },
  { valor: 'America/Rio_Branco', rotulo: 'Rio Branco, AC (GMT-5)' },
  { valor: 'America/Asuncion', rotulo: 'Assunção, Paraguai (GMT-3)' },
  { valor: 'America/Argentina/Buenos_Aires', rotulo: 'Buenos Aires, Argentina (GMT-3)' },
  { valor: 'America/New_York', rotulo: 'Nova York, EUA (GMT-5/-4)' },
  { valor: 'Europe/Lisbon', rotulo: 'Lisboa, Portugal (GMT+0/+1)' },
  { valor: 'UTC', rotulo: 'UTC (GMT+0)' },
];

const CHAVE_FUSO = 'trenaapp.fuso.v1';

let fusoAtual: string = lerFusoGuardado();

function lerFusoGuardado(): string {
  try {
    const guardado = localStorage.getItem(CHAVE_FUSO);
    return fusoValido(guardado) ? (guardado as string) : FUSO_PADRAO;
  } catch {
    return FUSO_PADRAO;
  }
}

/** `true` se o navegador reconhece o identificador (evita `RangeError` do `Intl` com lixo vindo do servidor). */
export function fusoValido(fuso: unknown): fuso is string {
  if (typeof fuso !== 'string' || !fuso.trim()) return false;
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

export function obterFuso(): string {
  return fusoAtual;
}

/** Troca o fuso do sistema (chamado ao entrar e ao salvar Dados da empresa). Valor inválido volta ao padrão. */
export function definirFuso(fuso: string | null | undefined): void {
  fusoAtual = fusoValido(fuso) ? fuso : FUSO_PADRAO;
  try {
    localStorage.setItem(CHAVE_FUSO, fusoAtual);
  } catch {
    // sem persistência: vale só nesta sessão.
  }
}

/** Texto amigável do fuso atual, para telas e rodapés. */
export function rotuloDoFuso(fuso: string = fusoAtual): string {
  return FUSOS_DISPONIVEIS.find((f) => f.valor === fuso)?.rotulo ?? fuso;
}

interface PartesDeParede {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

/** Ano/mês/dia/hora/minuto/segundo que o relógio do fuso marca no instante informado. */
export function partesNoFuso(instante: Date = new Date(), fuso: string = fusoAtual): PartesDeParede {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante);

  const lido = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value ?? 0);

  return {
    ano: lido('year'),
    mes: lido('month'),
    dia: lido('day'),
    hora: lido('hour'),
    minuto: lido('minute'),
    segundo: lido('second'),
  };
}

const dois = (n: number): string => String(n).padStart(2, '0');

/** `AAAA-MM-DD` de hoje no fuso escolhido — o formato do `<input type="date">`. */
export function hojeNoFuso(instante: Date = new Date()): string {
  const p = partesNoFuso(instante);
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`;
}

/** `AAAA-MM-DDTHH:mm` de agora no fuso escolhido (horário de parede, sem sufixo de fuso). */
export function agoraIsoLocal(instante: Date = new Date()): string {
  const p = partesNoFuso(instante);
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}T${dois(p.hora)}:${dois(p.minuto)}`;
}

/**
 * Um `Date` cujos getters LOCAIS (`getDate()`, `getHours()`...) devolvem o que o
 * relógio do fuso escolhido marca agora. Serve para o código de calendário que
 * já trabalha com `new Date(ano, mes, dia)` e `getDay()`: troca `new Date()`
 * por `agoraDeParede()` e o resto continua igual.
 *
 * Não use este objeto para `getTime()`/`toISOString()` — ele NÃO é o instante
 * real, é o horário de parede disfarçado de data local.
 */
export function agoraDeParede(instante: Date = new Date()): Date {
  const p = partesNoFuso(instante);
  return new Date(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
}
