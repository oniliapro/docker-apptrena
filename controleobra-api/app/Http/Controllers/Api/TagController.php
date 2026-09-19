<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Obra;
use App\Models\Pasta;
use App\Models\Tag;
use App\Services\PastaRaizes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * CRUD de Tags (06/09/2026, pedido do Lucas: controle de notas fiscais
 * por anexo em Pagamentos/Recebimentos). Além do CRUD em si, `store()` e
 * `update()` mantêm em sincronia a pasta correspondente a cada tag em
 * TODA obra da empresa — ver `App\Services\PastaRaizes` e o comentário da
 * migration `add_tag_id_a_pastas`.
 */
class TagController extends Controller
{
    public function index()
    {
        return Tag::orderBy('nome')->get();
    }

    /**
     * Regra de nome único POR EMPRESA. `Rule::unique` não respeita o global
     * scope multiempresa (`PertenceAEmpresa`), então o filtro por
     * `empresa_id` é explícito. Sem essa validação, um nome repetido caía
     * no índice `unique(empresa_id, nome)` e virava 500 genérico — e como o
     * índice usa a collation do MySQL (sem distinção de maiúsculas/acentos),
     * "Nota fiscal" e "Nota Fiscal" também colidem, o que confundia quem
     * digitava algo "diferente" e recebia erro sem explicação.
     */
    private function regraNomeUnico(Request $request, ?string $ignorarId = null): \Illuminate\Validation\Rules\Unique
    {
        $regra = Rule::unique('tags', 'nome')->where('empresa_id', optional($request->user())->empresa_id);

        return $ignorarId ? $regra->ignore($ignorarId) : $regra;
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nome' => ['required', 'string', 'max:120', $this->regraNomeUnico($request)],
        ], [
            'nome.unique' => 'Já existe uma tag com esse nome (maiúsculas e acentos não diferenciam).',
        ]);

        return DB::transaction(function () use ($data) {
            $tag = Tag::create(['nome' => $data['nome'], 'ativo' => true]);

            // Cria a pasta da tag em TODA obra que já existe hoje — tags
            // criadas depois de uma obra existir "chegam atrasadas" nela
            // sem isso. O sentido contrário (obra nova, tags já
            // existentes) é `ObraController::criarPastasDeTagsAtivas`.
            foreach (Obra::all() as $obra) {
                $compartilhada = PastaRaizes::compartilhada($obra);
                Pasta::firstOrCreate(
                    ['obra_id' => $obra->id, 'tag_id' => $tag->id],
                    ['parent_id' => $compartilhada->id, 'owner_user_id' => null, 'nome' => $tag->nome],
                );
            }

            return response()->json($tag, 201);
        });
    }

    public function update(Request $request, Tag $tag)
    {
        $data = $request->validate([
            'nome' => ['sometimes', 'string', 'max:120', $this->regraNomeUnico($request, $tag->id)],
            'ativo' => 'sometimes|boolean',
        ], [
            'nome.unique' => 'Já existe uma tag com esse nome (maiúsculas e acentos não diferenciam).',
        ]);

        if (array_key_exists('nome', $data) && $data['nome'] !== $tag->nome) {
            // Renomeia a pasta em TODAS as obras onde ela já existe, de
            // uma vez — é por isso que a pasta é localizada por `tag_id`
            // (FK), não pelo nome (ver migration `add_tag_id_a_pastas`).
            Pasta::where('tag_id', $tag->id)->update(['nome' => $data['nome']]);
        }

        $tag->update($data);

        return $tag;
    }

    /**
     * Excluir uma tag NÃO apaga a pasta nem os arquivos dela (decisão do
     * Lucas, 06/09/2026) — as FKs `nullOnDelete()` de `pastas.tag_id` e
     * `arquivos.tag_id` cuidam sozinhas de desvincular tudo.
     */
    public function destroy(Tag $tag)
    {
        $tag->delete();

        return response()->noContent();
    }
}
