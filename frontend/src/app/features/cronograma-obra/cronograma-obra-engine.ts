/**
 * Motor de cálculo do Cronograma de obra (CPM — Critical Path Method),
 * 02/10/2026, pedido do Lucas. Função pura, sem Angular — mesmo padrão de
 * `eap-engine.ts`/`mapa-engine.ts`/`cronograma-desembolso-engine.ts`.
 *
 * Decisão de arquitetura (revisada por um agente dedicado só a validar a
 * matemática antes de implementar — achou um bug real na 1ª hipótese da
 * fórmula IT/SF): todo o núcleo opera em DIAS ORDINAIS INTEIROS, nunca em
 * `Date`. `Date`/`setDate`/`setMonth` têm comportamento de "rollover" em
 * troca de mês/ano que é fonte clássica de bug sutil — toda a aritmética
 * abaixo (`+1`/`-1`/`max`/`min`) é inteiro puro. `Date` só aparece nas
 * BORDAS (`isoParaOrdinal`/`ordinalParaIso`), e só via `Date.UTC`/`getUTC*`
 * — nunca o construtor local nem `getFullYear`/`getMonth`/`getDate` — assim
 * a conversão nunca depende do fuso horário de quem está rodando o
 * navegador (mesmo problema que `core/utils/formato.ts` já documentou e
 * corrigiu pra `formatarData`, aqui resolvido de um jeito mais simples
 * ainda: nunca cria um `Date` "local" pra começo de conversa).
 */

import { DependenciaCronograma, TarefaCronograma, TarefaCronogramaCalculada, TipoPrecedencia } from './cronograma-obra.models';

const MS_POR_DIA = 86_400_000;

/**
 * "AAAA-MM-DD" → dia ordinal (inteiro), sempre via `Date.UTC` — nunca Date
 * local. Exportada pra uso também fora do motor: o posicionamento em pixel
 * das barras do Gantt usa a MESMA subtração de inteiros ordinais, em vez de
 * duplicar lógica de data entre "calcular cronograma" e "desenhar Gantt".
 */
export function isoParaOrdinal(iso: string): number {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return Math.round(Date.UTC(ano, (mes || 1) - 1, dia || 1) / MS_POR_DIA);
}

