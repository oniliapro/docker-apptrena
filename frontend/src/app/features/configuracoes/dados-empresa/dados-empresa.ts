import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import { PerfilEmpresa, RepresentanteLegal } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import {
  apenasDigitos,
  formatarDocumento,
  formatarTelefone,
  validarDocumento,
} from '../../../core/utils/documento';

/** Pilhas de fonte CSS já disponíveis no navegador — sem carregar fonte externa nova. */
const FONTES = [
  { chave: 'padrao', rotulo: 'Padrão (sem-serifa)', pilha: 'system-ui, sans-serif' },
  { chave: 'serifada', rotulo: 'Serifada (clássica)', pilha: 'Georgia, "Times New Roman", serif' },
  { chave: 'mono', rotulo: 'Monoespaçada', pilha: '"Courier New", monospace' },
] as const;

/** Documento opcional — campo vazio passa, mas se preenchido precisa ser um CPF/CNPJ válido. */
function documentoOpcionalValido(controle: AbstractControl): ValidationErrors | null {
  const valor = String(controle.value ?? '').trim();
  if (!valor) return null;
  return validarDocumento(valor) ? null : { documentoInvalido: true };
}

/**
 * Aba "Dados da empresa" do popup de Configurações (26/08/2026, pedido do
 * Lucas) — cadastro da empresa, identidade visual (cores/fonte/logo/papel
 * timbrado) e representantes legais (pro futuro módulo de contratos
 * preencher automaticamente quem assina).
 */
