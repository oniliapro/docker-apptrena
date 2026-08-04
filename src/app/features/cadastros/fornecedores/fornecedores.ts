import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import {
  apenasDigitos,
  formatarDocumento,
  formatarTelefone,
  validarDocumento,
} from '../../../core/utils/documento';
import { gerarId } from '../../eap/eap-normalize';
import { CadastroStore } from '../cadastro.store';
import { ContatoFornecedor, Fornecedor, TipoPessoa } from '../cadastros.models';

const CHAVE = 'controleObra.fornecedores.v1';

/** Documento é opcional, mas se preenchido tem que ser válido. */
function documentoValido(controle: AbstractControl): ValidationErrors | null {
  const valor = String(controle.value ?? '').trim();
  if (!valor) return null;
  return validarDocumento(valor) ? null : { documentoInvalido: true };
}

/**
 * Cadastro de Fornecedores — pedido do Lucas (04/08/2026).
 *
 * Hoje o Mapa de cotação aceita o nome do fornecedor digitado livremente
 * a cada cotação; a ideia deste cadastro é ter uma base de verdade (com
 * contatos) pra selecionar no Mapa em vez de redigitar — evita erro de
 * digitação e agiliza (ver task #72, ainda não feita: ligar o Mapa a
 * este cadastro).
 *
 * Mesmo padrão dos outros cadastros simples (Clientes, Responsáveis,
 * Empreiteiros): `CadastroStore` genérico sobre a ponte chave-valor.
 * Único campo mais elaborado é `contatos`, uma lista (nome + telefone),
 * editada com um `FormArray`.
 */
@Component({
  selector: 'app-fornecedores',
  imports: [ReactiveFormsModule],
  providers: [CadastroStore],
  templateUrl: './fornecedores.html',
  styleUrl: './fornecedores.scss',
})
export class Fornecedores implements OnInit {
  protected readonly store = inject<CadastroStore<Fornecedor>>(CadastroStore);
  private readonly fb = inject(FormBuilder);

  protected readonly formularioAberto = signal(false);
  protected readonly editandoId = signal<string | null>(null);

  protected readonly formatarDocumento = formatarDocumento;
  protected readonly formatarTelefone = formatarTelefone;

  protected readonly formulario = this.fb.nonNullable.group({
    nome: ['', [Validators.required]],
    tipo: ['PF' as TipoPessoa],
    documento: ['', [documentoValido]],
    endereco: [''],
    especialidade: [''],
    observacoes: [''],
    contatos: this.fb.array<ReturnType<typeof this.novoControleContato>>([]),
  });

  ngOnInit(): void {
    this.store.configurar(CHAVE, (bruto) => this.normalizar(bruto), [
      'nome',
      'especialidade',
      'documento',
    ]);
    this.store.carregar();
  }

  private normalizar(bruto: Record<string, unknown>): Fornecedor {
    const tipo = String(bruto['tipo'] ?? '').toUpperCase();
    const contatosBrutos = Array.isArray(bruto['contatos']) ? bruto['contatos'] : [];

    return {
      id: bruto['id'] ? String(bruto['id']) : gerarId(),
      nome: String(bruto['nome'] ?? ''),
      tipo: tipo === 'PJ' ? 'PJ' : 'PF',
      documento: apenasDigitos(bruto['documento']),
      endereco: String(bruto['endereco'] ?? ''),
      especialidade: String(bruto['especialidade'] ?? ''),
      observacoes: String(bruto['observacoes'] ?? ''),
      contatos: contatosBrutos.map((c) => this.normalizarContato(c as Record<string, unknown>)),
      ativo: bruto['ativo'] !== false,
    };
  }

  private normalizarContato(bruto: Record<string, unknown>): ContatoFornecedor {
    return {
      id: bruto['id'] ? String(bruto['id']) : gerarId(),
      nome: String(bruto['nome'] ?? ''),
      telefone: apenasDigitos(bruto['telefone']),
    };
  }

  // ------------------------------------------------------------------
  // Contatos (FormArray)
  // ------------------------------------------------------------------
  private novoControleContato(contato?: ContatoFornecedor) {
    return this.fb.nonNullable.group({
      id: [contato?.id ?? gerarId()],
      nome: [contato?.nome ?? ''],
      telefone: [contato ? formatarTelefone(contato.telefone) : ''],
    });
  }

  protected get contatos(): FormArray {
    return this.formulario.controls.contatos;
  }

  protected adicionarContato(): void {
    this.contatos.push(this.novoControleContato());
  }

  protected removerContato(indice: number): void {
    this.contatos.removeAt(indice);
  }

  protected mascararTelefoneContato(indice: number, evento: Event): void {
    const alvo = evento.target as HTMLInputElement;
    const formatado = formatarTelefone(alvo.value);
    alvo.value = formatado;
    this.contatos.at(indice).get('telefone')?.setValue(formatado);
  }

  // ------------------------------------------------------------------
  // Formulário
  // ------------------------------------------------------------------
  protected novo(): void {
    this.editandoId.set(null);
    this.contatos.clear();
    this.formulario.reset({ tipo: 'PF' });
    this.formularioAberto.set(true);
  }

  protected editar(registro: Fornecedor): void {
    this.editandoId.set(registro.id);
    this.contatos.clear();
    for (const contato of registro.contatos) this.contatos.push(this.novoControleContato(contato));

    this.formulario.reset({
      nome: registro.nome,
      tipo: registro.tipo,
      documento: formatarDocumento(registro.documento),
      endereco: registro.endereco,
      especialidade: registro.especialidade,
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

  protected salvar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.getRawValue();
    const id = this.editandoId();

    const contatos: ContatoFornecedor[] = valores.contatos
      .filter((c) => c.nome.trim() || c.telefone.trim())
      .map((c) => ({ id: c.id, nome: c.nome.trim(), telefone: apenasDigitos(c.telefone) }));

    this.store.gravar({
      id: id ?? '',
      nome: valores.nome.trim(),
      tipo: valores.tipo,
      documento: apenasDigitos(valores.documento),
      endereco: valores.endereco.trim(),
      especialidade: valores.especialidade.trim(),
      observacoes: valores.observacoes.trim(),
      contatos,
      ativo: id ? (this.store.obter(id)?.ativo ?? true) : true,
    });

    this.fechar();
  }

  protected remover(registro: Fornecedor): void {
    const nome = registro.nome || 'este fornecedor';
    if (
      !window.confirm(
        `Excluir ${nome} definitivamente?\n\n` +
          `Se ele já foi usado em algum mapa, prefira desativar — assim o histórico é preservado.`,
      )
    ) {
      return;
    }
    this.store.remover(registro.id);
  }

  // ------------------------------------------------------------------
  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  protected rotuloContatos(registro: Fornecedor): string {
    if (!registro.contatos.length) return '—';
    return registro.contatos.map((c) => c.nome).filter(Boolean).join(', ') || '—';
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
