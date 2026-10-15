import { agoraDeParede, hojeNoFuso, obterFuso } from './fuso';

/**
 * Formatação pt-BR compartilhada. No app vanilla, estas funções estavam
 * duplicadas em quase todo arquivo (formatarMoeda, formatarData,
 * escaparHtml). Aqui ficam num lugar só — e o escape de HTML some, porque
 * o Angular já escapa interpolação por padrão.
 */

export function formatarMoeda(valor: unknown): string {
  const numero = Number(valor) || 0;
  // `maximumFractionDigits` explícito (22/08/2026, achado gerando o PDF de
  // teste — "R$ 1.574.414,411") — sem isso, `toLocaleString` só garante o
  // MÍNIMO de 2 casas, e um valor com resto de ponto flutuante (comum em
  // cálculos de BDI/rateio) aparecia com 3 casas decimais, não só no PDF:
  // qualquer tela que já usasse este helper tinha o mesmo problema.
  return 'R$ ' + numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Fuso horário usado em toda exibição de data/hora do sistema (01/09/2026,
 * relatado pelo Lucas: "as datas não fazem sentido"). Desde 15/10/2026 é
 * escolha da empresa (Configurações → Dados da empresa) — ver `fuso.ts`;
 * o padrão continua sendo Brasília/São Paulo.
 */

function formatarDataComFuso(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: obterFuso(),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(data);
}

/**
 * Aceita "2026-07-25" (só data) ou um ISO completo com hora (ex.:
 * "2026-07-25T23:30:00Z") e devolve "25/07/2026".
 *
 * As duas entradas exigem tratamento OPOSTO (bug corrigido em 01/09/2026):
 * uma string SÓ COM DATA já é o dia certo, literal — interpretá-la como um
 * instante e projetar num fuso horário na verdade CORROMPE o resultado
 * (`new Date("2026-07-25")` vira meia-noite UTC, que em Brasília — UTC-3 —
 * já é 21h do dia 24; formatar isso com fuso de Brasília mostraria "24/07"
 * em vez de "25/07"). Já um ISO COM HORA é um instante de verdade,
 * normalmente gravado em UTC (`new Date().toISOString()` no momento de um
 * clique) — esse sim precisa ser projetado no fuso de Brasília antes de
 * ler o dia, senão qualquer confirmação feita à noite (entre ~21h e
 * 23h59, quando UTC já virou o dia seguinte) mostra o dia errado.
 */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '';
  const texto = String(iso);

  if (!texto.includes('T') && !texto.includes(' ')) {
    const [ano, mes, dia] = texto.slice(0, 10).split('-');
    if (!ano || !mes || !dia) return '';
    return `${dia}/${mes}/${ano}`;
  }

  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return '';
  return formatarDataComFuso(data);
}

/** Data de hoje, no fuso escolhido pela empresa, no formato aceito por <input type="date">. */
export function hojeIso(): string {
  return hojeNoFuso();
}

/** Aceita um ISO completo (com hora) e devolve "25/07/2026 14:30", sempre no fuso escolhido pela empresa. */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';

  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: obterFuso(),
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);

  return `${formatarDataComFuso(data)} ${hora}`;
}

/**
 * Dias entre hoje e a data informada. Negativo se já passou;
 * null se não houver data.
 *
 * "Hoje" é o dia do fuso escolhido — uma data SÓ com dia (`2026-10-20`) é
 * comparada dia de calendário contra dia de calendário, sem horas no meio.
 */
export function diasRestantes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const texto = String(iso);

  if (!texto.includes('T') && !texto.includes(' ')) {
    const [ano, mes, dia] = texto.slice(0, 10).split('-').map(Number);
    if (!ano || !mes || !dia) return null;
    const hoje = agoraDeParede();
    const alvoUtc = Date.UTC(ano, mes - 1, dia);
    const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return Math.round((alvoUtc - hojeUtc) / 86_400_000);
  }

  const alvo = new Date(texto).getTime();
  if (Number.isNaN(alvo)) return null;
  return Math.ceil((alvo - Date.now()) / 86_400_000);
}
