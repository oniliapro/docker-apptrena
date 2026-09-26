import { DestroyRef, Directive, ElementRef, Injectable, computed, inject, input, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { avaliarFormula } from './formula';
import { parsearNumeroBR } from './parse-numero';

/**
 * Fórmulas guardadas nos campos de valor das demais tabelas (26/09/2026 —
 * extensão do "guardar fórmula" da EAP, depois de testado e validado pelo
 * Lucas). Digitar `=1200*3+50` num campo de valor continua gravando só o
 * RESULTADO no dado de sempre; a diferença é que agora o TEXTO da fórmula
 * também fica guardado: em repouso a célula mostra o número (com uma faixa
 * azul dizendo que tem fórmula) e, ao receber foco, mostra a fórmula para
 * editar. Digitar um número comum desfaz a fórmula.
 *
 * Aqui só vale a conta em si (`=soma(10;20)*2`); referências a outros campos
 * (`"1.4-qtd"`) continuam exclusivas da EAP.
 *
 * Como se liga a uma tela, sem mexer na lógica dela:
 *  1. o componente declara `providers: [FormulasContexto]` e chama
 *     `formulas.definir('mapa.<id>')` quando sabe qual registro está aberto;
 *  2. cada `<input class="valor">` ganha `appFormulaCampo="<chave do campo>"`.
 *
 * Armazenamento: um JSON `{ chave: fórmula }` por registro, na ponte de
 * armazenamento chave/valor do servidor (`controleObra.formulas.<contexto>`),
 * isolada por empresa — por isso não há tabela nova. Sem contexto (registro
 * ainda não salvo), as fórmulas ficam só em memória e passam a ser gravadas
 * assim que o contexto aparece.
 */
@Injectable()
export class FormulasContexto {
  private readonly api = inject(ApiService);
  private readonly formulas = signal<Record<string, string>>({});
  private contexto: string | null = null;
  /** Alterações ainda não gravadas (chave -> fórmula, ou `null` para desfazer). */
  private sujas = new Map<string, string | null>();
  private carregando = false;
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.temporizador) clearTimeout(this.temporizador);
      this.gravar();
    });
  }

  /** Fórmula guardada para o campo, ou `null` (lê um signal — reativo). */
  obter(chave: string): string | null {
    return this.formulas()[chave] ?? null;
  }

  /** Aponta para o registro aberto; `null` = ainda não existe (fórmulas ficam em memória). */
  definir(contexto: string | null): void {
    if (contexto === this.contexto) return;
    this.contexto = contexto;
    if (!contexto) {
      this.formulas.set({});
      this.sujas.clear();
      return;
    }
    // O que foi digitado antes do registro existir vai junto.
    for (const [chave, formula] of Object.entries(this.formulas())) this.sujas.set(chave, formula);
    this.carregando = true;
    this.api.lerChave(this.chaveArmazenamento(contexto)).subscribe({
      next: (resposta) => {
        if (this.contexto !== contexto) return;
        const remoto = this.ler(resposta.value);
        this.aplicar(remoto, this.sujas);
        this.formulas.set(remoto);
        this.carregando = false;
        if (this.sujas.size) this.agendarGravacao();
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  /** Guarda (`formula`) ou desfaz (`null`) a fórmula do campo. */
  registrar(chave: string, formula: string | null): void {
    const atual = this.formulas()[chave] ?? null;
    if (atual === formula) return;
    this.formulas.update((mapa) => {
      const novo = { ...mapa };
      if (formula) novo[chave] = formula;
      else delete novo[chave];
      return novo;
    });
    this.sujas.set(chave, formula);
    if (this.contexto && !this.carregando) this.agendarGravacao();
  }

  private agendarGravacao(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.gravar(), 500);
  }

  /** Lê o valor mais recente do servidor e aplica só as alterações desta tela (outra pessoa pode ter mexido em outro campo). */
  private gravar(): void {
    const contexto = this.contexto;
    if (!contexto || !this.sujas.size) return;
    const alteracoes = new Map(this.sujas);
    this.sujas.clear();
    const chave = this.chaveArmazenamento(contexto);

    this.api.lerChave(chave).subscribe({
      next: (resposta) => {
        const remoto = this.ler(resposta.value);
        this.aplicar(remoto, alteracoes);
        const pedido = Object.keys(remoto).length
          ? this.api.gravarChave(chave, JSON.stringify(remoto))
          : this.api.removerChave(chave);
        pedido.subscribe({ error: () => this.devolver(alteracoes) });
      },
      error: () => this.devolver(alteracoes),
    });
  }

  /** Falhou de gravar: as alterações voltam para a fila (sem atropelar o que foi digitado depois). */
  private devolver(alteracoes: Map<string, string | null>): void {
    for (const [chave, formula] of alteracoes) if (!this.sujas.has(chave)) this.sujas.set(chave, formula);
  }

  private aplicar(alvo: Record<string, string>, alteracoes: Map<string, string | null>): void {
    for (const [chave, formula] of alteracoes) {
      if (formula) alvo[chave] = formula;
      else delete alvo[chave];
    }
  }

  private ler(valor: string | null | undefined): Record<string, string> {
    if (!valor) return {};
    try {
      const bruto = JSON.parse(valor) as unknown;
      if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
      return Object.fromEntries(
        Object.entries(bruto as Record<string, unknown>).filter(
          (par): par is [string, string] => typeof par[1] === 'string' && par[1].startsWith('='),
        ),
      );
    } catch {
      return {};
    }
  }

  private chaveArmazenamento(contexto: string): string {
    return 'controleObra.formulas.' + contexto.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}

/** Número no começo do texto do campo — alguns campos mostram a unidade junto ("19,13 M2"). */
function numeroDoCampo(texto: string): number {
  const inicio = texto.replace(/[R$\s%]/g, '').match(/^-?[\d.]*,?\d*/);
  return parsearNumeroBR(inicio ? inicio[0] : '');
}

/** Diferença aceita entre o resultado da fórmula e o número que o campo mostra (o campo arredonda a exibição). */
function mesmoValor(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.0051 + 1e-9 * Math.abs(b);
}

/**
 * Liga um `<input class="valor">` às fórmulas guardadas da tela (ver
 * `FormulasContexto`). A fórmula só é mostrada se ainda bater com o número do
 * campo — se o número mudou por outro caminho (edição em outra tela, recálculo),
 * a fórmula ficou velha e é descartada em vez de mostrar uma conta que não
 * dá mais aquele valor.
 */
@Directive({
  selector: 'input[appFormulaCampo]',
  host: {
    '[class.campo-formula]': 'temFormula()',
    '(focusin)': 'aoFocar()',
    '(focusout)': 'aoSair()',
    '(change)': 'aoMudar()',
  },
})
export class FormulaCampo {
  /** Chave do campo dentro do registro da tela (ex.: `i.<idDoItem>.qtde`). */
  readonly chave = input.required<string>({ alias: 'appFormulaCampo' });

  private readonly elemento = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private readonly contexto = inject(FormulasContexto, { optional: true });
  private mostrandoFormula = false;
  private textoEmRepouso = '';

  protected readonly temFormula = computed(() => !!this.contexto?.obter(this.chave()));

  protected aoFocar(): void {
    const contexto = this.contexto;
    if (!contexto) return;
    const formula = contexto.obter(this.chave());
    if (!formula) return;
    // Voltou ao campo depois de uma conta inválida (o serviço global devolve o foco): já há uma conta na tela.
    if (this.elemento.value.trim().startsWith('=')) return;

    const calculo = avaliarFormula(formula);
    const atual = numeroDoCampo(this.elemento.value);
    if (!calculo.ok || !mesmoValor(calculo.valor, atual)) {
      contexto.registrar(this.chave(), null);
      return;
    }

    this.textoEmRepouso = this.elemento.value;
    // O serviço global de fórmulas (`FormulaCamposService`) restaura este texto se a conta digitada for inválida.
    this.elemento.dataset['textoRepouso'] = this.textoEmRepouso;
    this.mostrandoFormula = true;
    this.elemento.value = formula;
    this.elemento.select();
  }

  protected aoSair(): void {
    if (!this.mostrandoFormula) return;
    this.mostrandoFormula = false;
    delete this.elemento.dataset['textoRepouso'];
    // Saiu sem mexer: volta a mostrar o número.
    const formula = this.contexto?.obter(this.chave());
    if (formula && this.elemento.value === formula) this.elemento.value = this.textoEmRepouso;
  }

  protected aoMudar(): void {
    const contexto = this.contexto;
    if (!contexto) return;
    // `FormulaCamposService` já trocou o texto pelo resultado e deixou a conta em `formulaDigitada`.
    const digitada = this.elemento.dataset['formulaDigitada'] ?? null;
    delete this.elemento.dataset['formulaDigitada'];
    contexto.registrar(this.chave(), digitada);
  }
}
