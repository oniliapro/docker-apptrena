import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { environment } from '../../../environments/environment';
import { CLIMAS, RdoFoto, RdoRegistro, TIPOS_OCORRENCIA } from '../rdo/rdo.models';

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

/** Uma célula do calendário mensal. */
interface DiaCalendario {
  data: string;
  dia: number;
  doMes: boolean;
  registros: ResumoRegistro[];
}

/**
 * Acompanhamento do contratante da obra (cliente final).
 *
 * Fora do AppShell e sem authGuard — quem abre é o dono da obra, que não tem
 * conta no AppTrena. O token do link é a única credencial.
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
  protected readonly mesAtual = signal<Date>(new Date());

  protected readonly diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  protected readonly rotuloMes = computed(() =>
    this.mesAtual().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  );

  /**
   * Grade do mês: começa no domingo da semana do dia 1 e vai até completar a
   * última semana, como qualquer calendário mensal.
   */
  protected readonly semanas = computed<DiaCalendario[][]>(() => {
    const referencia = this.mesAtual();
    const ano = referencia.getFullYear();
    const mes = referencia.getMonth();

    const inicio = new Date(ano, mes, 1);
    inicio.setDate(inicio.getDate() - inicio.getDay());

    const fim = new Date(ano, mes + 1, 0);
    fim.setDate(fim.getDate() + (6 - fim.getDay()));

    const porData = new Map<string, ResumoRegistro[]>();
    this.registros().forEach((r) => {
      const chave = r.data.substring(0, 10);
      porData.set(chave, [...(porData.get(chave) ?? []), r]);
    });

    const semanas: DiaCalendario[][] = [];
    let semana: DiaCalendario[] = [];
    const cursor = new Date(inicio);

    while (cursor <= fim) {
      const iso = this.paraIso(cursor);
      semana.push({
        data: iso,
        dia: cursor.getDate(),
        doMes: cursor.getMonth() === mes,
        registros: porData.get(iso) ?? [],
      });

      if (semana.length === 7) {
        semanas.push(semana);
        semana = [];
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return semanas;
  });

  ngOnInit(): void {
    this.token = this.rota.snapshot.paramMap.get('token') ?? '';

    this.http.get<RespostaPublica>(`${this.base}/api/publico/rdo/${this.token}`).subscribe({
      next: (resposta) => {
        this.obra.set(resposta.obra);
        this.registros.set(resposta.registros ?? []);
        // Abre no mês do relatório mais recente, não no mês corrente: se a
        // obra parou há três meses, abrir em "hoje" mostraria um mês vazio.
        const maisRecente = resposta.registros?.[0];
        if (maisRecente) {
          const d = new Date(`${maisRecente.data.substring(0, 10)}T12:00:00`);
          this.mesAtual.set(new Date(d.getFullYear(), d.getMonth(), 1));
        }
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Este link não é válido ou expirou. Peça um link novo a quem executa a obra.');
        this.carregando.set(false);
      },
    });
  }

  protected mudarMes(passo: number): void {
    const atual = this.mesAtual();
    this.mesAtual.set(new Date(atual.getFullYear(), atual.getMonth() + passo, 1));
  }

  protected abrir(registro: ResumoRegistro): void {
    this.http
      .get<RdoRegistro>(`${this.base}/api/publico/rdo/${this.token}/registro/${registro.id}`)
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

  private paraIso(data: Date): string {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');

    return `${data.getFullYear()}-${mes}-${dia}`;
  }
}
