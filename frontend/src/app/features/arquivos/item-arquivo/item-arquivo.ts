import { Component, computed, input, output } from '@angular/core';

import {
  Arquivo,
  CATEGORIAS_COM_MINIATURA,
  ItemPastaOuArquivo,
  MODOS_ICONE,
  ModoExibicao,
  formatarTamanho,
} from '../arquivos.models';

/**
 * Uma pasta ou arquivo, renderizado como linha (modo Lista) ou tile (modos
 * de ícone). O modo Detalhes usa uma tabela própria em arquivos.html (não
 * este componente), porque uma <tr> não pode ser a raiz de um componente
 * usado fora de uma <table>.
 */
@Component({
  selector: 'app-item-arquivo',
  templateUrl: './item-arquivo.html',
  styleUrl: './item-arquivo.scss',
})
export class ItemArquivo {
  readonly item = input.required<ItemPastaOuArquivo>();
  readonly modoExibicao = input.required<ModoExibicao>();
  /** Marcado na seleção múltipla (20/09/2026). */
  readonly selecionado = input(false);

  readonly abrir = output<void>();
  readonly renomear = output<void>();
  readonly excluir = output<void>();
  readonly mover = output<void>();
  readonly baixar = output<void>();
  readonly alternarSelecao = output<void>();

  protected readonly formatarTamanho = formatarTamanho;

  protected readonly ehIcone = computed(() => MODOS_ICONE.has(this.modoExibicao()));

  protected readonly arquivo = computed<Arquivo | undefined>(() => this.item().arquivo);

  /** Miniatura real (vídeo/áudio/PDF já processados) em vez do ícone genérico de formato. */
  protected readonly mostrarMiniatura = computed(() => {
    const arquivo = this.arquivo();
    if (!arquivo || !this.ehIcone()) return false;
    return CATEGORIAS_COM_MINIATURA.has(arquivo.categoria) && arquivo.thumbnail_status === 'pronto';
  });

  /** Áudio sem capa embutida: placeholder com visual próprio, não o ícone genérico comum. */
  protected readonly ehAudioSemMiniatura = computed(() => {
    const arquivo = this.arquivo();
    return Boolean(arquivo && arquivo.categoria === 'audio' && arquivo.thumbnail_status !== 'pronto');
  });

  protected readonly iconeGenerico = computed(() => {
    const arquivo = this.arquivo();
    if (!arquivo) return 'pasta';
    return arquivo.categoria;
  });
}
