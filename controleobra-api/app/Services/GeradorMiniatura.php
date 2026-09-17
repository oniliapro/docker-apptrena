<?php

namespace App\Services;

use App\Models\Arquivo;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Imagick;

/**
 * Gera miniaturas de vídeo/PDF de forma síncrona, dentro da própria
 * requisição de upload — este projeto não tem worker de fila rodando
 * (nenhum container processa a tabela `jobs`), então rodar aqui é o
 * pragmático "consistente com o resto do código", não uma escolha
 * definitiva: se um worker existir no futuro, troque a chamada direta em
 * ArquivoController::store por um dispatch() sem mexer no resto.
 *
 * Falha na geração de miniatura NUNCA deve derrubar o upload em si —
 * por isso cada branch tem seu próprio try/catch e só atualiza
 * thumbnail_status, nunca lança pra fora de gerar().
 */
class GeradorMiniatura
{
    public function gerar(Arquivo $arquivo): void
    {
        $metodo = match ($arquivo->categoria) {
            'video' => 'gerarDeVideo',
            'pdf' => 'gerarDePdf',
            'audio' => 'gerarDeAudio',
            default => null,
        };

        if ($metodo === null) {
            $arquivo->update(['thumbnail_status' => 'nao_aplicavel']);
            return;
        }

        try {
            $caminhoRelativo = $this->{$metodo}($arquivo);
            if ($caminhoRelativo) {
                $arquivo->update([
                    'caminho_thumbnail' => $caminhoRelativo,
                    'thumbnail_status' => 'pronto',
                ]);
            } else {
                $arquivo->update(['thumbnail_status' => 'nao_aplicavel']);
            }
        } catch (\Throwable $e) {
            Log::warning('Falha ao gerar miniatura', ['arquivo_id' => $arquivo->id, 'erro' => $e->getMessage()]);
            $arquivo->update(['thumbnail_status' => 'falhou']);
        }
    }

    private function caminhoThumbDestino(Arquivo $arquivo): string
    {
        return "obras-thumbs/{$arquivo->pasta_id}/{$arquivo->id}.jpg";
    }

    private function gerarDeVideo(Arquivo $arquivo): string
    {
        $origem = Storage::disk('local')->path($arquivo->caminho);
        $destinoRelativo = $this->caminhoThumbDestino($arquivo);
        $destinoAbsoluto = Storage::disk('local')->path($destinoRelativo);
        Storage::disk('local')->makeDirectory(dirname($destinoRelativo));

        $comando = ['ffmpeg', '-y', '-ss', '00:00:01', '-i', $origem, '-vframes', '1', '-vf', 'scale=320:-1', $destinoAbsoluto];
        $resultado = Process::timeout(60)->run($comando);

        if (!$resultado->successful() || !file_exists($destinoAbsoluto)) {
            // Clipe muito curto pra ter o frame de 1s — tenta o frame inicial.
            $comandoFallback = ['ffmpeg', '-y', '-ss', '00:00:00', '-i', $origem, '-vframes', '1', '-vf', 'scale=320:-1', $destinoAbsoluto];
            $resultado = Process::timeout(60)->run($comandoFallback);
        }

        if (!$resultado->successful() || !file_exists($destinoAbsoluto)) {
            throw new \RuntimeException('ffmpeg não gerou o frame: '.$resultado->errorOutput());
        }

        return $destinoRelativo;
    }

    private function gerarDePdf(Arquivo $arquivo): string
    {
        $origem = Storage::disk('local')->path($arquivo->caminho);
        $destinoRelativo = $this->caminhoThumbDestino($arquivo);
        $destinoAbsoluto = Storage::disk('local')->path($destinoRelativo);
        Storage::disk('local')->makeDirectory(dirname($destinoRelativo));

        $imagick = new Imagick();
        $imagick->setResolution(150, 150);
        $imagick->readImage($origem.'[0]');
        $imagick->setImageFormat('jpeg');
        $imagick->writeImage($destinoAbsoluto);
        $imagick->clear();
        $imagick->destroy();

        return $destinoRelativo;
    }

    /**
     * Melhor esforço: só gera miniatura se o áudio tiver capa embutida
     * (ID3v2/APIC). Sem capa, retorna null (thumbnail_status vira
     * nao_aplicavel) — o frontend mostra um placeholder de áudio com
     * visual próprio, não o ícone genérico de formato comum.
     */
    private function gerarDeAudio(Arquivo $arquivo): ?string
    {
        $origem = Storage::disk('local')->path($arquivo->caminho);

        $getID3 = new \getID3();
        $info = $getID3->analyze($origem);
        $capa = $info['comments']['picture'][0]['data'] ?? null;
        if (!$capa) {
            return null;
        }

        $destinoRelativo = $this->caminhoThumbDestino($arquivo);
        Storage::disk('local')->makeDirectory(dirname($destinoRelativo));
        Storage::disk('local')->put($destinoRelativo, $capa);

        return $destinoRelativo;
    }
}
