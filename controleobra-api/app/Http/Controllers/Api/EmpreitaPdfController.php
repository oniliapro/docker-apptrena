<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Empreita;
use Illuminate\Http\Request;
use Spatie\Browsershot\Browsershot;

/**
 * Gera o PDF da Empreita — mesmo mecanismo do RelatorioPdfController/
 * MapaPdfController (ver docs/GERAR-PDF.md). 23/08/2026, pedido do Lucas:
 * "crie a exportação em PDF das empreitas".
 *
 * Abre a própria tela de impressão do Angular
 * (`/imprimir/obras/{obraId}/empreitas/{empreitaId}`, `EmpreitaImprimir`)
 * num Chromium headless e imprime exatamente o que ela renderiza —
 * inclusive reaproveitando `EmpreitaStore`, o mesmo store da tela normal.
 *
 * `->landscape()`: a tabela tem 15 colunas (Orçado, Contrato, Medição e
 * Pagamento do período, cada bloco com várias categorias empilhadas) —
 * larga demais pra A4 retrato.
 */
class EmpreitaPdfController extends Controller
{
    public function relatorioEmpreita(Request $request, Empreita $empreita)
    {
        $user = $request->user();

        $tokenTemporario = $user->createToken(
            'impressao-pdf-empreita-' . $empreita->id,
            ['*'],
            now()->addMinutes(2),
        );

        $baseFrontend = rtrim((string) config('pdf.frontend_url'), '/');
        $baseApi = (string) config('pdf.api_url');
        $url = "{$baseFrontend}/imprimir/obras/{$empreita->obra_id}/empreitas/{$empreita->id}"
            . '?token=' . urlencode($tokenTemporario->plainTextToken)
            . '&apiUrl=' . urlencode($baseApi);

        // "Simplificar" (01/09/2026, pedido do Lucas) — esconde Empreiteiro/
        // Reserva no relatório, mostra só o Total. Repassado como query
        // param até `EmpreitaImprimir`, sem persistir nada (mesmo mecanismo
        // stateless de `token`/`apiUrl`).
        if ($request->boolean('simplificado')) {
            $url .= '&simplificado=1';
        }

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

        $nomeArquivo = str($empreita->numero_empreita ?: $empreita->id)->slug() . '-empreita.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }
}
