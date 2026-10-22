import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Entrega um arquivo gerado na hora (PDF etc.) ao usuário (17/10/2026).
 *
 * No site é o download normal do navegador. No app (Capacitor) o WebView do
 * Android ignora `<a download>` com URL de objeto — o clique não faz nada. Aí o
 * arquivo é gravado no cache do aparelho e a folha de compartilhamento do
 * Android abre: dali o usuário escolhe "Salvar em Arquivos/Drive", abrir num
 * leitor de PDF ou mandar pelo WhatsApp/e-mail.
 */
export async function entregarArquivo(blob: Blob, nome: string): Promise<void> {
  const nomeSeguro = nome.replace(/[\\/:*?"<>|]+/g, '-');

  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeSeguro;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  const { uri } = await Filesystem.writeFile({
    path: nomeSeguro,
    data: await blobParaBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });

  try {
    await Share.share({ title: nomeSeguro, url: uri, dialogTitle: 'Salvar ou enviar o PDF' });
  } catch (erro) {
    // Fechar a folha de compartilhamento sem escolher nada não é falha.
    if (!/cancel/i.test(String((erro as { message?: string })?.message ?? erro))) throw erro;
  }
}

/** Conteúdo do blob em base64 puro (sem o prefixo `data:...;base64,`) — o formato que o plugin de arquivos pede. */
function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(leitor.error);
    leitor.onload = () => resolve(String(leitor.result).split(',')[1] ?? '');
    leitor.readAsDataURL(blob);
  });
}
