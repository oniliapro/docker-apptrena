/**
 * Fórmulas da EAP (F5, 21/09/2026) — cálculo puro, sem Angular.
 *
 * Uma célula editável da EAP (quantidade, custo unitário por categoria e BDI
 * do item) pode ter uma FÓRMULA em vez de um número. A fórmula é dinâmica: é
 * recalculada sempre que algo muda — inclusive com a EAP confirmada (travada)
 * e quando chegam pagamentos novos (Real./Saldo).
 *
 * Sintaxe (ver também `shared/numero/formula.ts`, que faz a conta):
 *  - célula de um item, entre aspas: `"1.4-qtd"`, `"1.1-Unit.Mat"` (Unit.MO,
 *    Unit.Equip, Unit.Outros, Unit.Adm), `"1.4-BDI"`;
 *  - totais de UM item ou grupo, entre aspas: `"1.4-Orç.Mat"`, `"2-Real.Total"`,
 *    `"2-Saldo.BDI"` — categorias Mat, MO, Equip, Outros, Adm, Total, BDI;
 *  - nomes SEM aspas valem para o PRÓPRIO item da célula: `qtd`, `Unit.Mat`, `BDI`,
 *    `Orç.Mat`, `Real.MO`, `Saldo.Total`…
 *    Ex. (na célula Unit.Adm do item): `=0,15*(Real.Mat+Real.MO+Real.Equip+Real.Outros)`;
 *  - totais da OBRA inteira: `Obra.Orç.Mat`, `Obra.Real.MO`, `Obra.Saldo.Total`…
 *
 * Orç. = orçado (custo direto + BDI) da categoria; Real. = realizado (pagamentos
 * confirmados); Saldo. = Orç. − Real. `Orç.BDI` é o BDI dentro do orçado;
 * não existe BDI "realizado": `Real.BDI` vale 0.
 *
 * A referência SEGUE o item: por dentro a fórmula é guardada pelo id do item
 * (`"#id|campo"`, "forma canônica"); o texto com os códigos ("1.4") é só a
 * exibição, refeita a cada renumeração.
 */
import { ehDescendente } from './eap-normalize';
import { calcularCacheOrcado, somarDescendentesDoGrupo } from './eap-engine';
import { criarVazioPorTipo } from './eap-normalize';
import { CabecalhoObra, CacheOrcado, ChaveTipo, ItemEap, PorTipo, TIPOS_CUSTO } from './eap.models';
import { ErroFormula, avaliarFormula, extrairNomes, extrairReferencias } from '../../shared/numero/formula';

export type CampoCelula = 'qtde' | 'bdi' | `unit.${ChaveTipo}`;
export type Agregado = 'orc' | 'real' | 'saldo';
export type Categoria = ChaveTipo | 'total' | 'bdi';

export type AlvoRef =
  | { tipo: 'celula'; campo: CampoCelula }
  | { tipo: 'agregado'; agregado: Agregado; categoria: Categoria };

/** Realizado vindo dos pagamentos confirmados — calculado pela tela e entregue ao motor. */
export interface ContextoRealizado {
  /** Por id de item da EAP: realizado quebrado por categoria (só as 5 categorias). */
  porItem: Map<string, PorTipo>;
  /** Pagamentos sem etapa (não ligados a nenhum item), por categoria. */
  semDefinicao: PorTipo;
}

export const CONTEXTO_REALIZADO_VAZIO: ContextoRealizado = {
  porItem: new Map(),
  semDefinicao: criarVazioPorTipo(),
};

export const CAMPOS_CELULA: CampoCelula[] = [
  'qtde',
  ...TIPOS_CUSTO.map((t) => `unit.${t.chave}` as CampoCelula),
  'bdi',
];

// ---------------------------------------------------------------------
// Apelidos (texto digitado ⇄ chave interna)
// ---------------------------------------------------------------------
const SUFIXO_PARA_CATEGORIA: Record<string, Categoria> = {
  mat: 'material',
  mo: 'maoDeObra',
  equip: 'equipamento',
  outros: 'outros',
  adm: 'administracao',
  total: 'total',
  bdi: 'bdi',
};

