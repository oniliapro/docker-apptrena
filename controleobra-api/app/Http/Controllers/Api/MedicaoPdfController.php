<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Medicao;
use Illuminate\Http\Request;
use Spatie\Browsershot\Browsershot;

/**
 * Gera o PDF de uma medição — mesmo mecanismo do MapaPdfController/
 * EapPdfController (ver docs/GERAR-PDF.md): abre a própria tela de
 * impressão do Angular (`/imprimir/obras/{obraId}/medicoes/{medicaoId}`,
 * `MedicaoImprimir`) num Chromium headless e imprime exatamente o que
 * ela renderiza — reaproveita `MedicaoStore`/`EapStore`, os mesmos
 * stores da tela normal, sem duplicar o cálculo aqui em PHP.
 */
class MedicaoPdfController extends Controller
{
    public function relatorioMedicao(Request $request, Medicao $medicao)
    {
        $user = $request->user();

        $tokenTemporario = $user->createToken(
            'impressao-pdf-medicao-' . $medicao->id,
            ['*'],
            now()->addMinutes(2),
        );

        $baseFrontend = rtrim((string) config('pdf.frontend_url'), '/');
        $baseApi = (string) config('pdf.api_url');
        $url = "{$baseFrontend}/imprimir/obras/{$medicao->obra_id}/medicoes/{$medicao->id}"
            . '?token=' . urlencode($tokenTemporario->plainTextToken)
            . '&apiUrl=' . urlencode($baseApi);

        try {
            $pdf = Browsershot::url($url)
                ->setChromePath((string) config('pdf.chrome_path'))
                ->noSandbox()
                ->setNodeEnv(['HOME' => '/tmp'])
                ->waitUntilNetworkIdle()
                ->format('A4')
                ->landscape()
                ->margins(10, 8, 14, 8)
                ->showBackground()
                ->timeout(30)
                ->pdf();
        } finally {
            $tokenTemporario->accessToken->delete();
        }

        $nomeArquivo = "medicao-{$medicao->sequencia}.pdf";

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }
}
