<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Obra;
use Illuminate\Http\Request;
use Spatie\Browsershot\Browsershot;

/**
 * Gera o PDF da EAP — mesmo mecanismo do RelatorioPdfController/
 * MapaPdfController (ver docs/GERAR-PDF.md). 23/08/2026, pedido do Lucas:
 * "crie a exportação em PDF da EAP".
 *
 * Abre a própria tela de impressão do Angular
 * (`/imprimir/obras/{obraId}/eap`, `EapImprimir`) num Chromium headless e
 * imprime exatamente o que ela renderiza — inclusive reaproveitando
 * `EapStore`, o mesmo store da tela normal.
 *
 * `->landscape()`: com "Detalhar categorias" ligado, a tabela tem até 5
 * colunas de custo/orçado (uma por categoria) + Total, cada uma com dois
 * valores empilhados — larga demais pra A4 retrato.
 */
class EapPdfController extends Controller
{
    public function relatorioEap(Request $request, Obra $obra)
    {
        $user = $request->user();

        $tokenTemporario = $user->createToken(
            'impressao-pdf-eap-' . $obra->id,
            ['*'],
            now()->addMinutes(2),
        );

        $baseFrontend = rtrim((string) config('pdf.frontend_url'), '/');
        $baseApi = (string) config('pdf.api_url');
        $url = "{$baseFrontend}/imprimir/obras/{$obra->id}/eap"
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

        $nomeArquivo = str($obra->obra_nome ?: 'obra')->slug() . '-eap.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }
}