const CATEGORIA_PARA_SUFIXO: Record<Categoria, string> = {
  material: 'Mat',
  maoDeObra: 'MO',
  equipamento: 'Equip',
  outros: 'Outros',
  administracao: 'Adm',
  total: 'Total',
  bdi: 'BDI',
};

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Lê "qtd", "Unit.Mat", "Orç.Total", "Real.MO", "Saldo.BDI", "BDI"… (sem diferenciar maiúscula/acento). */
export function interpretarApelido(texto: string): AlvoRef | null {
  const n = semAcento(texto);
  if (n === 'qtd' || n === 'qtde') return { tipo: 'celula', campo: 'qtde' };
  if (n === 'bdi') return { tipo: 'celula', campo: 'bdi' };

  const m = /^(unit|orc|real|saldo)\.([a-z]+)$/.exec(n);
  if (!m) return null;
  const categoria = SUFIXO_PARA_CATEGORIA[m[2]];
  if (!categoria) return null;

  if (m[1] === 'unit') {
    if (categoria === 'total' || categoria === 'bdi') return null;
    return { tipo: 'celula', campo: `unit.${categoria}` };
  }
  return { tipo: 'agregado', agregado: m[1] as Agregado, categoria };
}

/**
 * Lê um nome solto (sem aspas): vale para o próprio item da célula, ou para a
 * obra inteira quando começa com `Obra.` (aí só Orç./Real./Saldo.).
 */
export function interpretarNome(texto: string): { obra: boolean; alvo: AlvoRef } | null {
  const bruto = texto.trim();
  const obra = /^obra\./i.test(semAcento(bruto));
  const alvo = interpretarApelido(obra ? bruto.slice(5) : bruto);
  if (!alvo || (obra && alvo.tipo !== 'agregado')) return null;
  return { obra, alvo };
}

export function chaveDoAlvo(alvo: AlvoRef): string {
  return alvo.tipo === 'celula' ? alvo.campo : `${alvo.agregado}.${alvo.categoria}`;
}

export function interpretarChave(chave: string): AlvoRef | null {
  if (chave === 'qtde' || chave === 'bdi') return { tipo: 'celula', campo: chave };
  const m = /^(unit|orc|real|saldo)\.(.+)$/.exec(chave);
  if (!m) return null;
  if (m[1] === 'unit') return TIPOS_CUSTO.some((t) => t.chave === m[2]) ? { tipo: 'celula', campo: chave as CampoCelula } : null;
  const categoria = m[2] as Categoria;
  const valida = categoria === 'total' || categoria === 'bdi' || TIPOS_CUSTO.some((t) => t.chave === categoria);
  return valida ? { tipo: 'agregado', agregado: m[1] as Agregado, categoria } : null;
}

const ROTULO_AGREGADO: Record<Agregado, string> = { orc: 'Orç', real: 'Real', saldo: 'Saldo' };

export function apelidoDaChave(chave: string): string {
  const alvo = interpretarChave(chave);
  if (!alvo) return chave;
  if (alvo.tipo === 'agregado') return `${ROTULO_AGREGADO[alvo.agregado]}.${CATEGORIA_PARA_SUFIXO[alvo.categoria]}`;
  if (alvo.campo === 'qtde') return 'qtd';
  if (alvo.campo === 'bdi') return 'BDI';
  return `Unit.${CATEGORIA_PARA_SUFIXO[alvo.campo.slice(5) as Categoria]}`;
}

// ---------------------------------------------------------------------
// Texto digitado ⇄ forma canônica (por id)
// ---------------------------------------------------------------------
export type ResultadoConversao = { ok: true; canonico: string } | { ok: false; erro: string };

/**
 * Converte o texto digitado ("=0,1*\"1.4-qtd\"") para a forma canônica, que
 * guarda o id do item no lugar do código. Recusa o que já se sabe estar errado
 * (item inexistente, coluna desconhecida, célula de grupo, nome solto inválido).
 */
