import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { BarraSelecao, AcaoLista } from '../../shared/barra-selecao/barra-selecao';
import { SelecaoMultipla, confirmarExclusaoEmLote } from '../../shared/selecao-lista/selecao-lista';
import { ItemArquivo } from './item-arquivo/item-arquivo';
import { PreviewModal } from './preview-modal/preview-modal';
import { ArquivosStore } from './arquivos.store';
import {
  Arquivo,
  ConteudoPasta,
  ItemPastaOuArquivo,
  MODOS_EXIBICAO,
  MODOS_ICONE,
  ModoExibicao,
  Pasta,
  formatarTamanho,
} from './arquivos.models';

/**
 * Minissistema de arquivos da aba "Arquivos Anexados" — pastas (com
 * aninhamento ilimitado) e arquivos dentro de uma obra. Todo usuário tem,
 * por obra, duas pastas-raiz automáticas: "Arquivos próprios" (privada) e
 * "Arquivos compartilhados" (visível a qualquer um da empresa com acesso
 * à obra) — ver PastaController::raizes no backend.
 */
@Component({
  selector: 'app-arquivos',
  imports: [ItemArquivo, PreviewModal, BarraSelecao],
  providers: [ArquivosStore],
  templateUrl: './arquivos.html',
  styleUrl: './arquivos.scss',
})
export class Arquivos implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly store = inject(ArquivosStore);

  /** Vem da rota pai (/obras/:id) via withComponentInputBinding(). */
  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly modos = MODOS_EXIBICAO;
  protected readonly modosIcone = MODOS_ICONE;
  protected readonly formatarTamanho = formatarTamanho;

  // ---- Seleção múltipla (20/09/2026) — opcional: os botões de cada item continuam. ----
  protected readonly selecao = new SelecaoMultipla<ItemPastaOuArquivo>((item) => item.id);
  protected readonly selecionados = computed(() => this.selecao.selecionados(this.itens()));
  protected readonly acoesLista: AcaoLista[] = [
    { chave: 'mover', rotulo: 'Mover para…' },
    { chave: 'excluir', rotulo: 'Excluir', perigo: true },
  ];

  protected renomearSelecionado(): void {
    const [primeiro] = this.selecionados();
    if (primeiro) this.renomearItem(primeiro);
  }

  protected aoAcaoLista(chave: string): void {
    const alvos = this.selecionados();
    if (!alvos.length) return;

    if (chave === 'mover') {
      this.abrirMoverVarios(alvos);
      return;
    }
    if (chave !== 'excluir') return;

    const temPasta = alvos.some((i) => i.tipo === 'pasta');
    if (
      !confirmarExclusaoEmLote(
        alvos.length,
        'item',
        'itens',
        temPasta ? 'As pastas são excluídas junto com tudo o que há dentro delas.' : '',
        alvos.map((i) => i.nome),
      )
    ) {
      return;
    }
    this.store.excluirVarios(alvos.map((i) => ({ tipo: i.tipo, id: i.id, nome: i.nome })));
    this.selecao.limpar();
  }

  protected readonly criandoPasta = signal(false);
  protected readonly nomeNovaPasta = signal('');

  protected readonly previewAberto = signal<Arquivo | null>(null);

  // ---- Modal "mover para..." ----
  /** Um ou vários itens sendo movidos (o modal serve tanto ao ⇄ de uma linha quanto ao "Mover" da seleção). */
  protected readonly moverAlvo = signal<{ tipo: 'pasta' | 'arquivo'; item: Pasta | Arquivo }[] | null>(null);
  protected readonly moverConteudo = signal<ConteudoPasta | null>(null);

  protected readonly moverAlvoNome = computed(() => {
    const alvos = this.moverAlvo();
    if (!alvos?.length) return '';
    if (alvos.length > 1) return `${alvos.length} itens`;
    const [alvo] = alvos;
    const nome = alvo.tipo === 'pasta' ? (alvo.item as Pasta).nome : (alvo.item as Arquivo).nome_original;
    return `"${nome}"`;
  });

  // Trocar de pasta zera a seleção: a ação não pode agir sobre o que a pessoa não está vendo.
  private readonly limparAoTrocarDePasta = effect(() => {
    this.store.conteudo()?.pasta.id;
    untracked(() => this.selecao.limpar());
  });

  protected readonly itens = computed<ItemPastaOuArquivo[]>(() => {
    const conteudo = this.store.conteudo();
    if (!conteudo) return [];
    const pastas: ItemPastaOuArquivo[] = conteudo.subpastas.map((p) => ({
      tipo: 'pasta',
      id: p.id,
      nome: p.nome,
      pasta: p,
    }));
    const arquivos: ItemPastaOuArquivo[] = conteudo.arquivos.map((a) => ({
      tipo: 'arquivo',
      id: a.id,
      nome: a.nome_original,
      arquivo: a,
    }));
    return [...pastas, ...arquivos];
  });

  protected readonly estaNaPropria = computed(() => {
    const raiz = this.store.raizes();
    const breadcrumb = this.store.conteudo()?.breadcrumb;
    return Boolean(raiz && breadcrumb?.[0]?.id === raiz.propria.id);
  });

  ngOnInit(): void {
    this.store.carregar(this.obraId());
  }

  // ------------------------------------------------------------------
  protected irParaPropria(): void {
    const raiz = this.store.raizes();
    if (raiz) this.store.navegarPara(raiz.propria.id);
  }

  protected irParaCompartilhada(): void {
    const raiz = this.store.raizes();
    if (raiz) this.store.navegarPara(raiz.compartilhada.id);
  }

  protected definirModo(modo: ModoExibicao): void {
    this.store.definirModoExibicao(modo);
  }

  // ------------------------------------------------------------------
  protected abrirItem(item: ItemPastaOuArquivo): void {
    if (item.tipo === 'pasta' && item.pasta) {
      this.store.navegarPara(item.pasta.id);
    } else if (item.arquivo) {
      this.previewAberto.set(item.arquivo);
    }
  }

  protected renomearItem(item: ItemPastaOuArquivo): void {
    const nome = window.prompt('Novo nome:', item.nome);
    if (nome === null) return;
    if (item.tipo === 'pasta' && item.pasta) this.store.renomearPasta(item.pasta, nome);
    else if (item.arquivo) this.store.renomearArquivo(item.arquivo, nome);
  }

  protected excluirItem(item: ItemPastaOuArquivo): void {
    if (item.tipo === 'pasta' && item.pasta) this.store.excluirPasta(item.pasta);
    else if (item.arquivo) this.store.excluirArquivo(item.arquivo);
  }

  protected baixarItem(item: ItemPastaOuArquivo): void {
    if (item.arquivo) this.store.baixarArquivo(item.arquivo);
  }

  // ------------------------------------------------------------------
  protected abrirFormNovaPasta(): void {
    this.criandoPasta.set(true);
    this.nomeNovaPasta.set('');
  }

  protected confirmarNovaPasta(): void {
    this.store.criarSubpasta(this.nomeNovaPasta());
    this.criandoPasta.set(false);
  }

  protected onArquivosSelecionados(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    if (input.files?.length) this.store.enviarArquivos(input.files);
    input.value = '';
  }

  // ---- Preview ----
  protected fecharPreview(): void {
    this.previewAberto.set(null);
  }

  protected baixarDoPreview(): void {
    const arquivo = this.previewAberto();
    if (arquivo) this.store.baixarArquivo(arquivo);
  }

  // ---- Mover ----
  protected abrirMover(item: ItemPastaOuArquivo): void {
    this.abrirMoverVarios([item]);
  }

  private abrirMoverVarios(itens: ItemPastaOuArquivo[]): void {
    const raiz = this.store.raizes();
    if (!raiz || !itens.length) return;
    const item = itens[0];

    const ownerAtual =
      item.tipo === 'pasta' ? item.pasta!.owner_user_id : this.store.pastaAtual()?.owner_user_id ?? null;
    const idInicial = ownerAtual === null ? raiz.compartilhada.id : raiz.propria.id;

    this.moverAlvo.set(itens.map((i) => ({ tipo: i.tipo, item: (i.pasta ?? i.arquivo)! })));
    this.navegarMover(idInicial);
  }

  protected navegarMover(pastaId: string): void {
    this.api.obterPasta(pastaId).subscribe({
      next: (conteudo) => this.moverConteudo.set(conteudo),
      error: () => window.alert('Não foi possível abrir esta pasta.'),
    });
  }

  protected confirmarMover(): void {
    const alvos = this.moverAlvo();
    const destino = this.moverConteudo()?.pasta;
    if (!alvos?.length || !destino) return;

    if (alvos.length === 1) {
      const [alvo] = alvos;
      if (alvo.tipo === 'pasta') this.store.moverPasta(alvo.item as Pasta, destino.id);
      else this.store.moverArquivo(alvo.item as Arquivo, destino.id);
    } else {
      this.store.moverVarios(
        alvos.map((a) => ({
          tipo: a.tipo,
          id: a.item.id,
          nome: a.tipo === 'pasta' ? (a.item as Pasta).nome : (a.item as Arquivo).nome_original,
        })),
        destino.id,
      );
      this.selecao.limpar();
    }

    this.fecharMover();
  }

  protected fecharMover(): void {
    this.moverAlvo.set(null);
    this.moverConteudo.set(null);
  }
}
