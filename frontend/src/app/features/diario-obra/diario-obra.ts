import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Obra, RegistroDiario } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, hojeIso } from '../../core/utils/formato';

const CHAVE_OBRA_ATIVA = 'trenaapp.obraAtiva.v1';

/**
 * Diário de Obra — portado de js/diario-obra/01-app.js.
 *
 * Mantém o fluxo original: escolher a obra ativa (lembrada entre visitas),
 * registrar o dia com fotos opcionais, e listar/excluir os registros
 * daquela obra. O modal de "nova obra" também veio junto, porque sem ele
 * um usuário novo fica travado — não há obra para selecionar.
 */
@Component({
  selector: 'app-diario-obra',
  imports: [ReactiveFormsModule],
  templateUrl: './diario-obra.html',
  styleUrl: './diario-obra.scss',
})
export class DiarioObra implements OnInit {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);

  protected readonly obras = signal<Obra[]>([]);
  protected readonly obraAtiva = signal<string>('');
  protected readonly registros = signal<RegistroDiario[]>([]);

  protected readonly carregando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly status = signal<string>('');
  protected readonly erro = signal<string | null>(null);

  protected readonly modalAberto = signal(false);
  protected readonly criandoObra = signal(false);

  /** Arquivos escolhidos no <input type="file"> — fora do form reativo. */
  private fotos: File[] = [];

  protected readonly formatarData = formatarData;

  protected readonly formulario = this.fb.nonNullable.group({
    data: [hojeIso(), [Validators.required]],
    clima: [''],
    autor: [''],
    titulo: [''],
    descricao: [''],
  });

  protected readonly formNovaObra = this.fb.nonNullable.group({
    nome: ['', [Validators.required]],
    cliente: [''],
  });

  ngOnInit(): void {
    this.carregarObras();
  }

  // ------------------------------------------------------------------
  // Obras
  // ------------------------------------------------------------------
  private carregarObras(): void {
    this.api.listarObras().subscribe({
      next: (obras) => {
        this.obras.set(obras);

        const salva = this.lerObraSalva();
        const escolhida = salva && obras.some((o) => o.id === salva) ? salva : (obras[0]?.id ?? '');

        this.obraAtiva.set(escolhida);
        if (escolhida) this.carregarRegistros();
      },
      error: () => this.erro.set('Não foi possível carregar as obras.'),
    });
  }

  protected trocarObra(evento: Event): void {
    const id = (evento.target as HTMLSelectElement).value;
    this.obraAtiva.set(id);
    this.salvarObraAtiva(id);
    this.carregarRegistros();
  }

  protected abrirModalNovaObra(): void {
    this.formNovaObra.reset({ nome: '', cliente: '' });
    this.modalAberto.set(true);
  }

  protected fecharModalNovaObra(): void {
    this.modalAberto.set(false);
  }

  protected criarObra(): void {
    if (this.formNovaObra.invalid || this.criandoObra()) return;

    this.criandoObra.set(true);
    const { nome, cliente } = this.formNovaObra.getRawValue();

    this.api.criarObra({ obra_nome: nome.trim(), cliente: cliente.trim() }).subscribe({
      next: (nova) => {
        this.criandoObra.set(false);
        this.fecharModalNovaObra();
        this.obras.update((lista) => [...lista, nova]);
        this.obraAtiva.set(nova.id);
        this.salvarObraAtiva(nova.id);
        this.carregarRegistros();
      },
      error: () => {
        this.criandoObra.set(false);
        window.alert('Não foi possível criar a obra.');
      },
    });
  }

  // ------------------------------------------------------------------
  // Registros
  // ------------------------------------------------------------------
  private carregarRegistros(): void {
    const obraId = this.obraAtiva();
    if (!obraId) {
      this.registros.set([]);
      return;
    }

    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarDiario({ obraId }).subscribe({
      next: (registros) => {
        this.registros.set(registros);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Erro ao carregar os registros.');
        this.carregando.set(false);
      },
    });
  }

  protected selecionarFotos(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.fotos = Array.from(input.files ?? []);
  }

  protected salvar(): void {
    const obraId = this.obraAtiva();
    if (!obraId) {
      window.alert('Escolha ou crie uma obra primeiro.');
      return;
    }
    if (this.formulario.invalid || this.salvando()) return;

    this.salvando.set(true);
    this.status.set('Salvando…');

    const valores = this.formulario.getRawValue();
    const dados = new FormData();
    dados.append('obra_id', obraId);
    dados.append('data', valores.data);
    dados.append('clima', valores.clima);
    dados.append('autor', valores.autor);
    dados.append('titulo', valores.titulo);
    dados.append('descricao', valores.descricao);
    this.fotos.forEach((foto) => dados.append('fotos[]', foto));

    this.api.criarRegistroDiario(dados).subscribe({
      next: () => {
        this.salvando.set(false);
        this.status.set('Registro salvo.');
        this.formulario.reset({ data: hojeIso(), clima: '', autor: '', titulo: '', descricao: '' });
        this.fotos = [];
        this.carregarRegistros();
      },
      error: () => {
        this.salvando.set(false);
        this.status.set('');
        window.alert('Não foi possível salvar o registro.');
      },
    });
  }

  protected remover(registro: RegistroDiario): void {
    if (!window.confirm('Excluir este registro do diário?')) return;

    this.api.excluirRegistroDiario(registro.id).subscribe({
      next: () => this.carregarRegistros(),
      error: () => window.alert('Não foi possível excluir.'),
    });
  }

  protected abrirFoto(url: string): void {
    window.open(url, '_blank', 'noopener');
  }

  // ------------------------------------------------------------------
  // Preferência de obra ativa
  // ------------------------------------------------------------------
  private lerObraSalva(): string {
    try {
      return localStorage.getItem(CHAVE_OBRA_ATIVA) ?? '';
    } catch {
      return '';
    }
  }

  private salvarObraAtiva(id: string): void {
    try {
      localStorage.setItem(CHAVE_OBRA_ATIVA, id);
    } catch {
      // sem persistência: a escolha vale só para esta sessão.
    }
  }
}
