import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';

import {
  apenasDigitos,
  formatarDocumento,
  formatarTelefone,
  validarDocumento,
} from '../../../core/utils/documento';
import { gerarId } from '../../eap/eap-normalize';
import { CadastroStore } from '../cadastro.store';
import { Empreiteiro, TipoPessoa } from '../cadastros.models';

const CHAVE = 'controleObra.empreiteiros.v1';

/** Documento é opcional, mas se preenchido tem que ser válido. */
function documentoValido(controle: AbstractControl): ValidationErrors | null {
  const valor = String(controle.value ?? '').trim();
  if (!valor) return null;
  return validarDocumento(valor) ? null : { documentoInvalido: true };
}

/**
 * Cadastro de Empreiteiros — tela nova, do protótipo do Lucas.
 *
 * São quem executa os serviços contratados nas empreitas. Como podem ser
 * pessoa física (o pedreiro autônomo) ou jurídica (a empresa de
 * instalações), o cadastro aceita CPF e CNPJ. A especialidade é o que
 * permite achar rapidamente quem chamar para cada serviço.
 */
@Component({
  selector: 'app-empreiteiros',
  imports: [ReactiveFormsModule],
  providers: [CadastroStore],
  templateUrl: './empreiteiros.html',
  styleUrl: './empreiteiros.scss',
})
export class Empreiteiros implements OnInit {
  protected readonly store = inject<CadastroStore<Empreiteiro>>(CadastroStore);
  private readonly fb = inject(FormBuilder);

  protected readonly formularioAberto = signal(false);
  protected readonly editandoId = signal<string | null>(null);

  protected readonly formatarDocumento = formatarDocumento;
  protected readonly formatarTelefone = formatarTelefone;

  protected readonly formulario = this.fb.nonNullable.group({
    nome: ['', [Validators.required]],
    tipo: ['PF' as TipoPessoa],
    documento: ['', [documentoValido]],
    especialidade: [''],
    telefone: [''],
    email: ['', [Validators.email]],
    observacoes: [''],
  });

  ngOnInit(): void {
    this.store.configurar(CHAVE, (bruto) => this.normalizar(bruto), [
      'nome',
      'especialidade',
      'documento',
    ]);
    this.store.carregar();
  }

  private normalizar(bruto: Record<string, unknown>): Empreiteiro {
    const tipo = String(bruto['tipo'] ?? '').toUpperCase();

    return {
      id: bruto['id'] ? String(bruto['id']) : gerarId(),
      nome: String(bruto['nome'] ?? ''),
      tipo: tipo === 'PJ' ? 'PJ' : 'PF',
      documento: apenasDigitos(bruto['documento']),
      telefone: apenasDigitos(bruto['telefone']),
      email: String(bruto['email'] ?? ''),
      especialidade: String(bruto['especialidade'] ?? ''),
      ativo: bruto['ativo'] !== false,
      observacoes: String(bruto['observacoes'] ?? ''),
    };
  }

  protected novo(): void {
    this.editandoId.set(null);
    this.formulario.reset({ tipo: 'PF' });
    this.formularioAberto.set(true);
  }

  protected editar(registro: Empreiteiro): void {
    this.editandoId.set(registro.id);
    this.formulario.reset({
      nome: registro.nome,
      tipo: registro.tipo,
      documento: formatarDocumento(registro.documento),
      especialidade: registro.especialidade,
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

  protected mudarTipo(tipo: TipoPessoa): void {
    this.formulario.patchValue({ tipo });
  }

  protected get tipoAtual(): TipoPessoa {
    return this.formulario.controls.tipo.value;
  }

  protected mascararDocumento(evento: Event): void {
    const alvo = evento.target as HTMLInputElement;
    const formatado = formatarDocumento(alvo.value);
    alvo.value = formatado;
    this.formulario.controls.documento.setValue(formatado);
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
      tipo: valores.tipo,
      documento: apenasDigitos(valores.documento),
      telefone: apenasDigitos(valores.telefone),
      email: valores.email.trim(),
      especialidade: valores.especialidade.trim(),
      ativo: id ? (this.store.obter(id)?.ativo ?? true) : true,
      observacoes: valores.observacoes.trim(),
    });

    this.fechar();
  }

  protected remover(registro: Empreiteiro): void {
    const nome = registro.nome || 'este empreiteiro';
    if (
      !window.confirm(
        `Excluir ${nome} definitivamente?\n\n` +
          `Se ele tem empreitas registradas, prefira desativar — assim o histórico é preservado.`,
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
