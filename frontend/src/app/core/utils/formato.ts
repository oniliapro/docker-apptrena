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

/** Aceita "2026-07-25" ou ISO completo e devolve "25/07/2026". */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '';
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  if (!ano || !mes || !dia) return '';
  return `${dia}/${mes}/${ano}`;
}

/** Data de hoje no formato aceito por <input type="date">. */
export function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Aceita ISO completo (com hora) e devolve "25/07/2026 14:30", no fuso local do navegador. */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const horas = String(data.getHours()).padStart(2, '0');
  const minutos = String(data.getMinutes()).padStart(2, '0');
  return `${formatarData(iso)} ${horas}:${minutos}`;
}

/**
 * Dias entre hoje e a data informada. Negativo se já passou;
 * null se não houver data.
 */
export function diasRestantes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const alvo = new Date(iso).getTime();
  if (Number.isNaN(alvo)) return null;
  return Math.ceil((alvo - Date.now()) / 86_400_000);
}
