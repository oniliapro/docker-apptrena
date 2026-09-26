import { FvsPreenchimento } from '../fvs/fvs.models';

/**
 * Relatório Diário de Obra (RDO) — tipos do módulo reconstruído em
 * 17/09/2026.
 *
 * Ficam aqui, e não em `core/models/api.models.ts`, de propósito: aquele
 * arquivo é compartilhado por todos os módulos e este módulo não altera nada
 * fora do próprio escopo.
 */

/**
 * Condição do tempo em cada turno, como o RDO impresso registra.
 * 26/09/2026, pedido do Lucas: "impraticável" saiu daqui — virou uma
 * condição de TRABALHO à parte (ver `CondicaoTrabalho`), não um clima.
 */
export type ClimaTurno = 'claro' | 'nublado' | 'chuva' | 'temporal';

export const CLIMAS: ReadonlyArray<{ valor: ClimaTurno; rotulo: string; simbolo: string }> = [
  { valor: 'claro', rotulo: 'Claro', simbolo: '☀️' },
  { valor: 'nublado', rotulo: 'Nublado', simbolo: '⛅' },
  { valor: 'chuva', rotulo: 'Chuva', simbolo: '🌧️' },
  { valor: 'temporal', rotulo: 'Temporal', simbolo: '⛈️' },
];

/** Condição de trabalho do turno (26/09/2026) — separada do clima; um turno "praticável" com chuva ainda é um turno de trabalho normal. */
export type CondicaoTrabalho = 'praticavel' | 'impraticavel';

export const CONDICOES_TRABALHO: ReadonlyArray<{ valor: CondicaoTrabalho; rotulo: string }> = [
  { valor: 'praticavel', rotulo: 'Praticável' },
  { valor: 'impraticavel', rotulo: 'Impraticável' },
];

/** Um turno do dia, com o nome dos FormControls do clima/condição — usado pela tabela de clima invertida (linhas = turnos). */
export const TURNOS_CLIMA: ReadonlyArray<{
  chave: string;
  rotulo: string;
  controlClima: 'clima_manha' | 'clima_tarde' | 'clima_noite';
  controlCondicao: 'condicao_manha' | 'condicao_tarde' | 'condicao_noite';
}> = [
  { chave: 'manha', rotulo: 'Manhã', controlClima: 'clima_manha', controlCondicao: 'condicao_manha' },
  { chave: 'tarde', rotulo: 'Tarde', controlClima: 'clima_tarde', controlCondicao: 'condicao_tarde' },
  { chave: 'noite', rotulo: 'Noite', controlClima: 'clima_noite', controlCondicao: 'condicao_noite' },
];

export const TIPOS_OCORRENCIA: ReadonlyArray<{ valor: string; rotulo: string }> = [
  { valor: 'nao_conformidade', rotulo: 'Não conformidade' },
  { valor: 'mudanca_projeto', rotulo: 'Mudança de projeto' },
  { valor: 'interferencia', rotulo: 'Interferência' },
  { valor: 'interrupcao', rotulo: 'Interrupção de trabalho' },
  { valor: 'outra', rotulo: 'Outra' },
];

/** Mão de obra é registrada nas duas colunas do RDO. */
/**
 * F9 (24/09/2026): critério mudou de tipo de trabalho (indireta/direta) pra
 * vínculo com a empresa (interno/externo), vindo do cadastro de
 * Profissionais (F6) — ver a migration de dados em
 * `2026_09_24_000000_add_profissional_a_mao_de_obra_rdo`.
 */
export type CategoriaMaoDeObra = 'interno' | 'externo';

export interface RdoTarefa {
  id: string;
  ordem: number;
  descricao: string;
  /** 26/09/2026: observação própria da tarefa, distinta da "Descrição do serviço". */
  observacoes: string | null;
}

/** 'video' = mp4/mov/webm (F8, 22/09/2026) — mesma tabela e mesma galeria das fotos. */
export type TipoMidiaRdo = 'foto' | 'video';

export interface RdoFoto {
  id: string;
  /** Nulo = mídia geral do dia. Preenchido = evidência daquela tarefa. */
  tarefa_id: string | null;
  tipo: TipoMidiaRdo;
  caminho: string;
  url: string;
  legenda: string | null;
  ordem: number;
  /** Croqui: ponto marcado sobre a foto, em coordenadas relativas 0–1. Exclusivo de foto — sempre nulo em vídeo. */
  marcador_x: number | null;
  marcador_y: number | null;
  marcador_nota: string | null;
}

export interface RdoMaoDeObra {
  id: string;
  categoria: CategoriaMaoDeObra;
  /** F9: preenchidos = linha vinculada a um profissional real do cadastro (gera diária ao finalizar). Vazios = lançamento manual (ex.: "Ajudante avulso x3"). */
  profissional_id: string | null;
  profissional_nome: string | null;
  funcao: string;
  quantidade: number;
}

/** Equipamentos próprios (do canteiro) x alugados (26/09/2026, pedido do Lucas). */
export type CategoriaEquipamento = 'proprio' | 'alugado';

export interface RdoEquipamento {
  id: string;
  categoria: CategoriaEquipamento;
  equipamento_id: string | null;
  /** Preenchido só em "alugado" vinculado a um contrato ativo. */
  contrato_equipamento_item_id: string | null;
  /** Snapshot em texto (mesmo padrão de `profissional_nome` da mão de obra) — vem do contrato quando vinculado, vazio quando não há contrato. */
  contrato_referencia: string | null;
  /** 26/09/2026: alugado vinculado nasce sozinho a partir do contrato ativo — o usuário só marca se está na obra hoje. */
  presente: boolean;
  descricao: string;
  quantidade: number;
}

