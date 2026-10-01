<?php

namespace App\Support;

/**
 * Regras de validação padrão pra upload de imagem/vídeo em todo o sistema
 * (30/09/2026) — centralizadas depois de achar o mesmo bug em mais de um
 * controller: `image|max:8192` (regra `image`, baseada em
 * `getimagesize()`, mais um limite de 8MB) rejeitava sem nenhum aviso
 * fotos de celular modernas (12MP+ passam de 8MB fácil) e não reconhecia
 * HEIC/HEIF (formato padrão da câmera do iPhone) — a foto simplesmente
 * não salvava, sem erro nenhum na tela do usuário. Qualquer upload de
 * imagem/vídeo NOVO neste sistema deve usar essas constantes em vez de
 * escrever a regra na mão — ver também `lang/pt_BR/validation.php`
 * (mensagem de erro em português quando uma regra dessas rejeita algo de
 * verdade) e `php-uploads.ini` (`max_file_uploads` — limite de QUANTOS
 * arquivos cabem numa única requisição, families de outra causa raiz do
 * mesmo sintoma "a imagem não aparece depois de salvar").
 */
class ValidacaoMidia
{
    public const IMAGEM = 'file|mimetypes:image/jpeg,image/png,image/gif,image/bmp,image/webp,image/heic,image/heif|max:25600';

    public const VIDEO = 'file|mimetypes:video/mp4,video/quicktime,video/webm|max:102400';
}