export function paraCanonico(texto: string, itens: ItemEap[]): ResultadoConversao {
  const bruto = texto.trim();
  let erro: string | null = null;

  const convertido = bruto.replace(/"([^"]*)"/g, (_trecho, conteudo: string) => {
    if (erro) return '';
    const corte = conteudo.lastIndexOf('-');
    if (corte <= 0) {
      erro = `Referência inválida "${conteudo}": use "código-coluna", ex.: "1.4-qtd".`;
      return '';
    }
    const codigo = conteudo.slice(0, corte).trim();
    const apelido = conteudo.slice(corte + 1).trim();

    const item = itens.find((i) => String(i.eap).trim() === codigo);
    if (!item) {
      erro = `Item "${codigo}" não encontrado na EAP.`;
      return '';
    }
    const alvo = interpretarApelido(apelido);
    if (!alvo) {
      erro = `Coluna desconhecida "${apelido}" (use qtd, Unit.Mat, Unit.MO, Unit.Equip, Unit.Outros, Unit.Adm, BDI, Orç.*, Real.* ou Saldo.*).`;
      return '';
    }
    if (alvo.tipo === 'celula' && item.isGroup) {
      erro = `"${codigo}" é um grupo: dele só dá para usar Orç., Real. ou Saldo.`;
      return '';
    }
    return `"#${item.id}|${chaveDoAlvo(alvo)}"`;
  });
  if (erro) return { ok: false, erro };

  for (const nome of extrairNomes(bruto)) {
    if (!interpretarNome(nome)) {
      return {
        ok: false,
        erro: `Nome desconhecido: "${nome}" (sem aspas vale para o próprio item: qtd, Unit.*, BDI, Orç.*, Real.*, Saldo.*; use Obra.Real.Mat etc. para a obra inteira).`,
      };
    }
  }
  return { ok: true, canonico: convertido };
}

/** Texto para mostrar/editar: troca o id pelo código atual do item; item que não existe mais vira "REMOVIDO". */
export function paraExibicao(canonico: string, itens: ItemEap[]): string {
  return canonico.replace(/"#([^|"]+)\|([^"]+)"/g, (_trecho, id: string, chave: string) => {
    const item = itens.find((i) => i.id === id);
    return `"${item ? String(item.eap).trim() : 'REMOVIDO'}-${apelidoDaChave(chave)}"`;
  });
}

// ---------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------
export function chaveDaCelula(itemId: string, campo: string): string {
  return `${itemId}|${campo}`;
}

export function valorDaCelula(item: ItemEap, campo: CampoCelula): number {
  if (campo === 'qtde') return Number(item.qtde) || 0;
  if (campo === 'bdi') return Number(item.bdiMode === 'value' ? item.bdiValue : item.bdiPercent) || 0;
  return Number(item.unit?.[campo.slice(5) as ChaveTipo]) || 0;
}

/** Devolve o item com o valor da célula trocado (`bdi` vai para o campo do modo atual do item). */
export function comValor(item: ItemEap, campo: CampoCelula, valor: number): ItemEap {
  if (campo === 'qtde') return { ...item, qtde: valor };
  if (campo === 'bdi') return item.bdiMode === 'value' ? { ...item, bdiValue: valor } : { ...item, bdiPercent: valor };
  return { ...item, unit: { ...item.unit, [campo.slice(5)]: valor } };
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(6));
}

export interface ResultadoFormulas {
  itens: ItemEap[];
  /** Erros por célula (`chaveDaCelula`). Célula com erro mantém o último valor. */
  erros: Map<string, string>;
  /** Algum valor de célula mudou em relação à lista recebida. */
  alterou: boolean;
}

interface Celula {
  chave: string;
  itemId: string;
  campo: CampoCelula;
  canonico: string;
  refs: string[];
  nomes: string[];
}

/** Ids dos itens-base sob o alvo (um item-base = ele mesmo; um grupo = seus descendentes). */
function folhasDoEscopo(itens: ItemEap[], idAlvo: string | null): ItemEap[] {
  if (idAlvo === null) return itens.filter((i) => !i.isGroup);
  const alvo = itens.find((i) => i.id === idAlvo);
  if (!alvo) return [];
  if (!alvo.isGroup) return [alvo];
  return itens.filter((i) => !i.isGroup && ehDescendente(String(alvo.eap).trim(), String(i.eap).trim()));
}

/**
 * Recalcula todas as fórmulas da EAP, na ordem certa das dependências, e
 * devolve a lista com os valores das células atualizados. Nunca lança: erro de
 * uma célula (referência a item removido/grupo, ciclo, conta inválida) fica em
 * `erros` e a célula mantém o último valor.
 *
 * `contexto` = `null` enquanto os pagamentos ainda não carregaram: as células
 * que usam Real./Saldo. (e as que dependem delas) NÃO são recalculadas — ficam
 * como estão, sem erro — para não gravar zeros por engano.
 */
