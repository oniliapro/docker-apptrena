import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import {
  PublicoLancamentoDetalhe,
  PublicoLancamentoResumo,
  PublicoObraResumo,
} from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarDataHora } from '../../core/utils/formato';
import { agoraDeParede } from '../../core/utils/fuso';

type Vista = 'calendario' | 'dia' | 'detalhe';

interface DiaCalendario {
  iso: string;
  numero: number;
  temLancamento: boolean;
  foraDoMes: boolean;
}

/**
 * Acesso PÚBLICO (sem login) do contratante da obra (cliente final) ao
 * Diário de Obra — 08/09/2026. Consome só `PublicoDiarioController`
 * (nenhum endpoint autenticado), e é puramente leitura: não existe
 * nenhuma ação de escrever, comentar ou assinar nesta tela, de
 * propósito (ver especificação, decisão de 08/09/2026 — o contratante
 * só visualiza).
 *
 * Padrão de UI (calendário → lista do dia → detalhe do lançamento) veio
 * do relato do Lucas sobre o sistema anterior dele.
 */
@Component({
  selector: 'app-publico-diario',
  imports: [],
  templateUrl: './publico-diario.html',
  styleUrl: './publico-diario.scss',
})
export class PublicoDiario implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  private token = '';

  protected readonly formatarData = formatarData;
  protected readonly formatarDataHora = formatarDataHora;

  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly resumoObra = signal<PublicoObraResumo | null>(null);
  protected readonly vista = signal<Vista>('calendario');
  protected readonly mesAtual = signal<{ ano: number; mes: number }>(mesDeHoje());

  protected readonly diaSelecionado = signal<string | null>(null);
  protected readonly lancamentosDoDia = signal<PublicoLancamentoResumo[]>([]);
  protected readonly carregandoDia = signal(false);

  protected readonly detalhe = signal<PublicoLancamentoDetalhe | null>(null);
  protected readonly carregandoDetalhe = signal(false);

  private readonly datasComLancamento = computed(
    () => new Set(this.resumoObra()?.datas_com_lancamento ?? []),
  );

  protected readonly nomeMes = computed(() => {
    const { ano, mes } = this.mesAtual();
    return new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  });

  protected readonly diasDoMes = computed<DiaCalendario[]>(() => {
    const { ano, mes } = this.mesAtual();
    const marcados = this.datasComLancamento();

    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const totalDias = new Date(ano, mes + 1, 0).getDate();
    const dias: DiaCalendario[] = [];

    // Preenchimento antes do dia 1, pra alinhar a grade de domingo a sábado.
    for (let i = 0; i < primeiroDiaSemana; i++) {
      dias.push({ iso: '', numero: 0, temLancamento: false, foraDoMes: true });
    }

    for (let dia = 1; dia <= totalDias; dia++) {
      const iso = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      dias.push({ iso, numero: dia, temLancamento: marcados.has(iso), foraDoMes: false });
    }

    return dias;
  });

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!this.token) {
      this.erro.set('Link inválido.');
      this.carregando.set(false);
      return;
    }

    this.api.obterPublicoObra(this.token).subscribe({
      next: (resumo) => {
        this.resumoObra.set(resumo);
        this.carregando.set(false);

        // Abre direto no mês do lançamento mais recente, se houver algum
        // — evita a pessoa ter que navegar meses pra achar o primeiro.
        const datas = [...resumo.datas_com_lancamento].sort();
        const ultima = datas.at(-1);
        if (ultima) {
          const [ano, mes] = ultima.split('-').map(Number);
          this.mesAtual.set({ ano, mes: mes - 1 });
        }
      },
      error: (resposta) => {
        this.carregando.set(false);
        this.erro.set(
          resposta?.status === 410
            ? 'Este link não está mais disponível.'
            : 'Link inválido ou obra não encontrada.',
        );
      },
    });
  }

  protected mesAnterior(): void {
    const { ano, mes } = this.mesAtual();
    this.mesAtual.set(mes === 0 ? { ano: ano - 1, mes: 11 } : { ano, mes: mes - 1 });
  }

  protected proximoMes(): void {
    const { ano, mes } = this.mesAtual();
    this.mesAtual.set(mes === 11 ? { ano: ano + 1, mes: 0 } : { ano, mes: mes + 1 });
  }

  protected abrirDia(dia: DiaCalendario): void {
    if (dia.foraDoMes || !dia.temLancamento) return;

    this.diaSelecionado.set(dia.iso);
    this.vista.set('dia');
    this.carregandoDia.set(true);

    this.api.obterPublicoDia(this.token, dia.iso).subscribe({
      next: (lista) => {
        this.lancamentosDoDia.set(lista);
        this.carregandoDia.set(false);
      },
      error: () => {
        this.lancamentosDoDia.set([]);
        this.carregandoDia.set(false);
      },
    });
  }

  protected abrirLancamento(resumo: PublicoLancamentoResumo): void {
    this.vista.set('detalhe');
    this.carregandoDetalhe.set(true);
    this.detalhe.set(null);

    this.api.obterPublicoLancamento(this.token, resumo.id).subscribe({
      next: (detalhe) => {
        this.detalhe.set(detalhe);
        this.carregandoDetalhe.set(false);
      },
      error: () => this.carregandoDetalhe.set(false),
    });
  }

  protected voltarParaCalendario(): void {
    this.vista.set('calendario');
    this.diaSelecionado.set(null);
  }

  protected voltarParaDia(): void {
    this.vista.set('dia');
    this.detalhe.set(null);
  }
}

function mesDeHoje(): { ano: number; mes: number } {
  const agora = agoraDeParede();
  return { ano: agora.getFullYear(), mes: agora.getMonth() };
}
