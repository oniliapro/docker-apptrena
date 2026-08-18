import { Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
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
  imports: [ItemArquivo, PreviewModal],
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

  protected readonly criandoPasta = signal(false);
  protected readonly nomeNovaPasta = signal('');

  protected readonly previewAberto = signal<Arquivo | null>(null);

  // ---- Modal "mover para..." ----
  protected readonly moverAlvo = signal<{ tipo: 'pasta' | 'arquivo'; item: Pasta | Arquivo } | null>(null);
  protected readonly moverConteudo = signal<ConteudoPasta | null>(null);

  protected readonly moverAlvoNome = computed(() => {
    const alvo = this.moverAlvo();
    if (!alvo) return '';
    return alvo.tipo === 'pasta' ? (alvo.item as Pasta).nome : (alvo.item as Arquivo).nome_original;
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
    const raiz = this.store.raizes();
    if (!raiz) return;

    const ownerAtual =
      item.tipo === 'pasta' ? item.pasta!.owner_user_id : this.store.pastaAtual()?.owner_user_id ?? null;
    const idInicial = ownerAtual === null ? raiz.compartilhada.id : raiz.propria.id;

    this.moverAlvo.set({ tipo: item.tipo, item: (item.pasta ?? item.arquivo)! });
    this.navegarMover(idInicial);
  }

  protected navegarMover(pastaId: string): void {
    this.api.obterPasta(pastaId).subscribe({
      next: (conteudo) => this.moverConteudo.set(conteudo),
      error: () => window.alert('Não foi possível abrir esta pasta.'),
    });
  }

  protected confirmarMover(): void {
    const alvo = this.moverAlvo();
    const destino = this.moverConteudo()?.pasta;
    if (!alvo || !destino) return;

    if (alvo.tipo === 'pasta') this.store.moverPasta(alvo.item as Pasta, destino.id);
    else this.store.moverArquivo(alvo.item as Arquivo, destino.id);

    this.fecharMover();
  }

  protected fecharMover(): void {
    this.moverAlvo.set(null);
    this.moverConteudo.set(null);
  }
}
