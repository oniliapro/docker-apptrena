import { Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { Arquivo, formatarTamanho } from '../../features/arquivos/arquivos.models';
import { PreviewModal } from '../../features/arquivos/preview-modal/preview-modal';
import { Tag } from '../../features/configuracoes/tags/tags.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData } from '../../core/utils/formato';

interface GrupoAnexos {
  tagNome: string;
  anexos: Arquivo[];
}

/**
 * "Anexar arquivo" + lista de anexos de um Pagamento/Recebimento
 * (06/09/2026, pedido do Lucas: controle de notas fiscais). Compartilhado
 * entre `EditarPagamentoModal` (Pagamentos + popup de pagamentos do Mapa,
 * de graça), o popup de anexos aberto pela coluna "Anexos" da Lista de
 * Pagamentos (`pagamentos.html`), e o modal de Recebimentos — mesma API
 * nos três lugares, só o endpoint muda conforme `origemTipo`.
 *
 * Lista agrupada por tag (`anexosAgrupados`); clicar num anexo abre
 * `PreviewModal` (mesmo componente já usado pela aba Arquivos comum);
 * baixar/excluir reaproveita `ApiService.baixarArquivo`/`excluirArquivo`
 * sem nenhuma mudança — um anexo é só um `Arquivo` normal. Excluir
 * recarrega a lista inteira depois (não só remove localmente) porque o
 * backend RENOMEIA os anexos que sobraram da mesma tag pra fechar o
 * buraco na sequência (`AnexoNomeador::aposExcluir`) — só um refetch
 * garante que os nomes exibidos batem com os novos.
 */
@Component({
  selector: 'app-anexos-lancamento',
  imports: [PreviewModal],
  templateUrl: './anexos-lancamento.html',
  styleUrl: './anexos-lancamento.scss',
})
export class AnexosLancamento implements OnInit {
  private readonly api = inject(ApiService);

  readonly origemTipo = input.required<'pagamento' | 'recebimento'>();
  readonly origemId = input.required<string>();

  protected readonly formatarTamanho = formatarTamanho;
  protected readonly formatarData = formatarData;

  protected readonly anexos = signal<Arquivo[]>([]);
  protected readonly tags = signal<Tag[]>([]);
  protected readonly carregando = signal(true);
  protected readonly enviando = signal(false);
  protected readonly tagEscolhida = signal('');
  protected readonly visualizando = signal<Arquivo | null>(null);

  protected readonly tagsAtivas = computed(() => this.tags().filter((t) => t.ativo));

  protected readonly anexosAgrupados = computed<GrupoAnexos[]>(() => {
    const grupos = new Map<string, Arquivo[]>();
    for (const anexo of this.anexos()) {
      const nome = anexo.tag?.nome || 'Sem tag';
      const lista = grupos.get(nome) ?? [];
      lista.push(anexo);
      grupos.set(nome, lista);
    }
    return Array.from(grupos.entries())
      .map(([tagNome, anexos]) => ({ tagNome, anexos }))
      .sort((a, b) => a.tagNome.localeCompare(b.tagNome, 'pt-BR'));
  });

  ngOnInit(): void {
    this.carregarAnexos();
    this.api.listarTags().subscribe({
      next: (lista) => this.tags.set(lista),
      error: () => this.tags.set([]),
    });
  }

  /** Público — `EditarPagamentoModal` chama depois de arquivar uma nota fiscal lida direto pelo "Ler nota" (a lista aqui não sabe disso sozinha). */
  recarregar(): void {
    this.carregarAnexos();
  }

  private carregarAnexos(aoTerminar?: () => void): void {
    this.carregando.set(true);
    const requisicao =
      this.origemTipo() === 'pagamento'
        ? this.api.listarAnexosPagamento(this.origemId())
        : this.api.listarAnexosRecebimento(this.origemId());

    requisicao.subscribe({
      next: (lista) => {
        this.anexos.set(lista);
        this.carregando.set(false);
        aoTerminar?.();
      },
      error: () => {
        this.anexos.set([]);
        this.carregando.set(false);
        aoTerminar?.();
      },
    });
  }

  protected mudarTagEscolhida(evento: Event): void {
    this.tagEscolhida.set((evento.target as HTMLSelectElement).value);
  }

  protected selecionarArquivo(evento: Event, inputArquivo: HTMLInputElement): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0] ?? null;
    const tagId = this.tagEscolhida();
    if (!arquivo) return;

    if (!tagId) {
      window.alert('Escolha uma tag antes de anexar o arquivo.');
      inputArquivo.value = '';
      return;
    }

    this.enviando.set(true);
    const requisicao =
      this.origemTipo() === 'pagamento'
        ? this.api.anexarArquivoPagamento(this.origemId(), tagId, arquivo)
        : this.api.anexarArquivoRecebimento(this.origemId(), tagId, arquivo);

    requisicao.subscribe({
      next: (novo) => {
        this.anexos.update((lista) => [...lista, novo]);
        this.enviando.set(false);
        inputArquivo.value = '';
      },
      error: () => {
        window.alert('Não foi possível anexar o arquivo.');
        this.enviando.set(false);
        inputArquivo.value = '';
      },
    });
  }

  protected abrirPreview(anexo: Arquivo): void {
    this.visualizando.set(anexo);
  }

  protected fecharPreview(): void {
    this.visualizando.set(null);
  }

  protected baixar(anexo: Arquivo): void {
    this.api.baixarArquivo(anexo.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = anexo.nome_original;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => window.alert('Não foi possível baixar o arquivo.'),
    });
  }

  protected excluir(anexo: Arquivo, evento: Event): void {
    evento.stopPropagation(); // não abre o preview do anexo que está sendo excluído
    if (!window.confirm(`Excluir "${anexo.nome_original}"?`)) return;

    this.api.excluirArquivo(anexo.id).subscribe({
      next: () => {
        // Refetch (não filtro local) — o backend renomeia os anexos que
        // sobraram da mesma tag pra fechar o buraco na sequência.
        this.carregarAnexos(() => {
          window.alert('O anexo foi excluído com sucesso, os anexos restantes foram renomeados.');
        });
      },
      error: () => window.alert('Não foi possível excluir o arquivo.'),
    });
  }
}
