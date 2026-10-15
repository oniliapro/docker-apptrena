import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { environment } from '../../../environments/environment';
import { agoraDeParede } from '../../core/utils/fuso';
import { CLIMAS, RdoFoto, RdoRegistro, TIPOS_OCORRENCIA } from '../rdo/rdo.models';
import { DiaCalendario, construirSemanas, mesComPasso, mesDoMaisRecente } from '../rdo/rdo-calendario';

interface ResumoRegistro {
  id: string;
  numero: number;
  data: string;
  assinado_em: string | null;
  assinante_nome: string | null;
}

interface RespostaPublica {
  obra: { nome: string; local: string } | null;
  registros: ResumoRegistro[];
}

/**
 * Acompanhamento do contratante da obra (cliente final).
 *
 * Fora do AppShell e sem authGuard — quem abre é o dono da obra, que não tem
 * conta no ComTrena. O token do link é a única credencial.
 *
 * SOMENTE LEITURA, sem exceção: não há nenhum botão de escrever, e o
 * contratante não assina nada (decisão de 08/09/2026, reconfirmada em
 * 17/09/2026). Quem assina é sempre a contratada.
 *
 * O calendário segue o modelo do Google Calendário e marca em VERDE os dias
 * com relatório (pedido nº 15, 15/09/2026) — é uma visão viva: relatório novo
 * lançado pela contratada aparece aqui sozinho, sem precisar de link novo.
 */
@Component({
  selector: 'app-publico-rdo',
  imports: [DatePipe],
  templateUrl: './publico-rdo.html',
  styleUrl: './publico-rdo.scss',
})
export class PublicoRdo implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly rota = inject(ActivatedRoute);
  private readonly base = environment.apiUrl;

  private token = '';

  protected readonly climas = CLIMAS;
  protected readonly obra = signal<{ nome: string; local: string } | null>(null);
  protected readonly registros = signal<ResumoRegistro[]>([]);
  protected readonly selecionado = signal<RdoRegistro | null>(null);
  protected readonly fotoAmpliada = signal<RdoFoto | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  /** Mês exibido no calendário, sempre no dia 1. */
  protected readonly mesAtual = signal<Date>(agoraDeParede());

  protected readonly diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  protected readonly rotuloMes = computed(() =>
    this.mesAtual().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  );

  /**
   * `foto.url` vem relativo (`/storage/...`) desde 23/09/2026 (ver
   * `RdoFoto::getUrlAttribute()`) — mesma ideia de `ApiService.baseStorage()`,
   * só que esta tela pública não usa o `ApiService` (não tem sessão/token de
   * usuário), então monta a base direto de `environment.apiUrl`.
   */
  protected urlMidia(foto: RdoFoto): string {
    return this.base.replace(/\/api\/?$/, '') + foto.url;
  }

  /**
   * Grade do mês: começa no domingo da semana do dia 1 e vai até completar a
   * última semana, como qualquer calendário mensal — ver `rdo-calendario.ts`
   * (extraído daqui em 22/09/2026, F8, pra também virar a tela interna).
   */
  protected readonly semanas = computed<DiaCalendario<ResumoRegistro>[][]>(() =>
    construirSemanas(this.mesAtual(), this.registros(), (r) => r.data),
  );

  ngOnInit(): void {
    this.token = this.rota.snapshot.paramMap.get('token') ?? '';

    this.http.get<RespostaPublica>(`${this.base}/publico/rdo/${this.token}`).subscribe({
      next: (resposta) => {
        this.obra.set(resposta.obra);
        this.registros.set(resposta.registros ?? []);
        // Abre no mês do relatório mais recente, não no mês corrente: se a
        // obra parou há três meses, abrir em "hoje" mostraria um mês vazio.
        const mes = mesDoMaisRecente(resposta.registros ?? [], (r) => r.data);
        if (mes) this.mesAtual.set(mes);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Este link não é válido ou expirou. Peça um link novo a quem executa a obra.');
        this.carregando.set(false);
      },
    });
  }

  protected mudarMes(passo: number): void {
    this.mesAtual.set(mesComPasso(this.mesAtual(), passo));
  }

  protected abrir(registro: ResumoRegistro): void {
    this.http
      .get<RdoRegistro>(`${this.base}/publico/rdo/${this.token}/registro/${registro.id}`)
      .subscribe({
        next: (completo) => this.selecionado.set(completo),
        error: () => this.erro.set('Não foi possível abrir este relatório.'),
      });
  }

  protected fechar(): void {
    this.selecionado.set(null);
  }

  protected ampliar(foto: RdoFoto): void {
    this.fotoAmpliada.set(foto);
  }

  protected fecharFoto(): void {
    this.fotoAmpliada.set(null);
  }

  protected fotosDaTarefa(registro: RdoRegistro, tarefaId: string): RdoFoto[] {
    return (registro.fotos ?? []).filter((f) => f.tarefa_id === tarefaId);
  }

  protected fotosDoDia(registro: RdoRegistro): RdoFoto[] {
    return (registro.fotos ?? []).filter((f) => !f.tarefa_id);
  }

  protected rotuloClima(valor: string | null): string {
    return CLIMAS.find((c) => c.valor === valor)?.rotulo ?? '—';
  }

  protected rotuloOcorrencia(valor: string): string {
    return TIPOS_OCORRENCIA.find((t) => t.valor === valor)?.rotulo ?? valor;
  }
}
