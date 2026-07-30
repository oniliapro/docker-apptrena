import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { apenasDigitos, formatarTelefone } from '../../../core/utils/documento';
import { gerarId } from '../../eap/eap-normalize';
import { CadastroStore } from '../cadastro.store';
import { Responsavel } from '../cadastros.models';

const CHAVE = 'controleObra.responsaveis.v1';

/**
 * Cadastro de Responsáveis técnicos — tela nova, do protótipo do Lucas.
 *
 * São os engenheiros e técnicos que respondem pelas obras. O registro
 * profissional (CREA/CAU) é o dado que os distingue de um contato
 * qualquer: é ele que aparece nos documentos oficiais da obra.
 */
@Component({
  selector: 'app-responsaveis',
  imports: [ReactiveFormsModule],
  providers: [CadastroStore],
  templateUrl: './responsaveis.html',
  styleUrl: './responsaveis.scss',
})
export class Responsaveis implements OnInit {
  protected readonly store = inject<CadastroStore<Responsavel>>(CadastroStore);
  private readonly fb = inject(FormBuilder);

  protected readonly formularioAberto = signal(false);
  protected readonly editandoId = signal<string | null>(null);
  protected readonly formatarTelefone = formatarTelefone;

  protected readonly formulario = this.fb.nonNullable.group({
    nome: ['', [Validators.required]],
    registro: [''],
    telefone: [''],
    email: ['', [Validators.email]],
    observacoes: [''],
  });

  ngOnInit(): void {
    this.store.configurar(CHAVE, (bruto) => this.normalizar(bruto), [
      'nome',
      'registro',
      'email',
    ]);
    this.store.carregar();
  }

  private normalizar(bruto: Record<string, unknown>): Responsavel {
    return {
      id: bruto['id'] ? String(bruto['id']) : gerarId(),
      nome: String(bruto['nome'] ?? ''),
      registro: String(bruto['registro'] ?? ''),
      telefone: apenasDigitos(bruto['telefone']),
      email: String(bruto['email'] ?? ''),
      ativo: bruto['ativo'] !== false,
      observacoes: String(bruto['observacoes'] ?? ''),
    };
  }

  protected novo(): void {
    this.editandoId.set(null);
    this.formulario.reset();
    this.formularioAberto.set(true);
  }

  protected editar(registro: Responsavel): void {
    this.editandoId.set(registro.id);
    this.formulario.reset({
      nome: registro.nome,
      registro: registro.registro,
      telefone: formatarTelefone(registro.telefone),
      email: registro.email,
      observacoes: registro.observacoes,
    });
    this.formularioAberto.set(true);
  }

  protected fechar(): void {
    this.formularioAberto.set(false);
    this.editandoId.set(null);
  }

  protected mascararTelefone(evento: Event): void {
    const alvo = evento.target as HTMLInputElement;
    const formatado = formatarTelefone(alvo.value);
    alvo.value = formatado;
    this.formulario.controls.telefone.setValue(formatado);
  }

  protected salvar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.getRawValue();
    const id = this.editandoId();

    this.store.gravar({
      id: id ?? '',
      nome: valores.nome.trim(),
      registro: valores.registro.trim(),
      telefone: apenasDigitos(valores.telefone),
      email: valores.email.trim(),
      ativo: id ? (this.store.obter(id)?.ativo ?? true) : true,
      observacoes: valores.observacoes.trim(),
    });

    this.fechar();
  }

  protected remover(registro: Responsavel): void {
    const nome = registro.nome || 'este responsável';
    if (
      !window.confirm(
        `Excluir ${nome} definitivamente?\n\n` +
          `Se ele responde por alguma obra, prefira desativar — assim o histórico é preservado.`,
      )
    ) {
      return;
    }
    this.store.remover(registro.id);
  }

  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  protected mudarBusca(evento: Event): void {
    this.store.busca.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltro(evento: Event): void {
    this.store.filtroAtivos.set(
      (evento.target as HTMLSelectElement).value as 'todos' | 'ativos' | 'inativos',
    );
  }
}
