import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';

/**
 * Leitura de nota fiscal por foto (IA) — usado pelo modal de Pagamento e
 * pelo cadastro de Fornecedores, que mandam a foto pra `.../ler-nota`
 * (`NotaFiscalController` no backend).
 */

/** Formatos que o backend aceita (`NotaFiscalController::processar`). */
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

/** Foto já leve e num formato aceito vai como está. */
const TAMANHO_SEM_REDUZIR = 1.5 * 1024 * 1024;

/**
 * Lado maior depois de reduzir. A IA já reduz sozinha o que passar do
 * limite do modelo (1568 px nos modelos padrão, 2576 px nos de alta
 * resolução) — mandar maior que isso só gasta upload.
 */
const LADO_MAIOR_PX = 2000;
const QUALIDADE_JPEG = 0.85;

/**
 * Reduz a foto antes de mandar pra leitura: foto de celular passa fácil
 * de 5 MB, demora a subir no 4G e pode passar do limite do backend.
 * Também converte pra JPEG formatos que o navegador abre mas o backend
 * não aceita (ex.: HEIC no Safari). Se o navegador não conseguir abrir a
 * imagem, devolve o arquivo original — aí o backend responde com uma
 * mensagem clara se não aceitar.
 *
 * Só a cópia que vai pra IA é reduzida; a nota arquivada nos anexos
 * continua sendo a foto original.
 */
export async function prepararImagemParaLeitura(arquivo: File): Promise<File> {
  const tipoAceito = TIPOS_ACEITOS.includes(arquivo.type);
  if (tipoAceito && arquivo.size <= TAMANHO_SEM_REDUZIR) return arquivo;

  try {
    const imagem = await carregarImagem(arquivo);
    const escala = Math.min(1, LADO_MAIOR_PX / Math.max(imagem.naturalWidth, imagem.naturalHeight));
    const largura = Math.round(imagem.naturalWidth * escala);
    const altura = Math.round(imagem.naturalHeight * escala);

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext('2d');
    if (!contexto) return arquivo;
    // Fundo branco: a parte transparente de um PNG ficaria preta no JPEG.
    contexto.fillStyle = '#fff';
    contexto.fillRect(0, 0, largura, altura);
    contexto.drawImage(imagem, 0, 0, largura, altura);

    const blob = await new Promise<Blob | null>((resolver) =>
      canvas.toBlob(resolver, 'image/jpeg', QUALIDADE_JPEG),
    );
    if (!blob || (tipoAceito && blob.size >= arquivo.size)) return arquivo;

    const nome = arquivo.name.replace(/\.[^.]*$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg' });
  } catch {
    return arquivo;
  }
}

async function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(arquivo);
  try {
    const imagem = new Image();
    imagem.src = url;
    await imagem.decode();
    return imagem;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Mensagem pro usuário quando a leitura falha. O backend responde os
 * erros com status 4xx/5xx e uma `message` em português — e o Angular
 * trata qualquer status de erro como falha, então a mensagem tem que ser
 * lida aqui, no `error` do `subscribe`, não no `next`.
 */
export function mensagemErroLeituraNota(erro: unknown): string {
  if (erro instanceof TimeoutError) {
    return 'A leitura demorou demais e foi interrompida. Tente de novo em instantes.';
  }

  if (erro instanceof HttpErrorResponse) {
    if (erro.status === 0) return 'Não foi possível falar com o servidor. Confira a internet e tente de novo.';
    if (erro.status === 401) return 'Sua sessão expirou. Entre de novo para ler a nota.';
    if (erro.status === 413) return 'A foto é grande demais para enviar. Use uma foto menor.';

    const corpo = erro.error as { ok?: boolean; message?: unknown; errors?: Record<string, string[]> } | null;
    const doCampo = corpo?.errors?.['imagem']?.[0];
    if (doCampo) return doCampo;

    // Um 5xx do próprio Laravel (sem `ok`) vem como "Server Error", em
    // inglês — dos 5xx, só usa a mensagem que o controller montou.
    const mensagem = typeof corpo?.message === 'string' ? corpo.message : '';
    if (mensagem && (corpo?.ok === false || erro.status < 500)) return mensagem;
  }

  return 'Não foi possível ler a nota fiscal. Tente de novo.';
}
