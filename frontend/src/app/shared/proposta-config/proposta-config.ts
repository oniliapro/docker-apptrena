import { Component, input, output } from '@angular/core';

import {
  CORES_PADRAO_PROPOSTA,
  ChaveCorProposta,
  ConfigProposta,
  NIVEIS_EAP_PROPOSTA,
  NivelEapProposta,
  PARES_DE_COR_PROPOSTA,
} from '../proposta-eap';

/**
 * Campos de configuração da tabela da EAP numa proposta (14/10/2026) —
 * compartilhado pelo editor do modelo (padrão do modelo) e pelo modal
 * "Gerar proposta" da página da EAP (ajuste desta geração): mesma tela
 * nos dois lugares, só muda de onde vem/pra onde vai o valor.
 *
 * Controlado de fora: recebe a config atual e emite uma NOVA a cada
 * mudança (nunca altera o objeto recebido).
 */
@Component({
  selector: 'app-proposta-config',
  templateUrl: './proposta-config.html',
  styleUrl: './proposta-config.scss',
})
export class PropostaConfig {
  readonly config = input.required<ConfigProposta>();
  /** O modelo não decide "incluir ou não" por si — isso é escolha de cada geração. */
  readonly mostrarIncluirTabela = input(true);
  /** Cores só no modelo (14/10/2026, pedido do Lucas: "quero configurar as cores da tabela dentro do modelo") — o modal de gerar não mostra. */
  readonly mostrarCores = input(true);
  readonly mudou = output<ConfigProposta>();

  protected readonly niveis = NIVEIS_EAP_PROPOSTA;
  protected readonly paresDeCor = PARES_DE_COR_PROPOSTA;

  protected rotuloNivel(nivel: number): string {
    return nivel === 1 ? 'Só o nível 1 (grupos principais)' : nivel === 4 ? 'Todos os níveis (até o 4)' : `Até o nível ${nivel}`;
  }

  protected alterarBooleano(campo: 'incluir_tabela' | 'mostrar_unitario' | 'mostrar_total', valor: boolean): void {
    this.mudou.emit({ ...this.config(), [campo]: valor });
  }

  protected alterarNivel(valor: string): void {
    this.mudou.emit({ ...this.config(), nivel_maximo: Number(valor) as NivelEapProposta });
  }

  protected alterarCor(chave: ChaveCorProposta, valor: string): void {
    this.mudou.emit({ ...this.config(), cores: { ...this.config().cores, [chave]: valor } });
  }

  protected restaurarCores(): void {
    this.mudou.emit({ ...this.config(), cores: { ...CORES_PADRAO_PROPOSTA } });
  }

  /** `<input type="color">` só aceita `#rrggbb` — expande `#rgb` se o backend tiver guardado assim. */
  protected valorCor(chave: ChaveCorProposta): string {
    const cor = this.config().cores[chave];
    if (/^#[0-9a-fA-F]{3}$/.test(cor)) {
      return '#' + cor.slice(1).split('').map((c) => c + c).join('');
    }
    return cor;
  }
}
