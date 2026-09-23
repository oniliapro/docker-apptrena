/**
 * Relatório Diário de Obra (RDO) — tipos do módulo reconstruído em
 * 17/09/2026.
 *
 * Ficam aqui, e não em `core/models/api.models.ts`, de propósito: aquele
 * arquivo é compartilhado por todos os módulos e este módulo não altera nada
 * fora do próprio escopo.
 */

/** Condição do tempo em cada turno, como o RDO impresso registra. */
export type ClimaTurno = 'claro' | 'nublado' | 'chuva' | 'temporal' | 'impraticavel';

export const CLIMAS: ReadonlyArray<{ valor: ClimaTurno; rotulo: string }> = [
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'nublado', rotulo: 'Nublado' },
  { valor: 'chuva', rotulo: 'Chuva' },
  { valor: 'temporal', rotulo: 'Temporal' },
  { valor: 'impraticavel', rotulo: 'Impraticável' },
];

export const TIPOS_OCORRENCIA: ReadonlyArray<{ valor: string; rotulo: string }> = [
  { valor: 'nao_conformidade', rotulo: 'Não conformidade' },
  { valor: 'mudanca_projeto', rotulo: 'Mudança de projeto' },
  { valor: 'interferencia', rotulo: 'Interferência' },
  { valor: 'interrupcao', rotulo: 'Interrupção de trabalho' },
  { valor: 'outra', rotulo: 'Outra' },
];

/** Mão de obra é registrada nas duas colunas do RDO. */
export type CategoriaMaoDeObra = 'indireta' | 'direta';

export interface RdoTarefa {
  id: string;
  ordem: number;
  descricao: string;
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
  funcao: string;
  quantidade: number;
}

export interface RdoEquipamento {
  id: string;
  equipamento_id: string | null;
  descricao: string;
  quantidade: number;
}

export interface RdoOcorrencia {
  id: string;
  ordem: number;
  tipo: string;
  descricao: string;
  responsavel: string | null;
  motivo: string | null;
  danos_materiais: string | null;
}

export interface RdoPendencia {
  id: string;
  descricao: string;
  responsavel: string | null;
  prazo: string | null;
  status: 'aberta' | 'concluida';
}

export interface RdoEtapa {
  id: string;
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
  etapas_sugeridas: Array<{ nome: string; concluida: boolean }>;
  mao_de_obra_sugerida: Array<{ categoria: CategoriaMaoDeObra; funcao: string; quantidade: number }>;
  equipamentos_catalogo: Array<{ id: string; nome: string }>;
  funcoes_usadas: Array<{ categoria: CategoriaMaoDeObra; funcao: string }>;
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
