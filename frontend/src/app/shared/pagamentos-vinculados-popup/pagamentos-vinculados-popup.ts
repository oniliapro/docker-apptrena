import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { catchError, of } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { formatarMoeda } from '../../core/utils/formato';
import {
  EditarPagamentoModal,
  EventoSalvarPagamento,
} from '../../features/pagamentos/editar-pagamento-modal/editar-pagamento-modal';
import { normalizarPagamento } from '../../features/pagamentos/pagamentos-calc';
import { Pagamento } from '../../features/pagamentos/pagamentos.models';
import { AcoesPagamento, AlteracaoPagamento } from './acoes-pagamento';

/**
 * Popup "Pagamentos vinculados" (14/09/2026) — extraído/generalizado do
 * popup que já existia só dentro de `MapasObra` (ver `mapas-obra.html`),
 * pra ser reaproveitado pelos cards de Mapas E Empreitas do Dashboard
 * (`origemTipo`/`origemRefId` genéricos — `ApiService.listarPagamentos`
 * já suporta os dois desde sempre, `MapasObra` só nunca tinha usado o
 * filtro por origem no servidor, buscava tudo da obra e agrupava local).
 *
 * Ações por linha (21/09/2026): clicar na linha ou em "Ver" abre o pagamento
 * para edição; ✔ confirma um pendente; ✖ exclui (com aviso). Ver `AcoesPagamento`.
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
  /** Avisa que um pagamento foi confirmado, editado ou excluído aqui dentro (a tela de fora pode recarregar seus totais). */
  readonly alterou = output<void>();

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly carregando = signal(true);
  protected readonly pagamentos = signal<Pagamento[]>([]);

  private readonly acoes = new AcoesPagamento(this.api, (alteracao) => this.aoAlterar(alteracao));
  protected readonly pagamentoEmEdicao = this.acoes.emEdicao;

  ngOnInit(): void {
    this.api
      .listarPagamentos({ origemTipo: this.origemTipo(), origemRefId: this.origemRefId() })
      .pipe(catchError(() => of([])))
      .subscribe((lista) => {
        this.pagamentos.set(lista.map((bruto) => normalizarPagamento(bruto as Record<string, unknown>)));
        this.carregando.set(false);
      });
  }

  private aoAlterar(alteracao: AlteracaoPagamento): void {
    if (alteracao.tipo === 'excluido') {
      this.pagamentos.update((lista) => lista.filter((p) => p.id !== alteracao.id));
    } else {
      this.pagamentos.update((lista) => lista.map((p) => (p.id === alteracao.pagamento.id ? alteracao.pagamento : p)));
    }
    this.alterou.emit();
  }

  protected abrirPagamento(pagamento: Pagamento): void {
    this.acoes.abrir(pagamento);
  }

  protected fecharPagamento(): void {
    this.acoes.fechar();
  }

  protected salvarPagamento(evento: EventoSalvarPagamento): void {
    this.acoes.salvar(evento);
  }

  protected confirmarPagamento(pagamento: Pagamento): void {
    this.acoes.confirmar(pagamento);
  }

  protected excluirPagamento(pagamento: Pagamento): void {
    this.acoes.excluir(pagamento);
  }
}
