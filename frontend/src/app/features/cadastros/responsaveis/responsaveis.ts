import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { apenasDigitos, formatarTelefone } from '../../../core/utils/documento';
import { gerarId } from '../../eap/eap-normalize';
import { CadastroStore } from '../cadastro.store';
import { Responsavel } from '../cadastros.models';
import { BarraSelecao, AcaoLista } from '../../../shared/barra-selecao/barra-selecao';
import { SelecaoMultipla, confirmarExclusaoEmLote } from '../../../shared/selecao-lista/selecao-lista';
import { RedimensionarColunas } from '../../../shared/redimensionar-colunas/redimensionar-colunas';

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
  imports: [ReactiveFormsModule, RedimensionarColunas, BarraSelecao],
  providers: [CadastroStore],
  templateUrl: './responsaveis.html',
  styleUrl: './responsaveis.scss',
})
export class Responsaveis implements OnInit {
  protected readonly store = inject<CadastroStore<Responsavel>>(CadastroStore);

  // ---- Seleção múltipla (20/09/2026): clicar na linha abre a edição; marcar
  // linhas habilita "Editar" (com 1) e o menu "Ações" (excluir em lote). ----
  protected readonly selecao = new SelecaoMultipla<Responsavel>((r) => r.id);
  /** Só as marcadas que a lista (com os filtros de agora) mostra — é sobre elas que as ações agem. */
  protected readonly selecionados = computed(() => this.selecao.selecionados(this.store.listaFiltrada()));
  protected readonly acoesLista: AcaoLista[] = [{ chave: 'excluir', rotulo: 'Excluir', perigo: true }];

  protected editarSelecionado(): void {
    const [primeiro] = this.selecionados();
    if (primeiro) this.editar(primeiro);
  }

  /** Botão ✖ da linha (21/09/2026): exclui só este cadastro, com a confirmação de sempre. */
  protected removerUm(registro: Responsavel): void {
    const nome = registro.nome || 'este responsável';
    if (!window.confirm(`Excluir ${nome} definitivamente?\n\nSe ele responde por alguma obra, prefira desativar — assim o histórico é preservado.`)) return;
    this.store.remover(registro.id);
  }

  protected aoAcaoLista(chave: string): void {
    if (chave !== 'excluir') return;
    const alvos = this.selecionados();
    if (!alvos.length || !confirmarExclusaoEmLote(alvos.length, 'responsável', 'responsáveis', "", alvos.map((r) => r.nome))) return;
    this.store.removerVarios(alvos.map((r) => r.id));
    this.selecao.limpar();
  }
  private readonly fb = inject(FormBuilder);

  protected readonly formularioAberto = signal(false);
  protected readonly editandoId = signal<string | null>(null);
  protected readonly formatarTelefone = formatarTelefone;

  protected readonly formulario = this.fb.nonNullable.group({
    codigo: [''],
    nome: ['', [Validators.required]],
    registro: [''],
    atuacao: [''],
    telefone: [''],
    email: ['', [Validators.email]],
    observacoes: [''],
  });

  ngOnInit(): void {
    this.store.configurar(CHAVE, (bruto) => this.normalizar(bruto), [
      'nome',
      'registro',
      'atuacao',
      'email',
    ]);
    this.store.carregar();
  }

  private normalizar(bruto: Record<string, unknown>): Responsavel {
    return {
      id: bruto['id'] ? String(bruto['id']) : gerarId(),
      codigo: String(bruto['codigo'] ?? ''),
      nome: String(bruto['nome'] ?? ''),
      registro: String(bruto['registro'] ?? ''),
      atuacao: String(bruto['atuacao'] ?? ''),
      telefone: apenasDigitos(bruto['telefone']),
      email: String(bruto['email'] ?? ''),
      ativo: bruto['ativo'] !== false,
      observacoes: String(bruto['observacoes'] ?? ''),
    };
  }

  /**
   * Código interno (ex.: "RESP-014") gerado pelo sistema — mesmo padrão
   * do "CLI-NNN" dos Clientes (19/08/2026, pedido do Lucas): sequencial,
   * maior número já usado em "RESP-NNN" entre os cadastros existentes, +1.
   */
  private proximoCodigo(): string {
    const maior = this.store.registros().reduce((max, responsavel) => {
      const combinacao = /^RESP-(\d+)$/.exec(responsavel.codigo?.trim() ?? '');
      const numero = combinacao ? Number(combinacao[1]) : 0;
      return numero > max ? numero : max;
    }, 0);
    return `RESP-${String(maior + 1).padStart(3, '0')}`;
  }

  protected novo(): void {
    this.editandoId.set(null);
    this.formulario.reset({ codigo: this.proximoCodigo() });
    this.formularioAberto.set(true);
  }

  protected editar(registro: Responsavel): void {
    this.editandoId.set(registro.id);
    this.formulario.reset({
      codigo: registro.codigo,
      nome: registro.nome,
      registro: registro.registro,
      atuacao: registro.atuacao,
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
      codigo: valores.codigo.trim() || this.proximoCodigo(),
      nome: valores.nome.trim(),
      registro: valores.registro.trim(),
      atuacao: valores.atuacao.trim(),
      telefone: apenasDigitos(valores.telefone),
      email: valores.email.trim(),
      ativo: id ? (this.store.obter(id)?.ativo ?? true) : true,
      observacoes: valores.observacoes.trim(),
    });

    this.fechar();
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
