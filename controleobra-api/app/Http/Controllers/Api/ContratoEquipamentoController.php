<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AgendaEvento;
use App\Models\ContratoEquipamento;
use App\Models\ContratoEquipamentoItem;
use App\Models\ContratoEquipamentoRenovacao;
use App\Models\Obra;
use App\Models\Pagamento;
use App\Models\PagamentoItem;
use App\Models\TipoCusto;
use App\Support\DiasUteis;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Controle de contrato de equipamentos alugados (26/09/2026, pedido do
 * Lucas): lista de contratos por obra, com renovação parcial (alguns itens
 * voltam pro fornecedor, outros continuam, por um período novo — sempre
 * contado a partir do vencimento anterior). Cada criação e cada renovação
 * geram um Pagamento (`origem_tipo = 'contrato_equipamento'`) e um lembrete
 * na Agenda no dia útil anterior ao vencimento.
 *
 * `status` (ativo/vencido/encerrado) é sempre CALCULADO na leitura, nunca
 * gravado: ativo = tem item ainda com o cliente e dentro do prazo; vencido =
 * tem item ainda com o cliente e o prazo já passou; encerrado = todos os
 * itens já foram devolvidos (`encerrado_em` registra quando isso aconteceu).
 */
class ContratoEquipamentoController extends Controller
{
    private const RELACOES = ['itens', 'renovacoes'];

    public function index(Obra $obra)
    {
        return $obra->contratosEquipamentos()->with(self::RELACOES)->orderByDesc('numero')->get()
            ->map(fn (ContratoEquipamento $c) => $this->comStatus($c));
    }

    public function show(ContratoEquipamento $contratoEquipamento)
    {
        return $this->comStatus($contratoEquipamento->load(self::RELACOES));
    }

    public function store(Request $request, Obra $obra)
    {
        $data = $request->validate([
            'nome_contrato' => 'required|string|max:150',
            'fornecedor' => 'required|string|max:150',
            'data_entrega' => 'required|date',
            'periodo_quantidade' => 'required|integer|min:1',
            'periodo_unidade' => 'required|string|in:dias_corridos,dias_uteis',
            'itens' => 'required|array|min:1',
            'itens.*.descricao' => 'required|string|max:150',
            'itens.*.eap_item_id' => 'nullable|string|max:36',
            'itens.*.quantidade' => 'required|integer|min:1',
            'itens.*.valor_unitario' => 'required|numeric|min:0',
        ]);

        $usuario = $request->user();
        $dataEntrega = Carbon::parse($data['data_entrega'])->startOfDay();
        $vencimento = DiasUteis::somar($dataEntrega, (int) $data['periodo_quantidade'], $data['periodo_unidade']);

        $contrato = DB::transaction(function () use ($data, $obra, $usuario, $dataEntrega, $vencimento) {
            $contrato = ContratoEquipamento::create([
                'empresa_id' => $usuario->empresa_id,
                'obra_id' => $obra->id,
                'numero' => $this->proximoNumero($obra->id),
                'nome_contrato' => $data['nome_contrato'],
                'fornecedor' => $data['fornecedor'],
                'data_entrega' => $dataEntrega,
                'periodo_quantidade' => $data['periodo_quantidade'],
                'periodo_unidade' => $data['periodo_unidade'],
                'data_vencimento' => $vencimento,
            ]);

            foreach ($data['itens'] as $ordem => $item) {
                ContratoEquipamentoItem::create([
                    'contrato_id' => $contrato->id,
                    'descricao' => $item['descricao'],
                    'eap_item_id' => $this->eapItemValido($obra->id, $item['eap_item_id'] ?? null),
                    'quantidade' => $item['quantidade'],
                    'valor_unitario' => $item['valor_unitario'],
                    'ordem' => $ordem,
                ]);
            }

            $pagamento = $this->gerarPagamento(
                $obra,
                $contrato,
                $contrato->itens()->get(),
                "Contrato de equipamento nº {$contrato->numero} — {$contrato->nome_contrato} ({$contrato->fornecedor})",
            );
            $contrato->update(['pagamento_inicial_id' => $pagamento->id]);

            $evento = $this->criarLembrete($contrato, $usuario);
            $contrato->update(['agenda_evento_id' => $evento->id]);

            return $contrato;
        });

        return response()->json($this->comStatus($contrato->fresh(self::RELACOES)), 201);
    }

    /** Só os dados de identificação — período/itens só mudam através de uma renovação. */
    public function update(Request $request, ContratoEquipamento $contratoEquipamento)
    {
        $data = $request->validate([
            'nome_contrato' => 'required|string|max:150',
            'fornecedor' => 'required|string|max:150',
        ]);

        $contratoEquipamento->update($data);

        return $this->comStatus($contratoEquipamento->fresh(self::RELACOES));
    }

