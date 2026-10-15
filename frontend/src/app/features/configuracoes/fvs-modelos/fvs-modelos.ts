import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../../core/services/api.service';
import { ContratoModelo } from '../contrato-modelos/contrato-modelo.models';
import { FvsModelo } from '../../fvs/fvs.models';
import { FvsService } from '../../fvs/fvs.service';

/**
 * Aba "Fichas de verificação" do popup de Configurações (F10, 25/09/2026) —
 * cadastro de MODELOS reaproveitáveis (nome + lista de itens
 * Conforme/Não conforme/Não se aplica), no mesmo espírito de Materiais/
 * Profissionais. O vínculo com um item de verdade da EAP acontece na
 * própria tela da EAP de cada obra, não aqui.
 */
@Component({
  selector: 'app-fvs-modelos',
  templateUrl: './fvs-modelos.html',
  styleUrl: './fvs-modelos.scss',
})
export class FvsModelosConfig implements OnInit {
  private readonly fvsApi = inject(FvsService);
  private readonly api = inject(ApiService);

  protected readonly modelos = signal<FvsModelo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formularioAberto = signal(false);
  protected readonly editandoId = signal<string | null>(null);
  protected readonly fNome = signal('');
  protected readonly fItens = signal<string[]>(['']);
  /** Modelo de documento (tipo `fvs`) que formata a ficha impressa; vazio = o primeiro modelo ativo. */
  protected readonly fDocumentoId = signal('');
  protected readonly documentos = signal<ContratoModelo[]>([]);
  protected readonly salvando = signal(false);
  protected readonly erroFormulario = signal<string | null>(null);

  protected readonly nomeVazio = computed(() => !this.fNome().trim());

  ngOnInit(): void {
    this.carregar();
    // Só os modelos de documento do tipo "Ficha de verificação de serviço" (Modelos de documentos).
    this.api.listarContratoModelos('fvs').subscribe({
      next: (lista) => this.documentos.set(lista.filter((d) => d.ativo)),
      error: () => this.documentos.set([]),
    });
  }

  private carregar(): void {
    this.carregando.set(true);
    this.fvsApi.listarModelos().subscribe({
      next: (lista) => {
        this.modelos.set(lista);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os modelos.');
        this.carregando.set(false);
      },
    });
  }

  protected novo(): void {
    this.editandoId.set(null);
    this.fNome.set('');
    this.fItens.set(['']);
    this.fDocumentoId.set('');
    this.erroFormulario.set(null);
    this.formularioAberto.set(true);
  }

  protected editar(modelo: FvsModelo): void {
    this.editandoId.set(modelo.id);
    this.fNome.set(modelo.nome);
    this.fItens.set(modelo.itens.length ? modelo.itens.map((i) => i.descricao) : ['']);
    this.fDocumentoId.set(modelo.contrato_modelo_id ?? '');
    this.erroFormulario.set(null);
    this.formularioAberto.set(true);
  }

  protected fechar(): void {
    this.formularioAberto.set(false);
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected mudarDocumento(evento: Event): void {
    this.fDocumentoId.set((evento.target as HTMLSelectElement).value);
  }

  protected mudarNome(evento: Event): void {
    this.fNome.set(this.texto(evento));
  }

  protected mudarItem(indice: number, evento: Event): void {
    this.fItens.update((lista) => lista.map((v, i) => (i === indice ? this.texto(evento) : v)));
  }

  protected adicionarItem(): void {
    this.fItens.update((lista) => [...lista, '']);
  }

  protected removerItem(indice: number): void {
    this.fItens.update((lista) => (lista.length > 1 ? lista.filter((_, i) => i !== indice) : lista));
  }

  protected salvar(): void {
    const nome = this.fNome().trim();
    const itens = this.fItens().map((i) => i.trim()).filter((i) => i);

    if (!nome) {
      this.erroFormulario.set('Informe o nome do modelo.');
      return;
    }
    if (!itens.length) {
      this.erroFormulario.set('Informe ao menos um item a verificar.');
      return;
    }

    this.salvando.set(true);
    this.erroFormulario.set(null);
    const dados = {
      nome,
      itens: itens.map((descricao) => ({ descricao })),
      contrato_modelo_id: this.fDocumentoId() || null,
    };
    const id = this.editandoId();
    const requisicao = id ? this.fvsApi.atualizarModelo(id, dados) : this.fvsApi.criarModelo(dados);

    requisicao.subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.carregar();
      },
      error: () => {
        this.salvando.set(false);
        this.erroFormulario.set('Não foi possível salvar o modelo.');
      },
    });
  }

  protected excluir(modelo: FvsModelo): void {
    if (!confirm(`Excluir o modelo "${modelo.nome}"? Fichas já preenchidas com ele não são afetadas.`)) return;
    this.fvsApi.excluirModelo(modelo.id).subscribe({
      next: () => this.modelos.update((lista) => lista.filter((m) => m.id !== modelo.id)),
      error: () => this.erro.set('Não foi possível excluir este modelo.'),
    });
  }
}
