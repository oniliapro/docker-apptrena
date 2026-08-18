<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\AutorizaAcessoAPasta;
use App\Http\Controllers\Controller;
use App\Models\Arquivo;
use App\Services\GeradorMiniatura;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

/**
 * CRUD + upload/download/preview de arquivos dentro de uma pasta. Todo
 * arquivo mora no disco privado `local` (storage/app/private) — nunca no
 * disco `public` — porque uma pasta pode ser privada de um usuário
 * específico; download/preview/thumbnail sempre passam por um endpoint
 * autenticado (download) ou assinado (stream/stream-thumb), nunca por uma
 * URL pública direta.
 */
class ArquivoController extends Controller
{
    use AutorizaAcessoAPasta;

    /**
     * Lista de extensões permitidas — não valida por `mimes:` porque
     * formatos CAD/BIM (DWG, IFC, RVT, SKP) não têm sniffing de mimetype
     * confiável no PHP.
     */
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

    public function store(Request $request, string $id, GeradorMiniatura $gerador)
    {
        $pasta = $this->encontrarPastaAutorizada($id);

        $request->validate(['arquivo' => 'required|file|max:102400']); // 100MB em KB

        $arquivoEnviado = $request->file('arquivo');
        $extensao = strtolower($arquivoEnviado->getClientOriginalExtension());

        if (!in_array($extensao, self::EXTENSOES_PERMITIDAS, true)) {
            abort(422, 'Formato de arquivo não suportado.');
        }

        $caminho = $arquivoEnviado->storeAs(
            "obras/{$pasta->obra_id}/{$pasta->id}",
            Str::uuid().'.'.$extensao,
            'local',
        );

        $arquivo = Arquivo::create([
            'pasta_id' => $pasta->id,
            'nome_original' => $arquivoEnviado->getClientOriginalName(),
            'caminho' => $caminho,
            'extensao' => $extensao,
            'mime' => $arquivoEnviado->getMimeType(),
            'tamanho_bytes' => $arquivoEnviado->getSize(),
            'categoria' => self::CATEGORIA_POR_EXTENSAO[$extensao] ?? 'outro',
            'enviado_por_user_id' => auth()->id(),
        ]);

        $gerador->gerar($arquivo);

        return response()->json($arquivo->fresh(), 201);
    }

    public function update(Request $request, Arquivo $arquivo)
    {
        $this->autorizarPasta($arquivo->pasta);

        $data = $request->validate([
            'nome_original' => 'sometimes|string|max:255',
            'pasta_id' => 'sometimes|string',
        ]);

        if (array_key_exists('pasta_id', $data)) {
            $novaPasta = $this->encontrarPastaAutorizada($data['pasta_id']);
            if ($novaPasta->obra_id !== $arquivo->pasta->obra_id || $novaPasta->owner_user_id !== $arquivo->pasta->owner_user_id) {
                abort(422, 'Não é possível mover o arquivo para fora da sua obra ou trocar entre própria/compartilhada.');
            }
            $arquivo->pasta_id = $novaPasta->id;
        }

        if (array_key_exists('nome_original', $data)) {
            $arquivo->nome_original = $data['nome_original'];
        }

        $arquivo->save();

        return $arquivo;
    }

    public function destroy(Arquivo $arquivo)
    {
        $this->autorizarPasta($arquivo->pasta);

        Storage::disk('local')->delete(array_filter([$arquivo->caminho, $arquivo->caminho_thumbnail]));
        $arquivo->delete();

        return response()->noContent();
    }

    public function download(Arquivo $arquivo)
    {
        $this->autorizarPasta($arquivo->pasta);

        return Storage::disk('local')->download($arquivo->caminho, $arquivo->nome_original);
    }

    /**
     * Único ponto onde a privacidade é checada antes de expor o arquivo —
     * devolve uma URL assinada de curta duração que <img>/<video>/<audio>/
     * <iframe> conseguem usar diretamente (não dá pra mandar um header
     * Authorization no `src` dessas tags).
     */
    public function previewUrl(Arquivo $arquivo)
    {
        $this->autorizarPasta($arquivo->pasta);

        $expiraEm = now()->addMinutes(10);

        return [
            'url' => URL::temporarySignedRoute('arquivos.stream', $expiraEm, ['arquivo' => $arquivo->id]),
            'expira_em' => $expiraEm->toIso8601String(),
        ];
    }

    /** Fora do grupo auth:sanctum — autorizado só pela assinatura da URL (middleware 'signed'). */
    public function stream(Arquivo $arquivo)
    {
        return response()->file(Storage::disk('local')->path($arquivo->caminho), [
            'Content-Type' => $arquivo->mime ?? 'application/octet-stream',
        ]);
    }

    public function streamThumb(Arquivo $arquivo)
    {
        if (!$arquivo->caminho_thumbnail) {
            abort(404);
        }

        return response()->file(Storage::disk('local')->path($arquivo->caminho_thumbnail), [
            'Content-Type' => 'image/jpeg',
        ]);
    }
}
