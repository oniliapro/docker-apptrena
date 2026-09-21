import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

import { avaliarFormula } from './formula';

/**
 * Fórmulas em campos numéricos (19/09/2026, pedido dos usuários): em qualquer
 * campo de valor do sistema (`<input type="text" class="valor">`), digitar
 * `=` e uma conta — ex.: `=1200*3+50`, `=soma(10;20)*2`, `=200*10%` — vira o
 * resultado ao sair do campo. Só o RESULTADO é guardado (a fórmula em si só
 * é guardada na EAP, com `data-formula-propria`, fase F5).
 *
 * Como funciona sem mexer em cada tela: um único listener de `change` no
 * documento, na fase de CAPTURA (roda antes do `(change)` que cada tela já
 * tem), troca o texto do campo pelo número calculado em formato brasileiro
 * (`3650`, `12,5`) — as telas continuam lendo o campo como sempre leram, sem
 * saber que houve fórmula.
 *
 * Fórmula inválida: nenhuma tela recebe o `change` (o valor guardado não muda),
 * o campo mostra o motivo no balão nativo do navegador (`setCustomValidity`)
 * e volta a ficar em foco pra corrigir. Se a pessoa desistir e sair do campo,
 * o texto anterior é restaurado.
 */
@Injectable({ providedIn: 'root' })
export class FormulaCamposService {
  private readonly documento = inject(DOCUMENT);
  /** Texto do campo quando ganhou foco — pra restaurar se a fórmula ficar inválida. */
  private readonly textoAoFocar = new WeakMap<HTMLInputElement, string>();
  private readonly comErro = new WeakSet<HTMLInputElement>();
  /** O `change` chega no meio da saída do campo (blur); sem isso o `focusout` seguinte já restauraria o texto antes de a pessoa ler o aviso. */
  private saidaEmAndamento: HTMLInputElement | null = null;

  constructor() {
    this.documento.addEventListener('focusin', (evento) => this.aoFocar(evento));
    this.documento.addEventListener('change', (evento) => this.aoMudar(evento), true);
    this.documento.addEventListener('focusout', (evento) => this.aoSair(evento));
    this.documento.addEventListener('input', (evento) => this.aoDigitar(evento));
  }

  private campoDeValor(evento: Event): HTMLInputElement | null {
    const alvo = evento.target;
    if (!(alvo instanceof HTMLInputElement)) return null;
    if (alvo.type !== 'text' || !alvo.classList.contains('valor')) return null;
    if (alvo.disabled || alvo.readOnly || alvo.hasAttribute('data-formula-propria')) return null;
    return alvo;
  }

  private aoFocar(evento: Event): void {
    const campo = this.campoDeValor(evento);
    if (campo && !this.comErro.has(campo)) this.textoAoFocar.set(campo, campo.value);
  }

  private aoDigitar(evento: Event): void {
    const campo = this.campoDeValor(evento);
    if (campo && this.comErro.has(campo)) {
      // Está corrigindo: apaga o aviso antigo (o novo vem no próximo `change`).
      campo.setCustomValidity('');
      this.comErro.delete(campo);
    }
  }

  private aoMudar(evento: Event): void {
    const campo = this.campoDeValor(evento);
    if (!campo) return;

    const texto = campo.value.trim();
    if (!texto.startsWith('=')) return;

    const resultado = avaliarFormula(texto);
    if (!resultado.ok) {
      // Ninguém mais recebe este `change`: o valor guardado continua o antigo.
      evento.stopImmediatePropagation();
      this.comErro.add(campo);
      campo.setCustomValidity(`Fórmula inválida: ${resultado.erro}`);
      this.saidaEmAndamento = campo;
      setTimeout(() => (this.saidaEmAndamento = null), 100);
      campo.reportValidity();
      return;
    }

    campo.setCustomValidity('');
    this.comErro.delete(campo);
    campo.value = FormulaCamposService.formatarResultado(resultado.valor);
  }

  private aoSair(evento: Event): void {
    const campo = this.campoDeValor(evento);
    if (!campo || !this.comErro.has(campo) || campo === this.saidaEmAndamento) return;

    campo.setCustomValidity('');
    this.comErro.delete(campo);
    campo.value = this.textoAoFocar.get(campo) ?? '';
  }

  /** Número no formato brasileiro sem separador de milhar, até 6 casas — é o que os leitores de campo (`parsearBR`) entendem. */
  static formatarResultado(valor: number): string {
    const arredondado = Number(valor.toFixed(6));
    return String(Object.is(arredondado, -0) ? 0 : arredondado).replace('.', ',');
  }
}
