<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Obra;
use Illuminate\Http\Request;
use Spatie\Browsershot\Browsershot;

/**
 * Gera o PDF do Cronograma de Desembolso — mesmo mecanismo do
 * RelatorioPdfController/MapaPdfController (ver docs/GERAR-PDF.md).
 * 23/08/2026, pedido do Lucas: "crie a exportação em PDF do cronograma de
 * desembolso".
 *
 * Abre a própria tela de impressão do Angular
 * (`/imprimir/obras/{obraId}/desembolso`, `CronogramaDesembolsoImprimir`)
 * num Chromium headless e imprime exatamente o que ela renderiza.
 *
 * `->landscape()`: cada mês com pagamento confirmado vira uma coluna —
 * uma obra de vários meses fica larga demais pra A4 retrato.
 */
class CronogramaPdfController extends Controller
{
    public function relatorioCronograma(Request $request, Obra $obra)
    {
        $user = $request->user();

        $tokenTemporario = $user->createToken(
            'impressao-pdf-desembolso-' . $obra->id,
            ['*'],
            now()->addMinutes(2),
        );

        $baseFrontend = rtrim((string) config('pdf.frontend_url'), '/');
        $baseApi = (string) config('pdf.api_url');
        $url = "{$baseFrontend}/imprimir/obras/{$obra->id}/desembolso"
            . '?token=' . urlencode($tokenTemporario->plainTextToken)
            . '&apiUrl=' . urlencode($baseApi);

        try {
            $pdf = Browsershot::url($url)
                ->setChromePath((string) config('pdf.chrome_path'))
                ->noSandbox() // necessário: sem isso o Chromium recusa abrir dentro do container
                ->setNodeEnv(['HOME' => '/tmp']) // ver RelatorioPdfController — mesma correção do crashpad
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

        $nomeArquivo = str($obra->obra_nome ?: 'obra')->slug() . '-cronograma-desembolso.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }
}
