import { Component, OnInit, inject, signal } from '@angular/core';

import { ApiService } from '../../../core/services/api.service';
import { Tag } from './tags.models';

/**
 * Aba "Tags" do popup de Configurações (06/09/2026, pedido do Lucas:
 * controle de notas fiscais por anexo em Pagamentos/Recebimentos). Criar
 * uma tag aqui cria automaticamente uma pasta com o nome dela dentro de
 * "Arquivos compartilhados" de TODA obra da empresa (ver `TagController`,
 * backend) — é ali que os arquivos anexados com essa tag em qualquer
 * Pagamento/Recebimento são organizados (ver `shared/anexos-lancamento`).
 *
 * Sem modal-dentro-do-modal (diferente de "Representantes" em
 * `dados-empresa.ts`) de propósito: o único campo é o nome, então criar/
 * renomear usa `window.prompt`, mesmo padrão já usado pra renomear
 * pasta/arquivo em `arquivos.ts`.
 */
@Component({
  selector: 'app-tags',
  templateUrl: './tags.html',
  styleUrl: './tags.scss',
})
export class Tags implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly tags = signal<Tag[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarTags().subscribe({
      next: (lista) => {
        this.tags.set(lista);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as tags.');
        this.carregando.set(false);
      },
    });
  }

  protected nova(): void {
    const nome = window.prompt('Nome da nova tag (ex.: Nota Fiscal):');
    if (!nome?.trim()) return;

    this.api.criarTag(nome.trim()).subscribe({
      next: (tag) => this.tags.update((lista) => [...lista, tag].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))),
      error: (erro) => window.alert(this.mensagemDeErro(erro, 'Não foi possível criar a tag.')),
    });
  }

  protected renomear(tag: Tag): void {
    const nome = window.prompt('Novo nome:', tag.nome);
    if (!nome?.trim() || nome.trim() === tag.nome) return;

    this.api.atualizarTag(tag.id, { nome: nome.trim() }).subscribe({
      next: (atualizada) => this.tags.update((lista) => lista.map((t) => (t.id === atualizada.id ? atualizada : t))),
      error: (erro) => window.alert(this.mensagemDeErro(erro, 'Não foi possível renomear a tag.')),
    });
  }

  /**
   * Mostra o motivo REAL devolvido pelo servidor (validação 422, por
   * exemplo "Já existe uma tag com esse nome") em vez de um aviso
   * genérico — antes, qualquer falha virava "talvez já exista", o que
   * escondia erros de outra natureza (sessão expirada, erro 500...).
   */
  private mensagemDeErro(erro: unknown, padrao: string): string {
    const resposta = erro as { status?: number; error?: { message?: string; errors?: Record<string, string[]> } };
    const detalhe = resposta?.error?.errors?.['nome']?.[0] ?? resposta?.error?.message;

    if (resposta?.status === 422 && detalhe) return detalhe;
    if (resposta?.status === 401) return `${padrao} Sua sessão expirou — entre novamente.`;
    if (resposta?.status === 403) return `${padrao} Você não tem permissão para isso.`;
    if (resposta?.status && resposta.status >= 500) return `${padrao} Erro no servidor (${resposta.status}) — avise o suporte.`;
    if (resposta?.status === 0) return `${padrao} Sem conexão com o servidor.`;
    return detalhe ? `${padrao} ${detalhe}` : padrao;
  }

  protected alternarAtivo(tag: Tag): void {
    this.api.atualizarTag(tag.id, { ativo: !tag.ativo }).subscribe({
      next: (atualizada) => this.tags.update((lista) => lista.map((t) => (t.id === atualizada.id ? atualizada : t))),
      error: () => window.alert('Não foi possível alterar o status da tag.'),
    });
  }

  protected excluir(tag: Tag): void {
    if (!window.confirm(`Excluir a tag "${tag.nome}"? A pasta e os arquivos já anexados com ela continuam existindo, só deixam de ter uma tag associada.`)) {
      return;
    }

    this.api.excluirTag(tag.id).subscribe({
      next: () => this.tags.update((lista) => lista.filter((t) => t.id !== tag.id)),
      error: () => window.alert('Não foi possível excluir a tag.'),
    });
  }
}
