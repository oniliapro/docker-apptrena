/* ===== LEITURA DE NOTA FISCAL POR IA (Pagamentos) ===== */

async function lerNotaFiscalIA() {
  if (!arquivoNotaFiscal || !arquivoNotaFiscal.files || !arquivoNotaFiscal.files[0]) {
    window.alert("Selecione uma imagem da nota fiscal ou recibo primeiro.");
    return;
  }
  if (!estadoModalPagamento) return;

  const arquivo = arquivoNotaFiscal.files[0];

  if (statusLeituraNota) statusLeituraNota.textContent = "Lendo nota...";

  try {
    const token = window.controleObraAuth ? window.controleObraAuth.getToken() : "";
    const apiBase = window.controleObraApiBase || "http://localhost:8088/api";

    const formData = new FormData();
    formData.append("imagem", arquivo);

    const resposta = await fetch(`${apiBase}/pagamentos/ler-nota`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const payload = await resposta.json().catch(() => ({}));

    if (!resposta.ok || !payload.ok) {
      if (statusLeituraNota) statusLeituraNota.textContent = "";
      window.alert(payload.message || "Não foi possível ler a nota fiscal.");
      return;
    }

    const d = payload.dados || {};

    if (d.fornecedor && inputsPagamento.fornecedor) {
      inputsPagamento.fornecedor.value = d.fornecedor;
    }

    let descricaoFinal = String(d.descricao || "").trim();
    if (d.numero_nota) {
      descricaoFinal = descricaoFinal
        ? `${descricaoFinal} (Nota nº ${d.numero_nota})`
        : `Nota nº ${d.numero_nota}`;
    }
    if (descricaoFinal && inputsPagamento.descricao) {
      inputsPagamento.descricao.value = descricaoFinal;
    }

    if (d.data && inputsPagamento.dataPagamento) {
      inputsPagamento.dataPagamento.value = d.data;
    }

    if (d.valor_total !== null && d.valor_total !== undefined && inputsPagamento.valorTotal) {
      const valorNumerico = Number(d.valor_total) || 0;
      inputsPagamento.valorTotal.value = formatarMoeda(valorNumerico);
      atualizarResumoModalPagamento();
    }

    if (statusLeituraNota) {
      statusLeituraNota.textContent = "Dados preenchidos — confira antes de salvar.";
    }
  } catch (err) {
    if (statusLeituraNota) statusLeituraNota.textContent = "";
    window.alert("Não foi possível falar com o servidor para ler a nota.");
  }
}
