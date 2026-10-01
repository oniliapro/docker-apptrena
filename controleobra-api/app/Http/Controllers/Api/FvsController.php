<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FvsFoto;
use App\Models\FvsPreenchimento;
use App\Models\FvsPreenchimentoItem;
use App\Models\Obra;
use App\Models\RdoPendencia;
use App\Support\ValidacaoMidia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Ficha de Verificação de Serviço PREENCHIDA (F10) — a criação/cópia em
 * branco acontece sozinha em `RdoController` (ao salvar um RDO com etapa
 * ligada a um item com ficha vinculada, e ao criar o próximo RDO da obra
 * depois de uma reprovação); este controller só cuida do preenchimento em
 * si (itens, fotos) e da listagem "banco de verificações da obra".
 */
class FvsController extends Controller
{
    private const RELACOES = ['itens.fotos', 'eapItem:id,codigo_eap,descricao', 'rdo:id,numero,data'];

    /** "Banco de verificações da obra" (plano, D4) — todas as fichas de todos os RDOs. */
    public function porObra(Obra $obra)
    {
        return FvsPreenchimento::where('obra_id', $obra->id)
            ->with(self::RELACOES)
            ->orderByDesc('numero')
            ->orderByDesc('revisao')
            ->get();
    }

    /**
     * Grava os itens respondidos + observação geral. O status é sempre
     * CALCULADO aqui (nunca vem do cliente): qualquer item "não conforme" =
     * reprovada; todos respondidos (conforme/não se aplica) = aprovada;
     * senão, continua pendente. Na primeira vez que vira reprovada, abre uma
     * pendência no RDO — `pendencia_id` evita abrir duas.
     */
    public function salvar(Request $request, FvsPreenchimento $fvsPreenchimento)
    {
        $data = $request->validate([
            'observacao_geral' => 'nullable|string',
            'itens' => 'required|array|min:1',
            'itens.*.id' => 'required|string|max:36',
            'itens.*.resultado' => 'nullable|string|in:'.implode(',', FvsPreenchimentoItem::RESULTADOS),
            'itens.*.observacao' => 'nullable|string',
        ]);

        $eraReprovada = $fvsPreenchimento->status === 'reprovada';

        DB::transaction(function () use ($data, $fvsPreenchimento) {
            $idsValidos = $fvsPreenchimento->itens()->pluck('id')->all();

            foreach ($data['itens'] as $item) {
                if (!in_array($item['id'], $idsValidos, true)) {
                    continue; // item de outra ficha — ignora, não deixa vazar entre fichas
                }
                FvsPreenchimentoItem::where('id', $item['id'])->update([
                    'resultado' => $item['resultado'] ?? null,
                    'observacao' => $item['observacao'] ?? null,
                ]);
            }

            $itensAtualizados = $fvsPreenchimento->itens()->get();
            $status = 'pendente';
            if ($itensAtualizados->contains('resultado', 'nao_conforme')) {
                $status = 'reprovada';
            } elseif ($itensAtualizados->every(fn ($i) => in_array($i->resultado, ['conforme', 'nao_se_aplica'], true))) {
                $status = 'aprovada';
            }

            $fvsPreenchimento->update([
                'observacao_geral' => $data['observacao_geral'] ?? null,
                'status' => $status,
                'preenchido_em' => now(),
            ]);
        });

        $fvsPreenchimento->refresh();

        if ($fvsPreenchimento->status === 'reprovada' && !$eraReprovada && !$fvsPreenchimento->pendencia_id) {
            $ultimaOrdem = (int) RdoPendencia::where('rdo_id', $fvsPreenchimento->rdo_id)->max('ordem');
            $pendencia = RdoPendencia::create([
                'rdo_id' => $fvsPreenchimento->rdo_id,
                'descricao' => "Ficha {$fvsPreenchimento->codigo} ({$fvsPreenchimento->modelo_nome_snapshot}) reprovada — verificar item(ns) não conforme(s).",
                'status' => 'aberta',
                'ordem' => $ultimaOrdem + 1,
            ]);
            $fvsPreenchimento->update(['pendencia_id' => $pendencia->id]);
        }

        return $fvsPreenchimento->fresh(self::RELACOES);
    }

    /**
     * `FvsPreenchimentoItem`/`FvsFoto` não usam `PertenceAEmpresa` (a
     * isolação normalmente vem do pai) — mas aqui elas SÃO o parâmetro da
     * rota, então o route-model-binding as resolve sem filtro nenhum de
     * empresa. Confirma a posse manualmente antes de qualquer coisa —
     * mesmo cuidado de `Obra::find()` no resto do RDO.
     */
    private function confirmarPosse(FvsPreenchimentoItem $item, Request $request): void
    {
        if ($item->preenchimento?->empresa_id !== $request->user()->empresa_id) {
            abort(404);
        }
    }

    public function enviarFoto(Request $request, FvsPreenchimentoItem $item)
    {
        $this->confirmarPosse($item, $request);
        $request->validate(['foto' => 'required|' . ValidacaoMidia::IMAGEM]);

        $ordem = (int) $item->fotos()->max('ordem') + 1;
        $foto = FvsFoto::create([
            'fvs_preenchimento_item_id' => $item->id,
            'caminho' => $request->file('foto')->store('fvs', 'public'),
            'ordem' => $ordem,
        ]);

        return response()->json($foto, 201);
    }

    public function removerFoto(Request $request, FvsFoto $foto)
    {
        if ($foto->item?->preenchimento?->empresa_id !== $request->user()->empresa_id) {
            abort(404);
        }

        Storage::disk('public')->delete($foto->caminho);
        $foto->delete();

        return response()->noContent();
    }
}
