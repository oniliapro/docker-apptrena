// DOM (Pagamentos)
const tabelaPagamentos = document.getElementById("tabelaPagamentos");
const corpoPagamentos = document.getElementById("corpoPagamentos");
const rodapePagamentos = document.getElementById("rodapePagamentos");
const alternarColunaEtapas = document.getElementById("alternarColunaEtapas");

// Modal
const modalPagamento = document.getElementById("modalPagamento");
const tituloModalPagamento = document.getElementById("tituloModalPagamento");
const formularioPagamento = document.getElementById("formPagamento");
const corpoItensPagamento = document.getElementById("corpoItensPagamento");

const arquivoNotaFiscal = document.getElementById("arquivoNotaFiscal");
const statusLeituraNota = document.getElementById("statusLeituraNota");

const somaItensPagamento = document.getElementById("somaItensPagamento");
const totalPagamentoResumo = document.getElementById("totalPagamentoResumo");
const diferencaPagamento = document.getElementById("diferencaPagamento");

const inputsPagamento = {
  numeroObra: document.getElementById("numeroObra"),
  numeroPagamento: document.getElementById("numeroPagamento"),
  dataSolicitacao: document.getElementById("dataSolicitacao"),
  dataPagamento: document.getElementById("dataPagamento"),
  fornecedor: document.getElementById("fornecedorPagamento"),
  descricao: document.getElementById("descricaoPagamento"),
  valorTotal: document.getElementById("valorTotalPagamento"),
};
