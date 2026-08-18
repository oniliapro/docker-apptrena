import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
import { DadosRecebimento, Empreiteiro, TipoPessoa, rotuloTipoPessoa } from '../cadastros.models';
import { RedimensionarColunas } from '../../../shared/redimensionar-colunas/redimensionar-colunas';
import { valoresDistintos } from '../../../shared/filtros/filtros';

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
  imports: [ReactiveFormsModule, RedimensionarColunas],
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
  protected readonly rotuloTipoPessoa = rotuloTipoPessoa;

  /** Aba ativa no modal — "Dados de recebimento" é nova (19/08/2026, pedido do Lucas). */
  protected readonly abaAtiva = signal<'geral' | 'recebimento'>('geral');

  protected readonly formulario = this.fb.nonNullable.group({
    codigo: [''],
    nome: ['', [Validators.required]],
    tipo: ['PF' as TipoPessoa],
    documento: ['', [documentoValido]],
    especialidade: [''],
    telefone: [''],
    email: ['', [Validators.email]],
    observacoes: [''],
    dadosRecebimento: this.fb.array<ReturnType<typeof this.novoControleRecebimento>>([]),
  });

  ngOnInit(): void {
    this.store.configurar(CHAVE, (bruto) => this.normalizar(bruto), [
      'nome',
      'especialidade',
      'documento',
      'codigo',
    ]);
    this.store.carregar();
  }

  private normalizar(bruto: Record<string, unknown>): Empreiteiro {
    const tipo = String(bruto['tipo'] ?? '').toUpperCase();
    const recebimentosBrutos = Array.isArray(bruto['dadosRecebimento']) ? bruto['dadosRecebimento'] : [];

    return {
      id: bruto['id'] ? String(bruto['id']) : gerarId(),
      codigo: String(bruto['codigo'] ?? ''),
      nome: String(bruto['nome'] ?? ''),
      tipo: tipo === 'PJ' ? 'PJ' : 'PF',
      documento: apenasDigitos(bruto['documento']),
      telefone: apenasDigitos(bruto['telefone']),
      email: String(bruto['email'] ?? ''),
      especialidade: String(bruto['especialidade'] ?? ''),
      ativo: bruto['ativo'] !== false,
      observacoes: String(bruto['observacoes'] ?? ''),
      dadosRecebimento: recebimentosBrutos.map((r) => this.normalizarRecebimento(r as Record<string, unknown>)),
    };
  }

  private normalizarRecebimento(bruto: Record<string, unknown>): DadosRecebimento {
    const tipo = String(bruto['tipo'] ?? '').toUpperCase();
    return {
      id: bruto['id'] ? String(bruto['id']) : gerarId(),
      tipo: tipo === 'PJ' ? 'PJ' : 'PF',
      nomeTitular: String(bruto['nomeTitular'] ?? ''),
      documento: apenasDigitos(bruto['documento']),
      banco: String(bruto['banco'] ?? ''),
      agencia: String(bruto['agencia'] ?? ''),
      conta: String(bruto['conta'] ?? ''),
      chavePix: String(bruto['chavePix'] ?? ''),
    };
  }

  /**
   * Código interno (ex.: "EMP-014") gerado pelo sistema — mesmo padrão do
   * "CLI-NNN" dos Clientes (19/08/2026, pedido do Lucas).
   */
  private proximoCodigo(): string {
    const maior = this.store.registros().reduce((max, empreiteiro) => {
      const combinacao = /^EMP-(\d+)$/.exec(empreiteiro.codigo?.trim() ?? '');
      const numero = combinacao ? Number(combinacao[1]) : 0;
      return numero > max ? numero : max;
    }, 0);
    return `EMP-${String(maior + 1).padStart(3, '0')}`;
  }

  // ------------------------------------------------------------------
  // Dados de recebimento (FormArray) — mais de um por cadastro
  // (19/08/2026, pedido do Lucas).
  // ------------------------------------------------------------------
  private novoControleRecebimento(dados?: DadosRecebimento) {
    return this.fb.nonNullable.group({
      id: [dados?.id ?? gerarId()],
      tipo: [(dados?.tipo ?? 'PF') as TipoPessoa],
      nomeTitular: [dados?.nomeTitular ?? ''],
      documento: [dados ? formatarDocumento(dados.documento) : ''],
      banco: [dados?.banco ?? ''],
      agencia: [dados?.agencia ?? ''],
      conta: [dados?.conta ?? ''],
      chavePix: [dados?.chavePix ?? ''],
    });
  }

  protected get dadosRecebimento(): FormArray<ReturnType<typeof this.novoControleRecebimento>> {
    return this.formulario.controls.dadosRecebimento;
  }

  protected adicionarRecebimento(): void {
    this.dadosRecebimento.push(this.novoControleRecebimento());
  }

  protected removerRecebimento(indice: number): void {
    this.dadosRecebimento.removeAt(indice);
  }

  protected mascararDocumentoRecebimento(indice: number, evento: Event): void {
    const alvo = evento.target as HTMLInputElement;
    const formatado = formatarDocumento(alvo.value);
    alvo.value = formatado;
    this.dadosRecebimento.at(indice).get('documento')?.setValue(formatado);
  }

  protected novo(): void {
    this.editandoId.set(null);
    this.dadosRecebimento.clear();
    this.formulario.reset({ tipo: 'PF', codigo: this.proximoCodigo() });
    this.abaAtiva.set('geral');
    this.formularioAberto.set(true);
  }

  protected editar(registro: Empreiteiro): void {
    this.editandoId.set(registro.id);
    this.dadosRecebimento.clear();
    for (const dados of registro.dadosRecebimento) this.dadosRecebimento.push(this.novoControleRecebimento(dados));

    this.formulario.reset({
      codigo: registro.codigo,
      nome: registro.nome,
      tipo: registro.tipo,
      documento: formatarDocumento(registro.documento),
      especialidade: registro.especialidade,
      telefone: formatarTelefone(registro.telefone),
      email: registro.email,
      observacoes: registro.observacoes,
    });
    this.abaAtiva.set('geral');
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

    const dadosRecebimento: DadosRecebimento[] = valores.dadosRecebimento
      .filter((r) => r.nomeTitular.trim() || r.documento.trim() || r.banco.trim() || r.chavePix.trim())
      .map((r) => ({
        id: r.id,
        tipo: r.tipo,
        nomeTitular: r.nomeTitular.trim(),
        documento: apenasDigitos(r.documento),
        banco: r.banco.trim(),
        agencia: r.agencia.trim(),
        conta: r.conta.trim(),
        chavePix: r.chavePix.trim(),
      }));

    this.store.gravar({
      id: id ?? '',
      codigo: valores.codigo.trim() || this.proximoCodigo(),
      nome: valores.nome.trim(),
      tipo: valores.tipo,
      documento: apenasDigitos(valores.documento),
      telefone: apenasDigitos(valores.telefone),
      email: valores.email.trim(),
      especialidade: valores.especialidade.trim(),
      ativo: id ? (this.store.obter(id)?.ativo ?? true) : true,
      observacoes: valores.observacoes.trim(),
      dadosRecebimento,
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

  protected readonly especialidadesDisponiveis = computed(() =>
    valoresDistintos(this.store.registros(), (e) => e.especialidade),
  );

  private readonly filtroTipoAtual = signal<TipoPessoa | ''>('');
  private readonly filtroEspecialidadeAtual = signal('');

  private aplicarFiltroExtra(): void {
    const tipo = this.filtroTipoAtual();
    const especialidade = this.filtroEspecialidadeAtual();
    if (!tipo && !especialidade) {
      this.store.filtroExtra.set(null);
      return;
    }
    this.store.filtroExtra.set(
      (e) => (!tipo || e.tipo === tipo) && (!especialidade || e.especialidade === especialidade),
    );
  }

  protected mudarFiltroTipo(evento: Event): void {
    this.filtroTipoAtual.set((evento.target as HTMLSelectElement).value as TipoPessoa | '');
    this.aplicarFiltroExtra();
  }

  protected mudarFiltroEspecialidade(evento: Event): void {
    this.filtroEspecialidadeAtual.set((evento.target as HTMLSelectElement).value);
    this.aplicarFiltroExtra();
  }
}
