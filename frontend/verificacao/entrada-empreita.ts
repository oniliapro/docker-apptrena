/**
 * Ponto de entrada para o comparador de paridade da Empreita.
 *
 * Reescrito em 15/10/2026: o motor da empreita deixou de ter "categorias
 * incluídas" no cabeçalho e de guardar contrato/medição POR CATEGORIA dentro de
 * um item — cada linha da empreita agora é UM serviço de UMA categoria (`tipo`)
 * com `contratoEmp`, `contratoReserva`, `medicaoAcum` e `medicaoAtual`. O
 * comparador converte os casos antigos (um item com várias categorias) em
 * várias linhas novas.
 */
import { calcularLinhaEmpreita, calcularOrcadoDaEap, calcularTotaisEmpreita } from '../src/app/features/empreita/empreita-engine';
import { normalizarItemEap } from '../src/app/features/eap/eap-normalize';

export function preparar(eapBruto: any[], linhas: any[], cabecalhoEap?: any) {
  const itensEap = eapBruto.map((i) => normalizarItemEap(i));
  const orcado = calcularOrcadoDaEap(itensEap, cabecalhoEap);
  return {
    orcado,
    linhas: linhas.map((l) => calcularLinhaEmpreita(l, orcado)),
    totais: calcularTotaisEmpreita(linhas, orcado),
  };
}

export { calcularOrcadoDaEap };
