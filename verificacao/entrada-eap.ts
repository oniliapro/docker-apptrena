/** Ponto de entrada para o comparador de paridade da EAP. */
import { calcularCacheOrcado, somarDescendentesDoGrupo } from '../src/app/features/eap/eap-engine';
import {
  aplicarNumeracaoAutomatica,
  normalizarCabecalho,
  normalizarItemEap,
} from '../src/app/features/eap/eap-normalize';

export function calcular(itensBrutos: any[], header: any) {
  const itens = itensBrutos.map((i) => normalizarItemEap(i));
  const cabecalho = normalizarCabecalho(header);
  aplicarNumeracaoAutomatica(itens);
  return { itens, cabecalho, cache: calcularCacheOrcado(itens, cabecalho) };
}

export function somarGrupo(indice: number, itens: any[], cache: any) {
  return somarDescendentesDoGrupo(indice, itens, cache);
}
