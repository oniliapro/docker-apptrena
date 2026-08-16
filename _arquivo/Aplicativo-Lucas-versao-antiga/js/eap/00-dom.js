// Elementos DOM (EAP)
const cabecalhoTabela = document.getElementById("cabecalhoTabela");
const corpoTabela = document.getElementById("corpoTabela");
const rodapeTabela = document.getElementById("rodapeTabela");
const grupoColunas = document.getElementById("grupoColunas");
const painelTestes = document.getElementById("painelTestes");
const tabelaEap = document.getElementById("tabelaEap");

// Painéis de resumo
const resumoCategoria = document.getElementById("resumoCategoria");
const modalGastos = document.getElementById("modalGastos");
const tituloGastos = document.getElementById("tituloGastos");
const corpoGastos = document.getElementById("corpoGastos");

// Cabeçalho
const inputNumeroMapa = document.getElementById("numeroMapa");
const inputsCabecalho = {
  nomeObra: document.getElementById("nomeObra"),
  cliente: document.getElementById("cliente"),
  dataBase: document.getElementById("dataBase"),
  responsavel: document.getElementById("responsavel"),
  local: document.getElementById("local"),
  periodo: document.getElementById("periodo"),
  observacoes: document.getElementById("observacoes"),
};

// Barra de ferramentas (visibilidade de colunas)
const inputsBarraFerramentas = {
  alternarUnitario: document.getElementById("alternarUnitario"),
  alternarTotal: document.getElementById("alternarTotal"),
  alternarBdi: document.getElementById("alternarBdi"),
  alternarTipos: document.getElementById("alternarTipos"),
  alternanciasTipos: document.getElementById("alternanciasTipos"),
};

const botoesAcao = {
  adicionarItem: document.getElementById("btnAdicionarItemEap"),
  limpar: document.getElementById("btnLimparEap"),
  confirmar: document.getElementById("btnConfirmarEap"),
};
