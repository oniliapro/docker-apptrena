<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DiarioRegistro;
use App\Models\Obra;
use App\Models\ObraContratanteLink;
use Illuminate\Http\Request;

/**
 * Acesso PÚBLICO (sem login, sem Sanctum) do contratante da obra
 * (cliente final) ao Diário de Obra — autorizado só pelo token do
 * link (08/09/2026). Sempre somente leitura: não existe nenhum método
 * de escrita aqui, de propósito — o contratante não assina nem
 * escreve nada (ver especificação, decisão de 08/09/2026).
 *
 * Só mostra lançamentos com `status = finalizado` — rascunhos não
 * assinados pela contratada nunca aparecem pro contratante.
 * Comentários internos só aparecem quando `visivel_contratante = true`.
 *
 * Padrão de UI de referência (calendário → lista do dia → detalhe) veio
 * do relato do Lucas sobre o sistema anterior dele — ver especificação.
 */
class PublicoDiarioController extends Controller
{
    private function resolverLink(string $token): ObraContratanteLink
    {
        $link = ObraContratanteLink::where('token', $token)->first();

        if (!$link) {
            abort(404, 'Link inválido.');
        }
        if (!$link->estaValido()) {
            abort(410, 'Este link não está mais disponível.');
        }

        return $link;
    }

    /** Dados da obra + datas (calendário) que têm lançamento finalizado. */
    public function obra(string $token)
    {
        $link = $this->resolverLink($token);
        $obra = Obra::find($link->obra_id);
        if (!$obra) {
            abort(404, 'Obra não encontrada.');
        }

        $datas = DiarioRegistro::where('obra_id', $obra->id)
            ->where('status', DiarioRegistro::STATUS_FINALIZADO)
            ->orderBy('data')
            ->pluck('data')
            ->map(fn ($data) => $data->toDateString())
            ->unique()
            ->values();

        return [
            'obra' => [
                'nome' => $obra->obra_nome,
                'cliente' => $obra->cliente,
                'local' => $obra->local_obra,
            ],
            'datas_com_lancamento' => $datas,
        ];
    }

    /** Lançamentos finalizados de um dia específico (pode haver mais de um). */
    public function dia(string $token, string $data)
    {
        $link = $this->resolverLink($token);

        return DiarioRegistro::where('obra_id', $link->obra_id)
            ->where('status', DiarioRegistro::STATUS_FINALIZADO)
            ->whereDate('data', $data)
            ->with('assinadoPor:id,name')
            ->orderBy('created_at')
            ->get(['id', 'data', 'titulo', 'clima', 'assinado_em', 'assinado_por_user_id', 'created_at']);
    }

    /** Detalhe completo de um lançamento — só o que é permitido ao contratante ver. */
    public function lancamento(Request $request, string $token, string $registroId)
    {
        $link = $this->resolverLink($token);

        $registro = DiarioRegistro::where('id', $registroId)
            ->where('obra_id', $link->obra_id)
            ->where('status', DiarioRegistro::STATUS_FINALIZADO)
            ->with([
                'fotos', 'assinadoPor:id,name',
                'responsaveisPresentes', 'equipamentosUso.equipamento', 'ocorrencias', 'pendencias',
            ])
            ->first();

        if (!$registro) {
            abort(404, 'Lançamento não encontrado.');
        }

        $comentarios = $registro->comentariosInternos()
            ->where('visivel_contratante', true)
            ->get(['id', 'texto', 'created_at']);

        return [
            'registro' => $registro,
            'comentarios' => $comentarios,
        ];
    }
}