export function recalcularFormulas(
  itens: ItemEap[],
  cabecalho: CabecalhoObra,
  contextoOuNulo: ContextoRealizado | null,
): ResultadoFormulas {
  const contexto = contextoOuNulo ?? CONTEXTO_REALIZADO_VAZIO;
  const erros = new Map<string, string>();
  const celulas = new Map<string, Celula>();

  for (const item of itens) {
    for (const [campo, canonico] of Object.entries(item.formulas ?? {})) {
      if (!canonico || !CAMPOS_CELULA.includes(campo as CampoCelula)) continue;
      const chave = chaveDaCelula(item.id, campo);
      celulas.set(chave, {
        chave,
        itemId: item.id,
        campo: campo as CampoCelula,
        canonico,
        refs: extrairReferencias(canonico),
        nomes: extrairNomes(canonico),
      });
    }
  }
  if (!celulas.size) return { itens, erros, alterou: false };

  const trabalho = itens.map((i) => ({ ...i, unit: { ...i.unit } }));
  const indicePorId = new Map(trabalho.map((i, idx) => [i.id, idx]));

  // BDI "acoplado": o BDI de uma categoria passa a depender do custo das outras.
  //  - rateio de valor FECHADO (global ou por categoria): o orçado de um item
  //    depende dos custos de TODOS os itens (a base do rateio é a soma deles);
  //  - BDI do item em valor: o orçado do item depende de todas as categorias DELE.
  // Nesses casos um Orç. depende de mais células do que só as da própria categoria.
  const acopladoGlobal =
    (cabecalho?.bdiScope === 'global' && cabecalho.bdiMode === 'value' && (Number(cabecalho.bdiValue) || 0) > 0) ||
    (cabecalho?.bdiScope === 'category' && TIPOS_CUSTO.some((t) => cabecalho.bdiByType?.[t.chave]?.mode === 'value'));
  const acopladoItem = itens.some((i) => !i.isGroup && i.bdiMode === 'value');
  const acoplado = acopladoGlobal || acopladoItem;

  // ---- dependências entre células ----
  const dependencias = new Map<string, Set<string>>();
  const escopoDeDependencia = (idAlvo: string | null, categoria: Categoria): string[] => {
    const nos: string[] = [];
    for (const folha of folhasDoEscopo(itens, acopladoGlobal ? null : idAlvo)) {
      for (const campo of CAMPOS_CELULA) {
        const chave = chaveDaCelula(folha.id, campo);
        if (!celulas.has(chave)) continue;
        const contribui =
          acoplado ||
          categoria === 'total' ||
          categoria === 'bdi' ||
          campo === 'qtde' ||
          campo === 'bdi' ||
          campo === `unit.${categoria}`;
        if (contribui) nos.push(chave);
      }
    }
    return nos;
  };

  for (const celula of celulas.values()) {
    const deps = new Set<string>();
    for (const ref of celula.refs) {
      const corte = ref.indexOf('|');
      if (!ref.startsWith('#') || corte < 0) continue;
      const id = ref.slice(1, corte);
      const alvo = interpretarChave(ref.slice(corte + 1));
      if (!alvo) continue;
      if (alvo.tipo === 'celula') {
        const chave = chaveDaCelula(id, alvo.campo);
        if (celulas.has(chave)) deps.add(chave);
      } else if (alvo.agregado !== 'real') {
        escopoDeDependencia(id, alvo.categoria).forEach((n) => deps.add(n));
      }
    }
    for (const nome of celula.nomes) {
      const lido = interpretarNome(nome);
      if (!lido) continue;
      if (lido.alvo.tipo === 'celula') {
        const propria = chaveDaCelula(celula.itemId, lido.alvo.campo);
        if (celulas.has(propria)) deps.add(propria);
      } else if (lido.alvo.agregado !== 'real') {
        escopoDeDependencia(lido.obra ? null : celula.itemId, lido.alvo.categoria).forEach((n) => deps.add(n));
      }
    }
    dependencias.set(celula.chave, deps);
  }

  // ---- ordem topológica + ciclos (DFS) ----
  const ordem: string[] = [];
  const estado = new Map<string, 0 | 1 | 2>(); // 1 = visitando, 2 = pronto
  const emCiclo = new Set<string>();
  const pilha: string[] = [];

  const visitar = (chave: string): void => {
    const atual = estado.get(chave);
    if (atual === 2) return;
    if (atual === 1) {
      // ciclo: tudo da pilha desde a primeira ocorrência de `chave`
      const inicio = pilha.indexOf(chave);
      pilha.slice(inicio).forEach((n) => emCiclo.add(n));
      return;
    }
    estado.set(chave, 1);
    pilha.push(chave);
    for (const dep of dependencias.get(chave) ?? []) visitar(dep);
    pilha.pop();
    estado.set(chave, 2);
    ordem.push(chave);
  };
  for (const chave of celulas.keys()) visitar(chave);

  // ---- avaliação ----
  let cache: CacheOrcado | null = null;
  const cacheAtual = (): CacheOrcado => (cache ??= calcularCacheOrcado(trabalho, cabecalho));

  const realDaFolha = (id: string): PorTipo => contexto.porItem.get(id) ?? criarVazioPorTipo();

  /** Valor de Orç./Real./Saldo. de um item/grupo (`idAlvo`) ou da obra (`null`). */
  const agregadoDe = (idAlvo: string | null, agregado: Agregado, categoria: Categoria): number => {
    const orcado = (): number => {
      const c = cacheAtual();
      if (idAlvo === null) {
        if (categoria === 'total') return c.totalsWithBdi;
        if (categoria === 'bdi') return c.totalsBdi;
        return (c.totalsDirectByType[categoria] || 0) + (c.totalsBdiByType[categoria] || 0);
      }
      const idx = indicePorId.get(idAlvo) as number;
      const item = trabalho[idx];
      if (!item.isGroup) {
        if (categoria === 'total') return (c.directTotal[idx] || 0) + (c.bdiApplied[idx] || 0);
        if (categoria === 'bdi') return c.bdiApplied[idx] || 0;
        return (c.directByType[idx]?.[categoria] || 0) + (c.bdiByType[idx]?.[categoria] || 0);
      }
      const g = somarDescendentesDoGrupo(idx, trabalho, c);
      if (categoria === 'total') return g.totalWithBdi;
      if (categoria === 'bdi') return g.bdiApplied;
      return (g.directByType[categoria] || 0) + (g.bdiByType[categoria] || 0);
    };

    const realizado = (): number => {
      if (categoria === 'bdi') return 0;
      const somaCategorias = (mapa: PorTipo): number => TIPOS_CUSTO.reduce((s, t) => s + (mapa[t.chave] || 0), 0);
      const unir = (lista: PorTipo[]): PorTipo => {
        const total = criarVazioPorTipo();
        for (const p of lista) TIPOS_CUSTO.forEach((t) => (total[t.chave] += p[t.chave] || 0));
        return total;
      };
      let porTipo: PorTipo;
      if (idAlvo === null) {
        porTipo = unir([...trabalho.map((i) => realDaFolha(i.id)), contexto.semDefinicao]);
      } else {
        const alvo = trabalho[indicePorId.get(idAlvo) as number];
        const codigo = String(alvo.eap).trim();
        porTipo = unir(
          trabalho
            .filter((i) => i.id === idAlvo || (alvo.isGroup && ehDescendente(codigo, String(i.eap).trim())))
            .map((i) => realDaFolha(i.id)),
        );
      }
      return categoria === 'total' ? somaCategorias(porTipo) : porTipo[categoria as ChaveTipo] || 0;
    };

    if (agregado === 'orc') return orcado();
    if (agregado === 'real') return realizado();
    return orcado() - realizado();
  };

  const idsComErro = new Set<string>();
  const idsPulados = new Set<string>();
  const valoresAplicados = new Map<string, number>();

  /** A fórmula cita Real./Saldo. (por item ou da obra)? */
  const usaRealizado = (celula: Celula): boolean => {
    const chaveUsa = (chave: string): boolean => {
      const alvo = interpretarChave(chave);
      return alvo?.tipo === 'agregado' && alvo.agregado !== 'orc';
    };
    return (
      celula.refs.some((ref) => chaveUsa(ref.slice(ref.indexOf('|') + 1))) ||
      celula.nomes.some((nome) => {
        const alvo = interpretarNome(nome)?.alvo;
        return alvo?.tipo === 'agregado' && alvo.agregado !== 'orc';
      })
    );
  };

  for (const chave of ordem) {
    const celula = celulas.get(chave) as Celula;
    const idx = indicePorId.get(celula.itemId);

    if (idx === undefined) continue;
    if (emCiclo.has(chave)) {
      erros.set(chave, 'Referência circular: a fórmula depende dela mesma.');
      idsComErro.add(chave);
      continue;
    }
    if (trabalho[idx].isGroup) {
      erros.set(chave, 'Esta linha virou um grupo: fórmula de célula só vale em itens.');
      idsComErro.add(chave);
      continue;
    }
    // Pagamentos ainda não carregados: pula (sem erro) o que usa Real./Saldo. e o que depende disso.
    const dependeDePulada = [...(dependencias.get(chave) ?? [])].some((d) => idsPulados.has(d));
    if (dependeDePulada || (contextoOuNulo === null && usaRealizado(celula))) {
      idsPulados.add(chave);
      continue;
    }
    const dependeDeErro = [...(dependencias.get(chave) ?? [])].some((d) => idsComErro.has(d));
    if (dependeDeErro) {
      erros.set(chave, 'Depende de uma célula com erro.');
      idsComErro.add(chave);
      continue;
    }

    const resolver = (ref: string): number => {
      const corte = ref.indexOf('|');
      if (!ref.startsWith('#') || corte < 0) throw new ErroFormula(`Referência inválida: ${ref}`);
      const id = ref.slice(1, corte);
      const i = indicePorId.get(id);
      if (i === undefined) throw new ErroFormula('Referência a um item que não existe mais na EAP.');
      const alvo = interpretarChave(ref.slice(corte + 1));
      if (!alvo) throw new ErroFormula('Referência a uma coluna desconhecida.');
      if (alvo.tipo === 'agregado') return agregadoDe(id, alvo.agregado, alvo.categoria);
      if (trabalho[i].isGroup) throw new ErroFormula(`O item "${trabalho[i].eap}" virou um grupo.`);
      return valorDaCelula(trabalho[i], alvo.campo);
    };
    const resolverNome = (nome: string): number => {
      const lido = interpretarNome(nome);
      if (!lido) throw new ErroFormula(`Nome desconhecido: "${nome}".`);
      if (lido.alvo.tipo === 'celula') return valorDaCelula(trabalho[idx], lido.alvo.campo);
      return agregadoDe(lido.obra ? null : celula.itemId, lido.alvo.agregado, lido.alvo.categoria);
    };

    const resultado = avaliarFormula(celula.canonico, resolver, resolverNome);
    if (!resultado.ok) {
      erros.set(chave, resultado.erro ?? 'Fórmula inválida.');
      idsComErro.add(chave);
      continue;
    }
    const valor = arredondar(resultado.valor);
    trabalho[idx] = comValor(trabalho[idx], celula.campo, valor);
    valoresAplicados.set(chave, valor);
    cache = null;
  }

  // ---- preserva a identidade dos itens que não mudaram ----
  let alterou = false;
  const finais = trabalho.map((novo, i) => {
    const original = itens[i];
    const mudou = CAMPOS_CELULA.some((campo) => valorDaCelula(novo, campo) !== valorDaCelula(original, campo));
    if (!mudou) return original;
    alterou = true;
    return novo;
  });

  return { itens: alterou ? finais : itens, erros, alterou };
}

