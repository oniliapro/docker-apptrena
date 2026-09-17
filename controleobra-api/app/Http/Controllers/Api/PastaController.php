<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\AutorizaAcessoAPasta;
use App\Http\Controllers\Controller;
use App\Models\Arquivo;
use App\Models\Obra;
use App\Models\Pasta;
use App\Services\PastaRaizes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * CRUD de pastas do minissistema de arquivos (aba "Arquivos Anexados" de
 * uma obra). Toda obra tem, por usuário, duas pastas-raiz automáticas
 * ("Arquivos próprios" — privada — e "Arquivos compartilhados" — visível a
 * qualquer usuário da empresa), criadas sob demanda na primeira visita
 * (raizes()). Qualquer subpasta herda o owner_user_id do pai, então a
 * privacidade cai em cascata sem precisar percorrer ancestrais a cada
 * leitura.
 */
class PastaController extends Controller
{
    use AutorizaAcessoAPasta;

    public function raizes(Obra $obra)
    {
        return [
            'propria' => PastaRaizes::propria($obra, auth()->id()),
            'compartilhada' => PastaRaizes::compartilhada($obra),
        ];
    }

    public function show(string $id)
    {
        $pasta = $this->encontrarPastaAutorizada($id);

        // subpastas()->get()/arquivos()->get() (não $pasta->subpastas), pra
        // não anexar a relação carregada ao próprio $pasta — se anexasse,
        // a serialização de $pasta (aqui e dentro de breadcrumb()) incluiria
        // essas listas de novo, triplicando o payload.
        return [
            'pasta' => $pasta,
            'breadcrumb' => $this->breadcrumb($pasta),
            'subpastas' => $pasta->subpastas()->get(),
            'arquivos' => $pasta->arquivos()->get(),
        ];
    }

    public function store(Request $request, string $id)
    {
        $pai = $this->encontrarPastaAutorizada($id);

        $data = $request->validate([
            'nome' => 'required|string|max:180',
        ]);

        return Pasta::create([
            'obra_id' => $pai->obra_id,
            'parent_id' => $pai->id,
            'owner_user_id' => $pai->owner_user_id,
            'nome' => $data['nome'],
        ]);
    }

    public function update(Request $request, string $id)
    {
        $pasta = $this->encontrarPastaAutorizada($id);

        if ($pasta->ehRaiz()) {
            abort(403, 'As pastas padrão não podem ser renomeadas ou movidas.');
        }

        if ($pasta->ehDeTag()) {
            abort(403, 'Esta pasta pertence a uma tag — gerencie o nome dela em Configurações.');
        }

        $data = $request->validate([
            'nome' => 'sometimes|string|max:180',
            'parent_id' => 'sometimes|string',
        ]);

        if (array_key_exists('parent_id', $data)) {
            $novoPai = $this->encontrarPastaAutorizada($data['parent_id']);

            if ($novoPai->obra_id !== $pasta->obra_id || $novoPai->owner_user_id !== $pasta->owner_user_id) {
                abort(422, 'Não é possível mover a pasta para fora da sua obra ou trocar entre própria/compartilhada.');
            }

            if ($novoPai->id === $pasta->id || $this->ehDescendente($pasta, $novoPai)) {
                abort(422, 'Não é possível mover uma pasta para dentro dela mesma.');
            }

            $pasta->parent_id = $novoPai->id;
        }

        if (array_key_exists('nome', $data)) {
            $pasta->nome = $data['nome'];
        }

        $pasta->save();

        return $pasta;
    }

    public function destroy(string $id)
    {
        $pasta = $this->encontrarPastaAutorizada($id);

        if ($pasta->ehRaiz()) {
            abort(403, 'As pastas padrão não podem ser excluídas.');
        }

        if ($pasta->ehDeTag()) {
            abort(403, 'Esta pasta pertence a uma tag — exclua a tag em Configurações (os arquivos não são apagados).');
        }

        DB::transaction(function () use ($pasta) {
            foreach ($this->arquivosDescendentes($pasta) as $arquivo) {
                Storage::disk('local')->delete(array_filter([$arquivo->caminho, $arquivo->caminho_thumbnail]));
            }
            // FKs em cascade cuidam de apagar subpastas e arquivos no banco.
            $pasta->delete();
        });

        return response()->noContent();
    }

    private function breadcrumb(Pasta $pasta): array
    {
        $caminho = [];
        $atual = $pasta;
        while ($atual !== null) {
            array_unshift($caminho, $atual);
            $atual = $atual->parent_id ? Pasta::find($atual->parent_id) : null;
        }

        return $caminho;
    }

    private function ehDescendente(Pasta $possivelAncestral, Pasta $pasta): bool
    {
        $atual = $pasta;
        while ($atual->parent_id !== null) {
            if ($atual->parent_id === $possivelAncestral->id) {
                return true;
            }
            $atual = Pasta::find($atual->parent_id);
            if (!$atual) {
                return false;
            }
        }

        return false;
    }

    /** @return \Illuminate\Support\Collection<int, Arquivo> */
    private function arquivosDescendentes(Pasta $pasta)
    {
        $arquivos = $pasta->arquivos()->get();
        foreach ($pasta->subpastas()->get() as $subpasta) {
            $arquivos = $arquivos->concat($this->arquivosDescendentes($subpasta));
        }

        return $arquivos;
    }
}
