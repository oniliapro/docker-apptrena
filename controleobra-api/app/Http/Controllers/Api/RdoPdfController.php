<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RdoRegistro;
use Illuminate\Http\Request;
use Spatie\Browsershot\Browsershot;

/**
 * PDF do Relatório Diário de Obra.
 *
 * Mesmo mecanismo dos outros PDFs do sistema (ver docs/GERAR-PDF.md): abre a
 * tela de impressão do próprio Angular (`/imprimir/rdo/{id}`, `RdoImprimir`)
 * num Chromium headless e imprime o que ela renderiza. A vantagem de manter
 * assim, em vez de montar o documento em PHP, é que o PDF nunca diverge do que
 * o usuário vê — é a mesma tela, com CSS de A4.
 *
 * Retrato, e não paisagem como a medição: o RDO é um documento de uma página
 * em pé, como a planilha-modelo que o mercado usa.
 */
class RdoPdfController extends Controller
{
    public function gerar(Request $request, RdoRegistro $rdo)
    {
        // O route-model-binding passa pelo global scope de empresa — um id de
        // outra empresa não é encontrado, então não há como imprimir RDO alheio.
        $user = $request->user();

        $tokenTemporario = $user->createToken(
            'impressao-pdf-rdo-' . $rdo->id,
            ['*'],
            now()->addMinutes(2),
        );

        $baseFrontend = rtrim((string) config('pdf.frontend_url'), '/');
        $baseApi = (string) config('pdf.api_url');
        $url = "{$baseFrontend}/imprimir/rdo/{$rdo->id}"
            . '?token=' . urlencode($tokenTemporario->plainTextToken)
            . '&apiUrl=' . urlencode($baseApi);

        try {
            $pdf = Browsershot::url($url)
                ->setChromePath((string) config('pdf.chrome_path'))
                ->noSandbox()
                ->setNodeEnv(['HOME' => '/tmp'])
                ->waitUntilNetworkIdle()
                ->format('A4')
                ->margins(10, 10, 12, 10)
                ->showBackground()
                ->timeout(40)
                ->pdf();
        } finally {
            $tokenTemporario->accessToken->delete();
        }

        $numero = str_pad((string) ($rdo->numero ?? 0), 3, '0', STR_PAD_LEFT);
        $nomeArquivo = "RDO-{$numero}-{$rdo->data?->format('Y-m-d')}.pdf";

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }
}
