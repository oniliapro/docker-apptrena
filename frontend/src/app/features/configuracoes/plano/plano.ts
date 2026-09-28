import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { Empresa, dadosDaEmpresa } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { diasRestantes, formatarData } from '../../../core/utils/formato';

/**
 * Número de atendimento do ComTrena, pro botão "Solicitar atendimento"
 * abrir um chat do WhatsApp já com a mensagem preenchida (28/08/2026,
 * pedido do Lucas). É um link `wa.me` — não é envio automático, quem abre
 * a tela ainda precisa clicar "Enviar" no WhatsApp; não exige nenhuma
 * integração/credencial de API.
 */
const NUMERO_ATENDIMENTO_WHATSAPP = '5561999427500';

/**
 * Aba "Plano" do popup de Configurações (28/08/2026, pedido do Lucas) —
 * mostra o plano contratado (reaproveita os mesmos dados/rótulos já
 * usados no KPI de assinatura do dashboard, ver `dashboard.ts`) e um
 * botão pra solicitar contato de upgrade/downgrade/cancelamento.
 *
 * "Email da conta principal do plano" na mensagem é, por enquanto, o
 * e-mail do próprio usuário logado — hoje toda empresa só tem um
 * usuário (o admin que se cadastrou). Quando o Controle de Permissões
 * existir e usuários secundários puderem abrir esta tela, isso precisa
 * virar uma busca pelo e-mail do usuário com papel 'admin' da empresa,
 * não o do usuário que clicou.
 */
@Component({
  selector: 'app-plano',
  templateUrl: './plano.html',
  styleUrl: './plano.scss',
})
export class Plano implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly empresa = signal<Empresa | null>(null);
  protected readonly nomeUsuario = signal('');
  protected readonly emailUsuario = signal('');

  protected readonly formatarData = formatarData;

  protected readonly statusRotulo = computed(() => {
    const status = String(this.empresa()?.assinatura_status ?? '').toLowerCase();
    if (status === 'trial') return 'Período de teste';
    if (status === 'ativa') return 'Ativa';
    return this.empresa()?.assinatura_status || '—';
  });

  protected readonly diasRestantesTrial = computed(() => {
    if (String(this.empresa()?.assinatura_status ?? '').toLowerCase() !== 'trial') return null;
    return diasRestantes(this.empresa()?.assinatura_valida_ate);
  });

  protected readonly linkWhatsapp = computed(() => {
    const nome = this.nomeUsuario() || 'sem nome';
    const email = this.emailUsuario() || 'sem e-mail';
    const mensagem =
      `O usuário ${nome} do plano ${email} solicitou atendimento ` +
      `para fazer mudanças no plano contratado`;
    return `https://wa.me/${NUMERO_ATENDIMENTO_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
  });

  ngOnInit(): void {
    this.api.obterUsuarioAtual().subscribe({
      next: ({ user }) => {
        this.nomeUsuario.set(user.name ?? '');
        this.emailUsuario.set(user.email ?? '');
        this.empresa.set(dadosDaEmpresa(user));
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os dados do plano.');
        this.carregando.set(false);
      },
    });
  }
}