@Component({
  selector: 'app-dados-empresa',
  imports: [ReactiveFormsModule],
  templateUrl: './dados-empresa.html',
  styleUrl: './dados-empresa.scss',
})
export class DadosEmpresa implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);

  protected readonly fontes = FONTES;
  protected readonly formatarDocumento = formatarDocumento;
  protected readonly formatarTelefone = formatarTelefone;

  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvoAgora = signal(false);

  protected readonly perfil = signal<PerfilEmpresa | null>(null);
  protected readonly representantes = signal<RepresentanteLegal[]>([]);

  protected readonly arquivoLogo = signal<File | null>(null);
  protected readonly arquivoPapelTimbrado = signal<File | null>(null);
  protected readonly previewLogo = signal<string | null>(null);
  protected readonly previewPapelTimbrado = signal<string | null>(null);

  /** `logoUrl`/`papelTimbradoUrl` vêm relativos (`/storage/...`) — ver `Empresa::getLogoUrlAttribute()`. */
  protected readonly logoUrlAtual = computed(() => {
    const caminho = this.perfil()?.logoUrl;
    return caminho ? this.api.baseStorage() + caminho : null;
  });

  protected readonly papelTimbradoUrlAtual = computed(() => {
    const caminho = this.perfil()?.papelTimbradoUrl;
    return caminho ? this.api.baseStorage() + caminho : null;
  });

  protected readonly formulario = this.fb.nonNullable.group({
    razaoSocial: [''],
    nome: ['', [Validators.required]],
    cnpj: ['', [documentoOpcionalValido]],
    inscricaoEstadual: [''],
    endereco: [''],
    telefone: [''],
    emailContato: ['', [Validators.email]],
    corPrimaria: ['#123c52'],
    corSecundaria: ['#c9a84c'],
    fonte: ['padrao'],
  });

  // ------------------------------------------------------------------
  // Representantes — mini-CRUD inline (modal-dentro-do-modal)
  // ------------------------------------------------------------------
  protected readonly formularioRepresentanteAberto = signal(false);
  protected readonly editandoRepresentanteId = signal<string | null>(null);
  protected readonly formularioRepresentante = this.fb.nonNullable.group({
    nome: ['', [Validators.required]],
    cargo: [''],
    cpf: ['', [documentoOpcionalValido]],
    email: ['', [Validators.email]],
    telefone: [''],
  });

  ngOnInit(): void {
    this.carregar();
  }

  ngOnDestroy(): void {
    this.revogarPreview(this.previewLogo());
    this.revogarPreview(this.previewPapelTimbrado());
  }

  private revogarPreview(url: string | null): void {
    if (url) URL.revokeObjectURL(url);
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.obterPerfilEmpresa().subscribe({
      next: (perfil) => {
        this.perfil.set(perfil);
        this.representantes.set(perfil.representantes);
        this.formulario.reset({
          razaoSocial: perfil.razaoSocial,
          nome: perfil.nome,
          cnpj: formatarDocumento(perfil.cnpj),
          inscricaoEstadual: perfil.inscricaoEstadual,
          endereco: perfil.endereco,
          telefone: formatarTelefone(perfil.telefone),
          emailContato: perfil.emailContato,
          corPrimaria: perfil.corPrimaria || '#123c52',
          corSecundaria: perfil.corSecundaria || '#c9a84c',
          fonte: perfil.fonte || 'padrao',
        });
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os dados da empresa.');
        this.carregando.set(false);
      },
    });
  }

  // ------------------------------------------------------------------
  // Logo / papel timbrado
  // ------------------------------------------------------------------
  protected selecionarLogo(evento: Event): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0] ?? null;
    this.arquivoLogo.set(arquivo);
    this.revogarPreview(this.previewLogo());
    this.previewLogo.set(arquivo ? URL.createObjectURL(arquivo) : null);
  }

  protected selecionarPapelTimbrado(evento: Event): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0] ?? null;
    this.arquivoPapelTimbrado.set(arquivo);
    this.revogarPreview(this.previewPapelTimbrado());
    this.previewPapelTimbrado.set(arquivo ? URL.createObjectURL(arquivo) : null);
  }

  protected mascararCnpj(evento: Event): void {
    const alvo = evento.target as HTMLInputElement;
    const formatado = formatarDocumento(alvo.value);
    alvo.value = formatado;
    this.formulario.controls.cnpj.setValue(formatado);
  }

  protected mascararTelefone(evento: Event): void {
    const alvo = evento.target as HTMLInputElement;
    const formatado = formatarTelefone(alvo.value);
    alvo.value = formatado;
    this.formulario.controls.telefone.setValue(formatado);
  }

  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  protected salvar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const v = this.formulario.getRawValue();
    const dados = new FormData();
    dados.append('razao_social', v.razaoSocial.trim());
    dados.append('nome', v.nome.trim());
    dados.append('cnpj', apenasDigitos(v.cnpj));
    dados.append('inscricao_estadual', v.inscricaoEstadual.trim());
    dados.append('endereco', v.endereco.trim());
    dados.append('telefone', apenasDigitos(v.telefone));
    dados.append('email_contato', v.emailContato.trim());
    dados.append('cor_primaria', v.corPrimaria);
    dados.append('cor_secundaria', v.corSecundaria);
    dados.append('fonte', v.fonte);
    if (this.arquivoLogo()) dados.append('logo', this.arquivoLogo() as File);
    if (this.arquivoPapelTimbrado()) dados.append('papel_timbrado', this.arquivoPapelTimbrado() as File);

    this.salvando.set(true);
    this.api.salvarPerfilEmpresa(dados).subscribe({
      next: (perfil) => {
        this.perfil.set(perfil);
        this.representantes.set(perfil.representantes);
        this.arquivoLogo.set(null);
        this.arquivoPapelTimbrado.set(null);
        this.revogarPreview(this.previewLogo());
        this.revogarPreview(this.previewPapelTimbrado());
        this.previewLogo.set(null);
        this.previewPapelTimbrado.set(null);
        this.salvando.set(false);
        this.salvoAgora.set(true);
        setTimeout(() => this.salvoAgora.set(false), 3000);
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível salvar os dados da empresa.');
      },
    });
  }

  // ------------------------------------------------------------------
  protected novoRepresentante(): void {
    this.editandoRepresentanteId.set(null);
    this.formularioRepresentante.reset({ nome: '', cargo: '', cpf: '', email: '', telefone: '' });
    this.formularioRepresentanteAberto.set(true);
  }

  protected editarRepresentante(representante: RepresentanteLegal): void {
    this.editandoRepresentanteId.set(representante.id);
    this.formularioRepresentante.reset({
      nome: representante.nome,
      cargo: representante.cargo,
      cpf: formatarDocumento(representante.cpf),
      email: representante.email,
      telefone: formatarTelefone(representante.telefone),
    });
    this.formularioRepresentanteAberto.set(true);
  }

  protected fecharRepresentante(): void {
    this.formularioRepresentanteAberto.set(false);
  }

  protected mascararCpfRepresentante(evento: Event): void {
    const alvo = evento.target as HTMLInputElement;
    const formatado = formatarDocumento(alvo.value);
    alvo.value = formatado;
    this.formularioRepresentante.controls.cpf.setValue(formatado);
  }

  protected mascararTelefoneRepresentante(evento: Event): void {
    const alvo = evento.target as HTMLInputElement;
    const formatado = formatarTelefone(alvo.value);
    alvo.value = formatado;
    this.formularioRepresentante.controls.telefone.setValue(formatado);
  }

  protected temErroRepresentante(campo: string): boolean {
    const controle = this.formularioRepresentante.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  protected salvarRepresentante(): void {
    if (this.formularioRepresentante.invalid) {
      this.formularioRepresentante.markAllAsTouched();
      return;
    }

    const v = this.formularioRepresentante.getRawValue();
    const payload = {
      nome: v.nome.trim(),
      cargo: v.cargo.trim(),
      cpf: apenasDigitos(v.cpf),
      email: v.email.trim(),
      telefone: apenasDigitos(v.telefone),
    };

    const id = this.editandoRepresentanteId();
    const requisicao = id
      ? this.api.atualizarRepresentante(id, payload)
      : this.api.criarRepresentante(payload);

    requisicao.subscribe({
      next: (representante) => {
        this.representantes.update((lista) =>
          id ? lista.map((r) => (r.id === id ? representante : r)) : [...lista, representante],
        );
        this.fecharRepresentante();
      },
      error: () => window.alert('Não foi possível salvar o representante.'),
    });
  }

  protected alternarAtivoRepresentante(representante: RepresentanteLegal): void {
    this.api.atualizarRepresentante(representante.id, { ativo: !representante.ativo }).subscribe({
      next: (atualizado) => {
        this.representantes.update((lista) =>
          lista.map((r) => (r.id === atualizado.id ? atualizado : r)),
        );
      },
      error: () => window.alert('Não foi possível alterar o status do representante.'),
    });
  }

  protected excluirRepresentante(representante: RepresentanteLegal): void {
    if (!window.confirm(`Excluir "${representante.nome}" definitivamente?`)) return;

    this.api.excluirRepresentante(representante.id).subscribe({
      next: () => this.representantes.update((lista) => lista.filter((r) => r.id !== representante.id)),
      error: () => window.alert('Não foi possível excluir o representante.'),
    });
  }
}
