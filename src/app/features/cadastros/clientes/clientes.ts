import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';

import {
  apenasDigitos,
  formatarDocumento,
  formatarTelefone,
  tipoDoDocumento,
  validarDocumento,
} from '../../../core/utils/documento';
import { gerarId } from '../../eap/eap-normalize';
import { CadastroStore } from '../cadastro.store';
import { Cliente, TipoPessoa } from '../cadastros.models';

const CHAVE = 'controleObra.clientes.v1';

/**
 * Valida CPF ou CNPJ pelos dígitos verificadores.
 *
 * Campo vazio passa: o documento não é obrigatório no cadastro, porque
 * às vezes a obra começa antes de o cliente enviar a documentação. Mas
 * se for preenchido, tem que estar certo.
 */
function documentoValido(controle: AbstractControl): ValidationErrors | null {
  const valor = String(controle.value ?? '').trim();
  if (!valor) return null;
  return validarDocumento(valor) ? null : { documentoInvalido: true };
}

/**
 * Cadastro de Clientes — tela nova, vinda do protótipo do Lucas.
 *
 * Pessoa física e jurídica no mesmo formulário, com os campos
 * específicos aparecendo conforme o tipo. O documento é validado pelos
 * dígitos verificadores, não só pelo tamanho: um CPF inválido passaria
 * despercebido até a hora de emitir nota.
 */
@Component({
  selector: 'app-clientes',
  imports: [ReactiveFormsModule],
  providers: [CadastroStore],
  templateUrl: './clientes.html',
  styleUrl: './clientes.scss',
})
export class Clientes implements OnInit {
  protected readonly store = inject<CadastroStore<Cliente>>(CadastroStore);
  private readonly fb = inject(FormBuilder);

  protected readonly formularioAberto = signal(false);
  protected readonly editandoId = signal<string | null>(null);

  protected readonly formatarDocumento = formatarDocumento;
  protected readonly formatarTelefone = formatarTelefone;

  protected readonly formulario = this.fb.nonNullable.group({
    identificacao: [''],
    nome: ['', [Validators.required]],
    tipo: ['PF' as TipoPessoa],
    documento: ['', [documentoValido]],
    telefone: [''],
    email: ['', [Validators.email]],
    endereco: [''],
    rg: [''],
    dataNascimento: [''],
    inscricaoEstadual: [''],
    responsavel: [''],
    documentoResponsavel: ['', [documentoValido]],
    observacoes: [''],
  });

  ngOnInit(): void {
    this.store.configurar(CHAVE, (bruto) => this.normalizar(bruto), [
      'nome',
      'identificacao',
      'documento',
      'endereco',
    ]);
    this.store.carregar();
  }

  private normalizar(bruto: Record<string, unknown>): Cliente {
    const tipo = String(bruto['tipo'] ?? '').toUpperCase();

    return {
      id: bruto['id'] ? String(bruto['id']) : gerarId(),
      identificacao: String(bruto['identificacao'] ?? ''),
      nome: String(bruto['nome'] ?? ''),
      tipo: tipo === 'PJ' ? 'PJ' : 'PF',
      documento: apenasDigitos(bruto['documento']),
      telefone: apenasDigitos(bruto['telefone']),
      email: String(bruto['email'] ?? ''),
      endereco: String(bruto['endereco'] ?? ''),
      ativo: bruto['ativo'] !== false,
      rg: String(bruto['rg'] ?? ''),
      dataNascimento: String(bruto['dataNascimento'] ?? ''),
      inscricaoEstadual: String(bruto['inscricaoEstadual'] ?? ''),
      responsavel: String(bruto['responsavel'] ?? ''),
      documentoResponsavel: apenasDigitos(bruto['documentoResponsavel']),
      observacoes: String(bruto['observacoes'] ?? ''),
    };
  }

  // ------------------------------------------------------------------
  // Formulário
  // ------------------------------------------------------------------
  protected novo(): void {
    this.editandoId.set(null);
    this.formulario.reset({ tipo: 'PF' });
    this.formularioAberto.set(true);
  }

  protected editar(cliente: Cliente): void {
    this.editandoId.set(cliente.id);
    this.formulario.reset({
      identificacao: cliente.identificacao,
      nome: cliente.nome,
      tipo: cliente.tipo,
      documento: formatarDocumento(cliente.documento),
      telefone: formatarTelefone(cliente.telefone),
      email: cliente.email,
      endereco: cliente.endereco,
      rg: cliente.rg,
      dataNascimento: cliente.dataNascimento,
      inscricaoEstadual: cliente.inscricaoEstadual,
      responsavel: cliente.responsavel,
      documentoResponsavel: formatarDocumento(cliente.documentoResponsavel),
      observacoes: cliente.observacoes,
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

  /** Reformata enquanto digita, para a máscara acompanhar. */
  protected mascararDocumento(campo: 'documento' | 'documentoResponsavel', evento: Event): void {
    const alvo = evento.target as HTMLInputElement;
    const formatado = formatarDocumento(alvo.value);
    alvo.value = formatado;
    this.formulario.get(campo)?.setValue(formatado);
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
      identificacao: valores.identificacao.trim(),
      nome: valores.nome.trim(),
      tipo: valores.tipo,
      documento: apenasDigitos(valores.documento),
      telefone: apenasDigitos(valores.telefone),
      email: valores.email.trim(),
      endereco: valores.endereco.trim(),
      ativo: id ? (this.store.obter(id)?.ativo ?? true) : true,
      rg: valores.rg.trim(),
      dataNascimento: valores.dataNascimento,
      inscricaoEstadual: valores.inscricaoEstadual.trim(),
      responsavel: valores.responsavel.trim(),
      documentoResponsavel: apenasDigitos(valores.documentoResponsavel),
      observacoes: valores.observacoes.trim(),
    });

    this.fechar();
  }

  protected remover(cliente: Cliente): void {
    const nome = cliente.nome || 'este cliente';
    if (
      !window.confirm(
        `Excluir ${nome} definitivamente?\n\n` +
          `Se ele tem obras cadastradas, prefira desativar — assim o histórico é preservado.`,
      )
    ) {
      return;
    }
    this.store.remover(cliente.id);
  }

  // ------------------------------------------------------------------
  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  protected rotuloDocumento(cliente: Cliente): string {
    if (!cliente.documento) return '—';
    return formatarDocumento(cliente.documento);
  }

  protected rotuloTipoDocumento(): string {
    const tipo = tipoDoDocumento(this.formulario.controls.documento.value);
    if (tipo === 'cpf') return 'CPF';
    if (tipo === 'cnpj') return 'CNPJ';
    return 'CPF / CNPJ';
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