    /**
     * Renovação — pode ser parcial (`itens_devolvidos`: alguns voltam pro
     * fornecedor, os demais continuam, possivelmente com quantidade/valor
     * novos) e por um período diferente do inicial, sempre contado a partir
     * do vencimento ATUAL (nunca da data de entrega). Gera um pagamento novo
     * com o valor e os itens que CONTINUAM (os devolvidos saem da conta) e
     * troca o lembrete da Agenda pelo do novo vencimento — a não ser que
     * todos os itens tenham sido devolvidos, aí o contrato fica encerrado e
     * sem lembrete.
     */
    public function renovar(Request $request, ContratoEquipamento $contratoEquipamento)
    {
        $data = $request->validate([
            'periodo_quantidade' => 'required|integer|min:1',
            'periodo_unidade' => 'required|string|in:dias_corridos,dias_uteis',
            'itens_devolvidos' => 'nullable|array',
            'itens_devolvidos.*' => 'string|max:36',
            'itens' => 'nullable|array',
            'itens.*.id' => 'required|string|max:36',
            'itens.*.eap_item_id' => 'nullable|string|max:36',
            'itens.*.quantidade' => 'required|integer|min:1',
            'itens.*.valor_unitario' => 'required|numeric|min:0',
        ]);

        if ($contratoEquipamento->encerrado_em) {
            return response()->json(['message' => 'Este contrato já foi encerrado — todos os itens já tinham sido devolvidos.'], 422);
        }

        $usuario = $request->user();
        $dataRenovacao = $contratoEquipamento->data_vencimento->copy();
        $novoVencimento = DiasUteis::somar($dataRenovacao, (int) $data['periodo_quantidade'], $data['periodo_unidade']);
        $devolvidos = collect($data['itens_devolvidos'] ?? []);

        $contrato = DB::transaction(function () use ($data, $contratoEquipamento, $usuario, $dataRenovacao, $novoVencimento, $devolvidos) {
            // Os ids vêm do cliente — só mexe em item que é mesmo deste
            // contrato e ainda não tinha sido devolvido antes.
            $itensAtivosAntes = $contratoEquipamento->itens()->whereNull('devolvido_em')->get()->keyBy('id');

            foreach ($data['itens'] ?? [] as $item) {
                $modelo = $itensAtivosAntes->get($item['id']);
                $modelo?->update([
                    'quantidade' => $item['quantidade'],
                    'valor_unitario' => $item['valor_unitario'],
                    'eap_item_id' => array_key_exists('eap_item_id', $item)
                        ? $this->eapItemValido($contratoEquipamento->obra_id, $item['eap_item_id'])
                        : $modelo->eap_item_id,
                ]);
            }

            foreach ($devolvidos as $itemId) {
                $itensAtivosAntes->get($itemId)?->update(['devolvido_em' => $dataRenovacao]);
            }

            $itensAtivosDepois = $contratoEquipamento->itens()->whereNull('devolvido_em')->get();
            $valorTotal = $itensAtivosDepois->sum(fn (ContratoEquipamentoItem $i) => $i->quantidade * $i->valor_unitario);

            $renovacao = ContratoEquipamentoRenovacao::create([
                'contrato_id' => $contratoEquipamento->id,
                'data_renovacao' => $dataRenovacao,
                'periodo_quantidade' => $data['periodo_quantidade'],
                'periodo_unidade' => $data['periodo_unidade'],
                'data_vencimento_nova' => $novoVencimento,
                'valor_total' => $valorTotal,
            ]);

            if ($itensAtivosDepois->isNotEmpty()) {
                $pagamento = $this->gerarPagamento(
                    $contratoEquipamento->obra,
                    $contratoEquipamento,
                    $itensAtivosDepois,
                    "Renovação — Contrato de equipamento nº {$contratoEquipamento->numero} — {$contratoEquipamento->nome_contrato} ({$contratoEquipamento->fornecedor})",
                );
                $renovacao->update(['pagamento_id' => $pagamento->id]);
            }

            $contratoEquipamento->update([
                'periodo_quantidade' => $data['periodo_quantidade'],
                'periodo_unidade' => $data['periodo_unidade'],
                'data_vencimento' => $novoVencimento,
            ]);

            if ($itensAtivosDepois->isEmpty()) {
                // Devolveu tudo nesta renovação — contrato encerrado, sem novo lembrete.
                $contratoEquipamento->update(['encerrado_em' => now()]);
                if ($contratoEquipamento->agenda_evento_id) {
                    AgendaEvento::where('id', $contratoEquipamento->agenda_evento_id)->delete();
                    $contratoEquipamento->update(['agenda_evento_id' => null]);
                }
            } else {
                $evento = $this->criarLembrete($contratoEquipamento, $usuario);
                $contratoEquipamento->update(['agenda_evento_id' => $evento->id]);
            }

            return $contratoEquipamento;
        });

        return $this->comStatus($contrato->fresh(self::RELACOES));
    }

