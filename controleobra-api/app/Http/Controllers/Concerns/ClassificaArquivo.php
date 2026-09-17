<?php

namespace App\Http\Controllers\Concerns;

/**
 * Extensões permitidas + classificação por categoria (06/09/2026,
 * extraído de `ArquivoController` pra ser reaproveitado por
 * `AnexoController` sem duplicar a lista). Não valida por `mimes:` porque
 * formatos CAD/BIM (DWG, IFC, RVT, SKP) não têm sniffing de mimetype
 * confiável no PHP.
 */
trait ClassificaArquivo
{
    private const EXTENSOES_PERMITIDAS = [
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
        'mp4', 'mov', 'avi', 'mkv', 'webm',
        'mp3', 'wav', 'ogg', 'm4a',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'odt', 'ods',
        'dwg', 'dxf', 'ifc', 'rvt', 'skp',
        'zip', 'rar', '7z',
    ];

    private const CATEGORIA_POR_EXTENSAO = [
        'jpg' => 'imagem', 'jpeg' => 'imagem', 'png' => 'imagem', 'gif' => 'imagem',
        'webp' => 'imagem', 'bmp' => 'imagem', 'svg' => 'imagem',
        'mp4' => 'video', 'mov' => 'video', 'avi' => 'video', 'mkv' => 'video', 'webm' => 'video',
        'mp3' => 'audio', 'wav' => 'audio', 'ogg' => 'audio', 'm4a' => 'audio',
        'pdf' => 'pdf',
        'doc' => 'documento', 'docx' => 'documento', 'xls' => 'documento', 'xlsx' => 'documento',
        'ppt' => 'documento', 'pptx' => 'documento', 'txt' => 'documento', 'csv' => 'documento',
        'odt' => 'documento', 'ods' => 'documento',
        'dwg' => 'cad_bim', 'dxf' => 'cad_bim', 'ifc' => 'cad_bim', 'rvt' => 'cad_bim', 'skp' => 'cad_bim',
        'zip' => 'compactado', 'rar' => 'compactado', '7z' => 'compactado',
    ];

    private function extensaoPermitida(string $extensao): bool
    {
        return in_array(strtolower($extensao), self::EXTENSOES_PERMITIDAS, true);
    }

    private function categoriaDaExtensao(string $extensao): string
    {
        return self::CATEGORIA_POR_EXTENSAO[strtolower($extensao)] ?? 'outro';
    }
}
