/** Ponto de entrada para o comparador de paridade da Empreita. */
import {
  calcularLinhaEmpreita,
  calcularOrcadoDaEap,
  calcularTotaisEmpreita,
  obterTiposIncluidos,
} from '../src/app/features/empreita/empreita-engine';
import { normalizarItemEap } from '../src/app/features/eap/eap-normalize';

export function preparar(eapBruto: any[], itens: any[], cabecalho: any, cabecalhoEap?: any) {
  const itensEap = eapBruto.map((i) => normalizarItemEap(i));
  const orcado = calcularOrcadoDaEap(itensEap, cabecalhoEap);
  return {
    orcado,
    tipos: obterTiposIncluidos(cabecalho),
    linhas: itens.map((i) => calcularLinhaEmpreita(i, cabecalho, orcado)),
    totais: calcularTotaisEmpreita(itens, cabecalho, orcado),
  };
}

export { calcularOrcadoDaEap };
