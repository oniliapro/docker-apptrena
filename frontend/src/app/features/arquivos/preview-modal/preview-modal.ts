import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { ApiService } from '../../../core/services/api.service';
import { Arquivo, formatarTamanho } from '../arquivos.models';

/**
 * Popup de preview — primeiro modal genuinamente reutilizável do projeto.
 * Estrutura (.modal/.modal-fundo/.modal-cartao/...) copiada do modal
 * "Pagamentos vinculados" da EAP (eap.html/eap.scss), sem partial
 * compartilhado ainda (fica pra uma extração futura).
 */
@Component({
  selector: 'app-preview-modal',
  templateUrl: './preview-modal.html',
  styleUrl: './preview-modal.scss',
})
export class PreviewModal implements OnInit {
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly arquivo = input.required<Arquivo>();
  readonly fechar = output<void>();
  readonly baixar = output<void>();

  protected readonly formatarTamanho = formatarTamanho;
  protected readonly urlStream = signal<string | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal(false);

  protected readonly categoria = computed(() => this.arquivo().categoria);

  /**
   * iframe[src] exige SafeResourceUrl (contexto RESOURCE_URL do Angular,
   * mais restrito que img/video/audio[src]) — sem isso o sanitizer
   * descarta a URL assinada do PDF silenciosamente.
   */
  protected readonly urlPdfSegura = computed<SafeResourceUrl | null>(() => {
    const url = this.urlStream();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  ngOnInit(): void {
    this.carregarUrl();
  }

  private carregarUrl(): void {
    this.api.obterUrlPreviewArquivo(this.arquivo().id).subscribe({
      next: (resp) => {
        this.urlStream.set(resp.url);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  protected abrirNovaAba(): void {
    const url = this.urlStream();
    if (url) window.open(url, '_blank', 'noopener');
  }
}
