import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpEventType } from '@angular/common/http';

import { ApiService } from '../../core/services/api.service';
import {
  Arquivo,
  ConteudoPasta,
  ModoExibicao,
  Pasta,
  RaizesPastas,
} from './arquivos.models';

const CHAVE_MODO_EXIBICAO = 'trenaapp.arquivos.modoExibicao.v1';

interface UploadEmAndamento {
  nome: string;
  progresso: number;
}

/**
 * Estado da tela "Arquivos Anexados" — pasta atual, conteúdo carregado,
 * modo de exibição (persistido em localStorage, igual `CHAVE_OBRA_ATIVA`
 * em diario-obra.ts) e uploads em andamento. Store por rota (fornecida no
 * componente, não `providedIn: 'root'`), mesmo padrão de EapStore/MapaStore.
 */
@Injectable()
export class ArquivosStore {
  private readonly api = inject(ApiService);

  private obraId = '';

  readonly raizes = signal<RaizesPastas | null>(null);
  readonly conteudo = signal<ConteudoPasta | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  readonly modoExibicao = signal<ModoExibicao>(this.lerModoSalvo());

  /** Chave = nome do arquivo sendo enviado (rótulo simples, suficiente pra um upload por vez na UI). */
  readonly uploadsEmAndamento = signal<UploadEmAndamento[]>([]);

  readonly pastaAtual = computed(() => this.conteudo()?.pasta ?? null);

  carregar(obraId: string): void {
    this.obraId = obraId;
    this.carregando.set(true);
    this.erro.set(null);

    this.api.obterPastasRaizes(obraId).subscribe({
      next: (raizes) => {
        this.raizes.set(raizes);
        this.navegarPara(raizes.propria.id);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as pastas desta obra.');
        this.carregando.set(false);
      },
    });
  }

  navegarPara(pastaId: string): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.obterPasta(pastaId).subscribe({
      next: (conteudo) => {
        this.conteudo.set(conteudo);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível abrir esta pasta.');
        this.carregando.set(false);
      },
    });
  }

  recarregar(): void {
    const atual = this.pastaAtual();
    if (atual) this.navegarPara(atual.id);
  }

  definirModoExibicao(modo: ModoExibicao): void {
    this.modoExibicao.set(modo);
    try {
      localStorage.setItem(CHAVE_MODO_EXIBICAO, modo);
    } catch {
      // sem persistência: a escolha vale só para esta sessão.
    }
  }

  criarSubpasta(nome: string): void {
    const atual = this.pastaAtual();
    if (!atual || !nome.trim()) return;
    this.api.criarSubpasta(atual.id, nome.trim()).subscribe({
      next: () => this.recarregar(),
      error: () => window.alert('Não foi possível criar a pasta.'),
    });
  }

  renomearPasta(pasta: Pasta, nome: string): void {
    if (!nome.trim() || nome.trim() === pasta.nome) return;
    this.api.atualizarPasta(pasta.id, { nome: nome.trim() }).subscribe({
      next: () => this.recarregar(),
      error: () => window.alert('Não foi possível renomear a pasta.'),
    });
  }

  moverPasta(pasta: Pasta, novoParentId: string): void {
    this.api.atualizarPasta(pasta.id, { parent_id: novoParentId }).subscribe({
      next: () => this.recarregar(),
      error: () => window.alert('Não foi possível mover a pasta.'),
    });
  }

  excluirPasta(pasta: Pasta): void {
    if (!window.confirm(`Excluir a pasta "${pasta.nome}" e tudo dentro dela?`)) return;
    this.api.excluirPasta(pasta.id).subscribe({
      next: () => this.recarregar(),
      error: () => window.alert('Não foi possível excluir a pasta.'),
    });
  }

  enviarArquivos(arquivos: FileList | File[]): void {
    const atual = this.pastaAtual();
    if (!atual) return;

    for (const arquivo of Array.from(arquivos)) {
      this.uploadsEmAndamento.update((lista) => [...lista, { nome: arquivo.name, progresso: 0 }]);

      this.api.enviarArquivo(atual.id, arquivo).subscribe({
        next: (evento) => {
          if (evento.type === HttpEventType.UploadProgress && evento.total) {
            const progresso = Math.round((evento.loaded / evento.total) * 100);
            this.atualizarProgresso(arquivo.name, progresso);
          } else if (evento.type === HttpEventType.Response) {
            this.removerUpload(arquivo.name);
            this.recarregar();
          }
        },
        error: () => {
          this.removerUpload(arquivo.name);
          window.alert(`Não foi possível enviar "${arquivo.name}".`);
        },
      });
    }
  }

  renomearArquivo(arquivo: Arquivo, nome: string): void {
    if (!nome.trim() || nome.trim() === arquivo.nome_original) return;
    this.api.atualizarArquivo(arquivo.id, { nome_original: nome.trim() }).subscribe({
      next: () => this.recarregar(),
      error: () => window.alert('Não foi possível renomear o arquivo.'),
    });
  }

  moverArquivo(arquivo: Arquivo, novaPastaId: string): void {
    this.api.atualizarArquivo(arquivo.id, { pasta_id: novaPastaId }).subscribe({
      next: () => this.recarregar(),
      error: () => window.alert('Não foi possível mover o arquivo.'),
    });
  }

  excluirArquivo(arquivo: Arquivo): void {
    if (!window.confirm(`Excluir o arquivo "${arquivo.nome_original}"?`)) return;
    this.api.excluirArquivo(arquivo.id).subscribe({
      next: () => this.recarregar(),
      error: () => window.alert('Não foi possível excluir o arquivo.'),
    });
  }

  baixarArquivo(arquivo: Arquivo): void {
    this.api.baixarArquivo(arquivo.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = arquivo.nome_original;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => window.alert('Não foi possível baixar o arquivo.'),
    });
  }

  private atualizarProgresso(nome: string, progresso: number): void {
    this.uploadsEmAndamento.update((lista) =>
      lista.map((u) => (u.nome === nome ? { ...u, progresso } : u)),
    );
  }

  private removerUpload(nome: string): void {
    this.uploadsEmAndamento.update((lista) => lista.filter((u) => u.nome !== nome));
  }

  private lerModoSalvo(): ModoExibicao {
    try {
      return (localStorage.getItem(CHAVE_MODO_EXIBICAO) as ModoExibicao) || 'icones-medios';
    } catch {
      return 'icones-medios';
    }
  }
}
