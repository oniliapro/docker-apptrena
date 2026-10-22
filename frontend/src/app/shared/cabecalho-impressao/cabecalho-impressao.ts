import { Component, computed, inject, input } from '@angular/core';

import { PerfilEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarDataHora } from '../../core/utils/formato';

/**
 * Cabeçalho compartilhado dos PDFs (26/08/2026, pedido do Lucas: "aplicar
 * logo/cores/papel timbrado nos PDFs existentes") — até aqui, EAP, Mapa,
 * Empreita, Medição, Cronograma de Desembolso e Relatórios duplicavam o
 * mesmo `<header class="folha-cabecalho">` com "ComTrena" fixo; extraído
 * pra um componente único pra não repetir a lógica de logo 6 vezes.
 *
 * Sem logomarca cadastrada, cai pro texto "ComTrena" (comportamento
 * anterior — nenhuma empresa que ainda não configurou o perfil vê
 * diferença). 28/08/2026, pedido do Lucas: aplicar só a logomarca, não a
 * `corPrimaria` — a cor de destaque do cabeçalho fica sempre a padrão do
 * app (`--cor-primaria`). Fonte do corpo do documento também não muda
 * aqui — trocar a fonte de 6 layouts de impressão já ajustados é um
 * risco de regressão visual maior do que o valor desta rodada.
 *
 * Papel timbrado (21/10/2026, pedido do Lucas): NÃO entra aqui. Só os documentos
 * feitos a partir de um modelo editável (Configurações → Modelos de documentos:
 * contrato, proposta, ficha de verificação) levam o papel timbrado — ver
 * `ContratoImprimir`. Os PDFs do sistema (EAP, Mapa, Empreita, Medição, RDO,
 * Cronograma, Relatórios) saem sem ele.
 */
@Component({
  selector: 'app-cabecalho-impressao',
  templateUrl: './cabecalho-impressao.html',
  styleUrl: './cabecalho-impressao.scss',
})
export class CabecalhoImpressao {
  private readonly api = inject(ApiService);

  readonly perfil = input<PerfilEmpresa | null>(null);
  readonly subtitulo = input.required<string>();
  readonly geradoEm = input.required<string>();

  protected readonly formatarDataHora = formatarDataHora;

  /** `logoUrl` vem relativo (`/storage/...`) — ver `Empresa::getLogoUrlAttribute()`. */
  protected readonly logoUrl = computed(() => {
    const caminho = this.perfil()?.logoUrl;
    return caminho ? this.api.baseStorage() + caminho : null;
  });
}
