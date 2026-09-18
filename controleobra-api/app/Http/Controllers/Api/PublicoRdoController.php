<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RdoContratanteLink;
use App\Models\RdoRegistro;

/**
 * Acesso do contratante da obra (cliente final) ao RDO: sem login, só pelo
 * token do link.
 *
 * Três garantias que não podem ser afrouxadas sem reabrir a decisão de
 * 08/09/2026 (reconfirmada em 17/09/2026):
 *   - SOMENTE LEITURA. Não há nenhuma rota de escrita aqui, e o contratante
 *     não assina nada — a assinatura é sempre da contratada.
 *   - Só RDO FINALIZADO aparece. Rascunho é trabalho em andamento da
 *     contratada e não deve ser visto por fora.
 *   - Comentário interno só aparece se marcado como visível ao contratante.
 *
 * Como não há usuário autenticado nestas rotas, o global scope de empresa não
 * filtra nada — por isso todas as consultas usam `semEscopoEmpresa()` e se
 * apoiam no token, que é o que delimita a obra.
 */
class PublicoRdoController extends Controller
{
    /** Calendário: os dias que têm RDO finalizado, para marcar no mês. */
    public function index(string $token)
    {
        $link = $this->linkValidoOuAborta($token);

        $registros = RdoRegistro::withoutGlobalScope('empresa')
            ->where('obra_id', $link->obra_id)
            ->where('status', RdoRegistro::STATUS_FINALIZADO)
            ->orderByDesc('data')
            ->get(['id', 'numero', 'data', 'assinado_em', 'assinante_nome']);

        $obra = $link->obra;

        return [
            'obra' => $obra ? [
                'nome' => $obra->obra_nome,
                'local' => $obra->local_obra,
            ] : null,
            'registros' => $registros,
        ];
    }

    /** Um RDO específico, já filtrado do que o contratante não pode ver. */
    public function show(string $token, string $rdoId)
    {
        $link = $this->linkValidoOuAborta($token);

        $rdo = RdoRegistro::withoutGlobalScope('empresa')
            ->where('obra_id', $link->obra_id)
            ->where('status', RdoRegistro::STATUS_FINALIZADO)
            ->with([
                'obra:id,obra_nome,local_obra',
                'tarefas', 'fotos', 'maoDeObra', 'equipamentos',
                'ocorrencias', 'pendencias', 'etapas', 'responsaveisPresentes',
            ])
            ->findOrFail($rdoId);

        // Carregado à parte, já filtrado: o comentário oculto da contratada
        // não pode vazar nem dentro do payload.
        $rdo->setRelation(
            'comentariosInternos',
            $rdo->comentariosInternos()->where('visivel_contratante', true)->get()
        );

        return $rdo;
    }

    private function linkValidoOuAborta(string $token): RdoContratanteLink
    {
        $link = RdoContratanteLink::withoutGlobalScope('empresa')
            ->where('token', $token)
            ->with('obra:id,obra_nome,local_obra')
            ->first();

        if (!$link || !$link->estaValido()) {
            abort(404, 'Link inválido ou expirado.');
        }

        return $link;
    }
}