export interface RdoOcorrencia {
  id: string;
  /** 26/09/2026: ocorrência passou a nascer dentro de uma tarefa — nulo só em registro salvo antes disso. */
  tarefa_id: string | null;
  ordem: number;
  tipo: string;
  descricao: string;
  responsavel: string | null;
  motivo: string | null;
  danos_materiais: string | null;
}

export interface RdoPendencia {
  id: string;
  /** 26/09/2026: uma tarefa pode gerar mais de uma pendência — nulo só em registro salvo antes disso. */
  tarefa_id: string | null;
  descricao: string;
  responsavel: string | null;
  prazo: string | null;
  status: 'aberta' | 'concluida';
}

export interface RdoEtapa {
  id: string;
  /** F9: opcional — liga a etapa a um item de verdade da EAP da obra, pra rastreio. */
  eap_item_id: string | null;
  nome: string;
  concluida: boolean;
}

export interface RdoResponsavelPresente {
  id: string;
  nome: string;
  empresa: string | null;
  funcao: string | null;
  contrato_referencia: string | null;
}

export interface RdoComentarioInterno {
  id: string;
  texto: string;
  visivel_contratante: boolean;
}

export interface RdoRegistro {
  id: string;
  empresa_id: string;
  obra_id: string;
  /** "Nº" impresso no documento — sequencial por obra. */
  numero: number | null;
  data: string;
  clima_manha: ClimaTurno | null;
  clima_tarde: ClimaTurno | null;
  clima_noite: ClimaTurno | null;
  condicao_manha: CondicaoTrabalho | null;
  condicao_tarde: CondicaoTrabalho | null;
  condicao_noite: CondicaoTrabalho | null;
  impacto_cronograma: string | null;
  observacoes: string | null;
  status: 'rascunho' | 'finalizado';
  assinado_em: string | null;
  assinante_nome: string | null;
  assinante_crea: string | null;
  obra?: { id: string; obra_nome: string; local_obra?: string; cliente?: string };
  autor_user?: { id: number; name: string };
  tarefas: RdoTarefa[];
  fotos: RdoFoto[];
  mao_de_obra: RdoMaoDeObra[];
  equipamentos: RdoEquipamento[];
  ocorrencias: RdoOcorrencia[];
  pendencias: RdoPendencia[];
  etapas: RdoEtapa[];
  responsaveis_presentes: RdoResponsavelPresente[];
  comentarios_internos: RdoComentarioInterno[];
  /** F10 — fichas de verificação nascidas/copiadas sozinhas ao salvar este RDO (ver `RdoController`). */
  fvs_preenchimentos: FvsPreenchimento[];
}

/** Cabeçalho técnico da obra — campos que o RDO exige e a obra não tem. */
export interface RdoObraDados {
  id?: string;
  obra_id?: string;
  numero_contrato: string | null;
  responsavel_tecnico: string | null;
  crea: string | null;
  art: string | null;
  data_inicio: string | null;
  prazo: string | null;
  contratante_nome: string | null;
}

/** Tudo que o formulário precisa antes de o usuário começar a preencher. */
export interface RdoPreparo {
  obra: { id: string; obra_nome: string; local_obra?: string; cliente?: string };
  cabecalho: RdoObraDados | null;
  proximo_numero: number;
  etapas_sugeridas: Array<{ eap_item_id: string | null; nome: string; concluida: boolean }>;
  mao_de_obra_sugerida: Array<{
    categoria: CategoriaMaoDeObra;
    profissional_id: string | null;
    profissional_nome: string | null;
    funcao: string;
    quantidade: number;
  }>;
  equipamentos_catalogo: Array<{ id: string; nome: string }>;
  funcoes_usadas: Array<{ categoria: CategoriaMaoDeObra; funcao: string }>;
  /** Contratos de equipamento ainda não encerrados, com os itens ainda com o cliente — alimenta "Equipamentos alugados". */
  contratos_equipamentos_ativos: Array<{
    id: string;
    numero: number;
    nome_contrato: string;
    itens: Array<{ id: string; descricao: string; quantidade: number }>;
  }>;
}

export interface RdoContratanteLink {
  id: string;
  obra_id: string;
  token: string;
  email: string | null;
  expira_em: string | null;
  ativo: boolean;
}

/**
 * Foto escolhida no formulário, antes de subir. `tarefaRef` guarda o id local
 * da tarefa a que ela pertence (ou null = foto do dia); `marcador` é o croqui
 * em coordenadas relativas, mesmo formato que o backend grava.
 */
export interface FotoSelecionada {
  arquivo: File;
  previewUrl: string;
  tarefaRef: string | null;
  legenda: string;
  marcador: { x: number; y: number } | null;
  nota: string;
}

/**
 * Vídeo escolhido no formulário, antes de subir (F8, 22/09/2026) — mesma
 * ideia de `FotoSelecionada`, mais simples (sem croqui: não faz sentido
 * marcar um ponto num vídeo). `previewUrl` alimenta um `<video>` de prévia,
 * não uma miniatura estática.
 */
export interface VideoSelecionado {
  arquivo: File;
  previewUrl: string;
  tarefaRef: string | null;
  legenda: string;
}

/** 100 MB — cabe no limite do servidor (110 MB, ver `RdoController::validarPayload`). */
export const TAMANHO_MAXIMO_VIDEO = 100 * 1024 * 1024;
