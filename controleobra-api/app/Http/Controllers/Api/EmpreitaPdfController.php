<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Empreita;
use App\Models\Obra;
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

    /** Opções do "Resumo para o profissional" que a tela de impressão entende — qualquer outra é descartada. */
    private const OPCOES_RESUMO = ['pagamentos', 'medicoes', 'medicaoAtual', 'reservas', 'valoresEmpreiteiro'];

    /**
     * PDF de resumo das empreitas SELECIONADAS, para entregar ao profissional
     * (19/09/2026, pedido dos usuários). Um único PDF com um bloco por
     * empreita; o que aparece além do básico (total, pago, saldo, % de
     * medição e serviços) depende de `opcoes` — ver
     * `EmpreitaResumoProfissionalImprimir` no Angular. Não expõe dados
     * internos (orçado da EAP): a tela de impressão nem os carrega.
     *
     * Só entram empreitas DESTA obra e desta empresa (`PertenceAEmpresa`
     * já filtra a empresa); id que não bate é ignorado, e sem nenhuma
     * empreita válida devolve 422.
     */
    public function resumoProfissional(Request $request, Obra $obra)
    {
        $user = $request->user();

        $ids = collect(explode(',', (string) $request->query('ids')))
            ->map(fn ($id) => trim($id))
            ->filter()
            ->unique()
            ->values();

        $empreitas = Empreita::where('obra_id', $obra->id)
            ->whereIn('id', $ids)
            ->orderBy('created_at')
            ->get();

        if ($empreitas->isEmpty()) {
            return response()->json(['message' => 'Nenhuma empreita válida foi selecionada.'], 422);
        }

        $opcoes = collect(explode(',', (string) $request->query('opcoes')))
            ->map(fn ($opcao) => trim($opcao))
            ->filter(fn ($opcao) => in_array($opcao, self::OPCOES_RESUMO, true))
            ->unique()
            ->values();

        $tokenTemporario = $user->createToken(
            'impressao-pdf-resumo-profissional-' . $obra->id,
            ['*'],
            now()->addMinutes(3),
        );

        $baseFrontend = rtrim((string) config('pdf.frontend_url'), '/');
        $baseApi = (string) config('pdf.api_url');
        $url = "{$baseFrontend}/imprimir/obras/{$obra->id}/resumo-profissional"
            . '?token=' . urlencode($tokenTemporario->plainTextToken)
            . '&apiUrl=' . urlencode($baseApi)
            . '&ids=' . urlencode($empreitas->pluck('id')->implode(','))
            . '&opcoes=' . urlencode($opcoes->implode(','));

        try {
            $pdf = Browsershot::url($url)
                ->setChromePath((string) config('pdf.chrome_path'))
                ->noSandbox()
                ->setNodeEnv(['HOME' => '/tmp'])
                ->waitUntilNetworkIdle()
                ->format('A4')
                ->margins(10, 10, 14, 10)
                ->showBackground()
                ->timeout(60)
                ->pdf();
        } finally {
            $tokenTemporario->accessToken->delete();
        }

        // Um profissional só: nome dele no arquivo; mais de um: nome genérico.
        $profissionais = $empreitas->pluck('empreiteiro')->map(fn ($nome) => trim((string) $nome))->unique();
        $profissional = $profissionais->count() === 1 ? $profissionais->first() : '';
        $nomeArquivo = 'resumo-' . str($profissional !== '' ? $profissional : 'empreitas')->slug() . '.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }
}