/** Dia ordinal (inteiro) → "AAAA-MM-DD", sempre via `getUTC*` — nunca Date local. */
function ordinalParaIso(ordinal: number): string {
  const data = new Date(ordinal * MS_POR_DIA);
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Marco (duração 0) conta como 1 "dia-ponto" pra toda conversão início↔fim.
 * Exportada: a largura em pixel da barra do Gantt usa a MESMA duração
 * efetiva (nunca a diferença de datas — ver comentário na renderização).
 */
export function duracaoEfetiva(duracaoDias: number): number {
  return Math.max(Math.round(duracaoDias) || 0, 1);
}

/** Converte início/fim (ordinais, inclusivos) no "instante contínuo" de uma extremidade — fim fecha em +1. */
function pontoContinuo(inicio: number, fim: number, extremidade: 'inicio' | 'fim'): number {
  return extremidade === 'fim' ? fim + 1 : inicio;
}

// De qual extremidade da PREDECESSORA/SUCESSORA cada tipo trava a restrição.
const EXTREMIDADE_PRED: Record<TipoPrecedencia, 'inicio' | 'fim'> = { TI: 'fim', II: 'inicio', TT: 'fim', IT: 'inicio' };
const EXTREMIDADE_SUC: Record<TipoPrecedencia, 'inicio' | 'fim'> = { TI: 'inicio', II: 'inicio', TT: 'fim', IT: 'fim' };

/** Candidato de início cedo da SUCESSORA, implicado por UMA aresta. */
function candidatoInicioCedo(tipo: TipoPrecedencia, predInicioCedo: number, predFimCedo: number, latencia: number, duracaoSuc: number): number {
  const pontoSuc = pontoContinuo(predInicioCedo, predFimCedo, EXTREMIDADE_PRED[tipo]) + latencia;
  return EXTREMIDADE_SUC[tipo] === 'inicio' ? pontoSuc : pontoSuc - duracaoEfetiva(duracaoSuc);
}

/** Candidato de fim tardio da PREDECESSORA, implicado por UMA aresta (sucessora já com tardio calculado). */
function candidatoFimTardio(tipo: TipoPrecedencia, sucInicioTardio: number, sucFimTardio: number, latencia: number, duracaoPred: number): number {
  const pontoSuc = pontoContinuo(sucInicioTardio, sucFimTardio, EXTREMIDADE_SUC[tipo]);
  const pontoPredMax = pontoSuc - latencia;
  return EXTREMIDADE_PRED[tipo] === 'fim' ? pontoPredMax - 1 : pontoPredMax + duracaoEfetiva(duracaoPred) - 1;
}

/**
 * Ordem topológica + detecção de ciclo via DFS com 3 estados
 * (0 não-visitado / 1 visitando / 2 pronto) — mesma técnica já usada em
 * `eap-engine.ts`/`eap-formulas.ts` pro grafo de dependências de fórmulas,
 * reaproveitada aqui por consistência de estilo em vez de introduzir Kahn
 * como uma segunda técnica. `ordem` sai com toda predecessora ANTES de
 * suas sucessoras (pós-ordem de DFS) — é exatamente a ordem da passada de
 * ida; a passada de volta usa o mesmo array revertido (matematicamente
 * garantido: o reverso de uma topológica válida é topológica válida do
 * grafo transposto).
 */
function ordenarTopologicamente(
  tarefaIds: readonly string[],
  predecessorasDe: Map<string, DependenciaCronograma[]>,
): { ordem: string[]; emCiclo: Set<string> } {
  const ordem: string[] = [];
  const estado = new Map<string, 0 | 1 | 2>();
  const emCiclo = new Set<string>();
  const pilha: string[] = [];

  const visitar = (id: string): void => {
    const atual = estado.get(id);
    if (atual === 2) return;
    if (atual === 1) {
      const inicio = pilha.indexOf(id);
      pilha.slice(inicio).forEach((n) => emCiclo.add(n));
      return;
    }
    estado.set(id, 1);
    pilha.push(id);
    for (const dep of predecessorasDe.get(id) ?? []) visitar(dep.predecessora_id);
    pilha.pop();
    estado.set(id, 2);
    ordem.push(id);
  };
  for (const id of tarefaIds) visitar(id);

  return { ordem, emCiclo };
}

interface JanelaTarefa {
  inicioCedo: number;
  fimCedo: number;
  inicioTardio: number;
  fimTardio: number;
}

/**
 * Calcula início/fim/folga/caminho crítico de todas as tarefas. `dataBaseObraIso`
 * é o início padrão pra qualquer tarefa sem predecessora E sem
 * `data_inicio_manual` própria (mesmo campo que o Cronograma de Desembolso
 * já usa como âncora do projeto).
 */
export function calcularCronograma(
  tarefas: readonly TarefaCronograma[],
  dependencias: readonly DependenciaCronograma[],
  dataBaseObraIso: string,
): TarefaCronogramaCalculada[] {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const predecessorasDe = new Map<string, DependenciaCronograma[]>(); // multimapa: sucessoraId -> arestas
  const sucessorasDe = new Map<string, DependenciaCronograma[]>(); // multimapa: predecessoraId -> arestas
  const adicionar = (mapa: Map<string, DependenciaCronograma[]>, chave: string, dep: DependenciaCronograma) => {
    const lista = mapa.get(chave);
    if (lista) lista.push(dep);
    else mapa.set(chave, [dep]);
  };
  for (const dep of dependencias) {
    if (!porId.has(dep.predecessora_id) || !porId.has(dep.sucessora_id)) continue; // dependência órfã — ignora defensivamente
    adicionar(predecessorasDe, dep.sucessora_id, dep);
    adicionar(sucessorasDe, dep.predecessora_id, dep);
  }

  const tarefaIds = tarefas.map((t) => t.id);
  const { ordem, emCiclo } = ordenarTopologicamente(tarefaIds, predecessorasDe);
  const dataBaseOrdinal = isoParaOrdinal(dataBaseObraIso);

  // ---- passada de ida ----
  const janelas = new Map<string, JanelaTarefa>();
  for (const id of ordem) {
    if (emCiclo.has(id)) continue;
    const tarefa = porId.get(id)!;
    const preds = predecessorasDe.get(id) ?? [];
    let inicioCedo: number;
    if (!preds.length) {
      inicioCedo = tarefa.data_inicio_manual ? isoParaOrdinal(tarefa.data_inicio_manual) : dataBaseOrdinal;
    } else {
      inicioCedo = -Infinity;
      for (const dep of preds) {
        const janelaPred = janelas.get(dep.predecessora_id);
        if (!janelaPred) continue; // predecessora em ciclo — ignora esta aresta
        const candidato = candidatoInicioCedo(dep.tipo, janelaPred.inicioCedo, janelaPred.fimCedo, dep.latencia_dias, tarefa.duracao_dias);
        if (candidato > inicioCedo) inicioCedo = candidato;
      }
      if (inicioCedo === -Infinity) inicioCedo = dataBaseOrdinal; // todas as predecessoras estavam em ciclo
    }
    const fimCedo = inicioCedo + duracaoEfetiva(tarefa.duracao_dias) - 1;
    janelas.set(id, { inicioCedo, fimCedo, inicioTardio: 0, fimTardio: 0 });
  }

  // ---- passada de volta ----
  const tarefasValidas = ordem.filter((id) => !emCiclo.has(id));
  const fimDoProjeto = tarefasValidas.length ? Math.max(...tarefasValidas.map((id) => janelas.get(id)!.fimCedo)) : dataBaseOrdinal;

  for (const id of [...tarefasValidas].reverse()) {
    const tarefa = porId.get(id)!;
    const janela = janelas.get(id)!;
    const sucs = sucessorasDe.get(id) ?? [];
    let fimTardio = fimDoProjeto; // teto sempre presente, mesmo com sucessoras
    for (const dep of sucs) {
      const janelaSuc = janelas.get(dep.sucessora_id);
      if (!janelaSuc) continue;
      // `janelaSuc.inicioTardio`/`fimTardio` já estão calculados aqui — a
      // sucessora aparece ANTES na ordem revertida (ela vem DEPOIS na
      // topológica original), garantia da propriedade usada acima.
      const candidato = candidatoFimTardio(dep.tipo, janelaSuc.inicioTardio, janelaSuc.fimTardio, dep.latencia_dias, tarefa.duracao_dias);
      if (candidato < fimTardio) fimTardio = candidato;
    }
    janela.fimTardio = fimTardio;
    janela.inicioTardio = fimTardio - duracaoEfetiva(tarefa.duracao_dias) + 1;
  }

  return tarefas.map((tarefa) => {
    if (emCiclo.has(tarefa.id)) {
      return { tarefa, inicio: '', fim: '', folgaDias: 0, critica: false, erro: 'Dependência circular envolvendo esta tarefa.' };
    }
    const janela = janelas.get(tarefa.id)!;
    const folgaDias = janela.inicioTardio - janela.inicioCedo;
    return {
      tarefa,
      inicio: ordinalParaIso(janela.inicioCedo),
      fim: ordinalParaIso(janela.fimCedo),
      folgaDias,
      critica: folgaDias <= 0,
      erro: null,
    };
  });
}
