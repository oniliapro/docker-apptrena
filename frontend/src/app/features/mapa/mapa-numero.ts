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
  // 4 dígitos desde 15/10/2026 (código "MAPA-0001", pedido do Lucas); os antigos ("01") são
  // convertidos pela migration `codigo_do_mapa_por_obra`.
  return String(maior + 1).padStart(4, '0');
}