    public function destroy(ContratoEquipamento $contratoEquipamento)
    {
        if ($contratoEquipamento->agenda_evento_id) {
            AgendaEvento::where('id', $contratoEquipamento->agenda_evento_id)->delete();
        }
        $contratoEquipamento->delete();

        return response()->noContent();
    }

    // ------------------------------------------------------------------
    // Internos
    // ------------------------------------------------------------------

    private function proximoNumero(string $obraId): int
    {
        return (int) ContratoEquipamento::where('obra_id', $obraId)->max('numero') + 1;
    }

    /**
     * @param  Collection<int, ContratoEquipamentoItem>  $itens
     */
    private function gerarPagamento(Obra $obra, ContratoEquipamento $contrato, Collection $itens, string $descricao): Pagamento
    {
        $tipoEquipamentoId = TipoCusto::where('chave', 'equipamento')->value('id');
        $valorTotal = $itens->sum(fn (ContratoEquipamentoItem $i) => $i->quantidade * $i->valor_unitario);

        $pagamento = Pagamento::create([
            'numero_pagamento' => $this->proximoNumeroPagamento($obra->id),
            'obra_id' => $obra->id,
            'obra_number' => $obra->map_number ?? '',
            'data_solicitacao' => now(),
            'fornecedor' => $contrato->fornecedor,
            'descricao' => $descricao,
            'valor_total' => $valorTotal,
            'origem_tipo' => 'contrato_equipamento',
            'origem_ref_id' => $contrato->id,
            'status' => 'pendente',
        ]);

        foreach ($itens->values() as $ordem => $item) {
            PagamentoItem::create([
                'pagamento_id' => $pagamento->id,
                'ordem' => $ordem,
                'descricao' => "{$item->descricao} (x{$item->quantidade})",
                'tipo_custo_id' => $tipoEquipamentoId,
                'eap_item_id' => $item->eap_item_id,
                'valor' => $item->quantidade * $item->valor_unitario,
            ]);
        }

        return $pagamento;
    }

    /** Mesmo cuidado de sempre: o id vem do cliente, confirma que é um item da EAP DESTA obra antes de gravar o vínculo. */
    private function eapItemValido(string $obraId, ?string $eapItemId): ?string
    {
        if (!$eapItemId) {
            return null;
        }

        return \App\Models\EapItem::where('obra_id', $obraId)->where('id', $eapItemId)->value('id');
    }

    /** Mesmo critério de `gerarNumeroPagamento()` do frontend (`pagamentos-calc.ts`) — "PG-0001", por obra. */
    private function proximoNumeroPagamento(string $obraId): string
    {
        $maior = Pagamento::where('obra_id', $obraId)->pluck('numero_pagamento')
            ->reduce(function (int $max, ?string $numero) {
                preg_match('/(\d+)$/', (string) $numero, $m);

                return max($max, isset($m[1]) ? (int) $m[1] : 0);
            }, 0);

        return 'PG-'.str_pad((string) ($maior + 1), 4, '0', STR_PAD_LEFT);
    }

    /**
     * Cria o compromisso da Agenda que avisa que o equipamento está prestes
     * a vencer, no dia útil ANTERIOR ao vencimento (pedido explícito do
     * Lucas). Chamado sempre que o vencimento muda (criação ou renovação) —
     * quem chamou já apaga o lembrete anterior antes, se havia um.
     */
    private function criarLembrete(ContratoEquipamento $contrato, $usuario): AgendaEvento
    {
        $aviso = DiasUteis::diaUtilAnterior($contrato->data_vencimento);

        return AgendaEvento::create([
            'empresa_id' => $usuario->empresa_id,
            'obra_id' => $contrato->obra_id,
            'criado_por_id' => $usuario->id,
            'titulo' => "Vencimento do contrato de equipamento nº {$contrato->numero} — {$contrato->nome_contrato}",
            'descricao' => "Contrato com {$contrato->fornecedor} vence em {$contrato->data_vencimento->format('d/m/Y')}.",
            'dia_inteiro' => true,
            'inicio' => $aviso->format('Y-m-d').' 00:00:00',
            'fim' => $aviso->format('Y-m-d').' 23:59:00',
        ]);
    }

    private function comStatus(ContratoEquipamento $contrato): ContratoEquipamento
    {
        $itensAtivos = $contrato->itens->whereNull('devolvido_em');
        $hoje = now()->startOfDay();

        $contrato->setAttribute('itens_ativos_qtd', $itensAtivos->count());
        $contrato->setAttribute('valor_atual', $itensAtivos->sum(fn (ContratoEquipamentoItem $i) => $i->quantidade * $i->valor_unitario));
        $contrato->setAttribute('renovacoes_qtd', $contrato->renovacoes->count());

        if ($contrato->encerrado_em || $itensAtivos->isEmpty()) {
            $status = 'encerrado';
        } elseif ($hoje->gt($contrato->data_vencimento)) {
            $status = 'vencido';
        } else {
            $status = 'ativo';
        }
        $contrato->setAttribute('status', $status);

        return $contrato;
    }
}
