import { Mapa } from '../../core/models/api.models';

/**
 * Próximo "Nº do mapa" dentro de UMA obra (19/08/2026, pedido do Lucas) —
 * conta só os mapas dessa obra, não do sistema inteiro. Escaneia o maior
 * número já usado em vez de contar registros, pra não reaproveitar número
 * de um mapa excluído. Usado ao criar um mapa pela lista da obra e ao
 * duplicar um mapa existente.
 */
export function proximoNumeroMapa(mapasDaObra: readonly Mapa[]): string {
  const maior = mapasDaObra.reduce((max, mapa) => {
    const numero = parseInt(String(mapa['numero_mapa'] ?? '').trim(), 10);
    return Number.isFinite(numero) && numero > max ? numero : max;
  }, 0);
  return String(maior + 1).padStart(2, '0');
}
