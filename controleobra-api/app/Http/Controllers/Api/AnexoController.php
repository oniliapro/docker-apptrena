<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\ClassificaArquivo;
use App\Http\Controllers\Controller;
use App\Models\Arquivo;
use App\Models\Empreita;
use App\Models\Obra;
use App\Models\Pagamento;
use App\Models\Pasta;
use App\Models\Recebimento;
use App\Models\Tag;
use App\Services\AnexoNomeador;
use App\Services\GeradorMiniatura;
use App\Services\PastaRaizes;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * "Anexar arquivo" dentro de um lançamento de Pagamento/Recebimento
 * (06/09/2026, pedido do Lucas: controle de notas fiscais). Um anexo é só
 * um `Arquivo` normal (mesma tabela do minissistema de "Arquivos
 * Anexados" da obra) com `tag_id`/`origem_tipo`/`origem_id` preenchidos —
 * por isso download/preview/exclusão não precisam de rota nova, já
 * funcionam via `arquivos/{arquivo}/...` (`ArquivoController`).
 *
 * O nome do arquivo é gerado automaticamente:
 * `{nome da tag} {sequencial} - {nome da obra} - {número do lançamento}.{extensão}`
 * — o sequencial conta só os anexos da MESMA tag no MESMO lançamento
 * (reinicia em 1 a cada Pagamento/Recebimento diferente).
 */
class AnexoController extends Controller
{
    use ClassificaArquivo;

    public function indexPagamento(Pagamento $pagamento)
    {
        return $this->listar('pagamento', $pagamento->id);
    }

    public function storePagamento(Request $request, Pagamento $pagamento, GeradorMiniatura $gerador)
    {
        return $this->criar($request, 'pagamento', $pagamento->id, $pagamento->obra_id, $pagamento->numero_pagamento, $gerador);
    }

    public function indexRecebimento(Recebimento $recebimento)
    {
        return $this->listar('recebimento', $recebimento->id);
    }

    public function storeRecebimento(Request $request, Recebimento $recebimento, GeradorMiniatura $gerador)
    {
        return $this->criar($request, 'recebimento', $recebimento->id, $recebimento->obra_id, $recebimento->numero_recebimento, $gerador);
    }

    /** Anexo de Empreita (27/09/2026, pedido do Lucas) — contrato assinado, principalmente, mas serve pra qualquer arquivo. */
    public function indexEmpreita(Empreita $empreita)
    {
        return $this->listar('empreita', $empreita->id);
    }

    public function storeEmpreita(Request $request, Empreita $empreita, GeradorMiniatura $gerador, EmpreitaController $empreitaController)
    {
        $resposta = $this->criar($request, 'empreita', $empreita->id, $empreita->obra_id, $empreita->numero_empreita, $gerador);
        $empreitaController->garantirLembreteContratoPendente($empreita, $request->user());

        return $resposta;
    }

    private function listar(string $origemTipo, string $origemId)
    {
        // `with('tag')` — o popup de anexos (06/09/2026, pedido do Lucas)
        // agrupa por tag sem precisar de uma 2ª chamada só pra achar o
        // nome de cada uma.
        return Arquivo::with('tag')
            ->where('origem_tipo', $origemTipo)
            ->where('origem_id', $origemId)
            ->orderBy('created_at')
            ->get();
    }

    private function criar(
        Request $request,
        string $origemTipo,
        string $origemId,
        string $obraId,
        string $numero,
        GeradorMiniatura $gerador,
    ) {
        $data = $request->validate([
            'tag_id' => 'required|string',
            'arquivo' => 'required|file|max:102400', // 100MB em KB
        ]);

        // `findOrFail` (não a regra `exists:`) de propósito — `Tag`/`Obra`
        // usam `PertenceAEmpresa` (global scope), então isso já garante
        // que a tag pertence à MESMA empresa do usuário logado; a regra
        // `exists:` faria uma query crua, sem passar pelo scope.
        $tag = Tag::findOrFail($data['tag_id']);
        $obra = Obra::findOrFail($obraId);

        $arquivoEnviado = $request->file('arquivo');
        $extensao = strtolower($arquivoEnviado->getClientOriginalExtension());

        if (!$this->extensaoPermitida($extensao)) {
            abort(422, 'Formato de arquivo não suportado.');
        }

        // Rede de segurança: a tag normalmente já tem pasta em toda obra
        // (criada em `TagController::store`/`ObraController::store`), mas
        // cria aqui também caso a tag tenha sido feita antes desta obra
        // existir e, por algum motivo, o hook de criação da obra não
        // tenha rodado (ex.: obra migrada de outra base).
        $pasta = Pasta::firstOrCreate(
            ['obra_id' => $obra->id, 'tag_id' => $tag->id],
            ['parent_id' => PastaRaizes::compartilhada($obra)->id, 'owner_user_id' => null, 'nome' => $tag->nome],
        );

        // Sequencial por (tag, lançamento) — reinicia a cada Pagamento/
        // Recebimento diferente, mesmo usando a mesma tag.
        $sequencial = Arquivo::where('tag_id', $tag->id)
            ->where('origem_tipo', $origemTipo)
            ->where('origem_id', $origemId)
            ->count() + 1;

        $nomeGerado = AnexoNomeador::nome($tag->nome, $sequencial, $obra->obra_nome, $numero, $extensao);

        $caminho = $arquivoEnviado->storeAs(
            "obras/{$obra->id}/{$pasta->id}",
            Str::uuid().'.'.$extensao,
            'local',
        );

        $arquivo = Arquivo::create([
            'pasta_id' => $pasta->id,
            'nome_original' => $nomeGerado,
            'caminho' => $caminho,
            'extensao' => $extensao,
            'mime' => $arquivoEnviado->getMimeType(),
            'tamanho_bytes' => $arquivoEnviado->getSize(),
            'categoria' => $this->categoriaDaExtensao($extensao),
            'enviado_por_user_id' => auth()->id(),
            'tag_id' => $tag->id,
            'origem_tipo' => $origemTipo,
            'origem_id' => $origemId,
        ]);

        $gerador->gerar($arquivo);

        return response()->json($arquivo->fresh(), 201);
    }
}
