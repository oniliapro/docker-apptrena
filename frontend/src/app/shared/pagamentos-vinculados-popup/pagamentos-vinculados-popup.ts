import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { catchError, of } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { formatarMoeda } from '../../core/utils/formato';
import {
  EditarPagamentoModal,
  EventoSalvarPagamento,
} from '../../features/pagamentos/editar-pagamento-modal/editar-pagamento-modal';
import { normalizarPagamento, paraPayloadApi } from '../../features/pagamentos/pagamentos-calc';
import { Pagamento } from '../../features/pagamentos/pagamentos.models';

/**
 * Popup "Pagamentos vinculados" (14/09/2026) — extraído/generalizado do
 * popup que já existia só dentro de `MapasObra` (ver `mapas-obra.html`),
 * pra ser reaproveitado pelos cards de Mapas E Empreitas do Dashboard
 * (`origemTipo`/`origemRefId` genéricos — `ApiService.listarPagamentos`
 * já suporta os dois desde sempre, `MapasObra` só nunca tinha usado o
 * filtro por origem no servidor, buscava tudo da obra e agrupava local).
 *
 * O popup de edição (`EditarPagamentoModal`) fica como bloco IRMÃO do
 * `.modal` deste componente no template, nunca aninhado dentro do
 * `.modal-cartao` — mesma estrutura seguida por `MapasObra`, necessária
 * pra não cair no bug de "containing block": um `.modal-cartao` com
 * `transform` vira o container de qualquer `position: fixed` de dentro
 * dele, prendendo um modal aninhado numa caixa pequena em vez do
 * viewport (ver `PreviewModal`/`GerenciarAcessosObra`, mesmo problema já
 * corrigido em outros lugares desta base).
 */
@Component({
  selector: 'app-pagamentos-vinculados-popup',
  imports: [EditarPagamentoModal],
  templateUrl: './pagamentos-vinculados-popup.html',
  styleUrl: './pagamentos-vinculados-popup.scss',
})
export class PagamentosVinculadosPopup implements OnInit {
  private readonly api = inject(ApiService);

  readonly origemTipo = input.required<'mapa' | 'empreita'>();
  readonly origemRefId = input.required<string>();
  readonly titulo = input('Pagamentos vinculados');

  readonly fechar = output<void>();

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly carregando = signal(true);
  protected readonly pagamentos = signal<Pagamento[]>([]);
  protected readonly pagamentoEmEdicao = signal<Pagamento | null>(null);

  ngOnInit(): void {
    this.api
      .listarPagamentos({ origemTipo: this.origemTipo(), origemRefId: this.origemRefId() })
      .pipe(catchError(() => of([])))
      .subscribe((lista) => {
        this.pagamentos.set(lista.map((bruto) => normalizarPagamento(bruto as Record<string, unknown>)));
        this.carregando.set(false);
      });
  }

  protected abrirPagamento(pagamento: Pagamento): void {
    this.pagamentoEmEdicao.set(pagamento);
  }

  protected fecharPagamento(): void {
    this.pagamentoEmEdicao.set(null);
  }

  protected salvarPagamento(evento: EventoSalvarPagamento): void {
    const pagamento = evento.pagamento;
    const obraId = pagamento.obraId ?? '';
    this.api.atualizarPagamento(pagamento.id, paraPayloadApi(pagamento, obraId)).subscribe({
      next: (salvo) => {
        const normalizado = normalizarPagamento(salvo as Record<string, unknown>);
        this.pagamentos.update((lista) => lista.map((p) => (p.id === normalizado.id ? normalizado : p)));
        this.fecharPagamento();
      },
      error: () => window.alert('Não foi possível salvar o pagamento — confira os valores e tente de novo.'),
    });
  }
}