/**
 * Com a EAP confirmada o Orçado é o "snapshot" (`orcadoCongelado`). Como as
 * fórmulas seguem dinâmicas, os itens que TÊM fórmula refazem o snapshot a
 * partir do cálculo atual; os demais mantêm o valor congelado.
 */
export function atualizarSnapshotDosItensComFormula(itens: ItemEap[], cabecalho: CabecalhoObra): ItemEap[] {
  if (!itens.some((i) => i.formulas && Object.keys(i.formulas).length)) return itens;
  const cache = calcularCacheOrcado(itens, cabecalho);
  let mudou = false;

  const novos = itens.map((item, i) => {
    if (item.isGroup || !item.formulas || !Object.keys(item.formulas).length) return item;
    const ao_vivo = criarVazioPorTipo();
    TIPOS_CUSTO.forEach((t) => {
      ao_vivo[t.chave] = arredondar((cache.directByType[i]?.[t.chave] || 0) + (cache.bdiByType[i]?.[t.chave] || 0));
    });
    const antes = item.orcadoCongelado;
    if (antes && TIPOS_CUSTO.every((t) => (antes[t.chave] || 0) === ao_vivo[t.chave])) return item;
    mudou = true;
    return { ...item, orcadoCongelado: ao_vivo };
  });
  return mudou ? novos : itens;
}

/**
 * Cópia de EAP entre obras: os ids dos itens mudam, então as fórmulas (que
 * guardam ids) precisam ser reescritas — `mapaIds` é antigo → novo.
 */
export function remapearFormulas(itens: ItemEap[], mapaIds: Map<string, string>): ItemEap[] {
  return itens.map((item) => {
    if (!item.formulas || !Object.keys(item.formulas).length) return item;
    const formulas: Record<string, string> = {};
    for (const [campo, canonico] of Object.entries(item.formulas)) {
      formulas[campo] = canonico.replace(/"#([^|"]+)\|/g, (_t, id: string) => `"#${mapaIds.get(id) ?? id}|`);
    }
    return { ...item, formulas };
  });
}
