<?php

namespace App\Services;

use App\Models\Arquivo;
use App\Models\Pagamento;
use App\Models\Recebimento;
use App\Models\Tag;
use Illuminate\Support\Collection;

/**
 * Mantém o nome dos anexos de Pagamento/Recebimento em sincronia com a
 * tag, a sequência e o número do lançamento (06/09/2026, pedido do
 * Lucas):
 *
 * - Excluir um anexo fecha o buraco na sequência dos que sobraram da
 *   MESMA tag no MESMO lançamento (`aposExcluir`) — chamado por
 *   `ArquivoController::destroy` sempre que o `Arquivo` apagado era um
 *   anexo (`tag_id`/`origem_tipo`/`origem_id` preenchidos), não importa
 *   se a exclusão veio da tela de Pagamentos ou da aba Arquivos comum.
 * - Trocar o número de um Pagamento/Recebimento renomeia TODOS os
 *   anexos dele, de qualquer tag (`aposMudarNumero`) — chamado por
 *   `PagamentoController`/`RecebimentoController` quando `numero_
 *   pagamento`/`numero_recebimento` muda numa edição.
 *
 * `nome()` é a MESMA fórmula usada em `AnexoController::criar()` na hora
 * de gerar o nome pela primeira vez — centralizada aqui pra nunca haver
 * duas fórmulas divergentes.
 */
class AnexoNomeador
{
    /** Sequencial padronizado com 3 algarismos (001, 002... — pedido do Lucas, 06/09/2026), não recalcula nomes já gerados antes desta mudança. */
    public static function nome(string $tagNome, int $sequencial, string $obraNome, string $numero, string $extensao): string
    {
        $sequencialFormatado = str_pad((string) $sequencial, 3, '0', STR_PAD_LEFT);
        return "{$tagNome} {$sequencialFormatado} - {$obraNome} - {$numero}.{$extensao}";
    }

    public static function aposExcluir(string $tagId, string $origemTipo, string $origemId): void
    {
        $tag = Tag::find($tagId);
        if (!$tag) return; // tag já excluída — sem nome pra usar, não tem o que renomear

        [$obraNome, $numero] = self::resolverObraENumero($origemTipo, $origemId);
        if ($obraNome === null) return;

        $restantes = Arquivo::where('tag_id', $tagId)
            ->where('origem_tipo', $origemTipo)
            ->where('origem_id', $origemId)
            ->orderBy('created_at')
            ->get();

        self::renomearGrupo($restantes, $tag->nome, $obraNome, $numero);
    }

    public static function aposMudarNumero(string $origemTipo, string $origemId, string $numeroNovo): void
    {
        [$obraNome] = self::resolverObraENumero($origemTipo, $origemId);
        if ($obraNome === null) return;

        $porTag = Arquivo::where('origem_tipo', $origemTipo)
            ->where('origem_id', $origemId)
            ->whereNotNull('tag_id')
            ->orderBy('created_at')
            ->get()
            ->groupBy('tag_id');

        foreach ($porTag as $tagId => $doGrupo) {
            $tag = Tag::find($tagId);
            if (!$tag) continue;
            self::renomearGrupo($doGrupo->values(), $tag->nome, $obraNome, $numeroNovo);
        }
    }

    /** @return array{0: ?string, 1: ?string} [obraNome, numero] — ambos null se o lançamento não existe mais. */
    private static function resolverObraENumero(string $origemTipo, string $origemId): array
    {
        if ($origemTipo === 'pagamento') {
            $pagamento = Pagamento::with('obra')->find($origemId);
            return $pagamento ? [$pagamento->obra->obra_nome ?? '', $pagamento->numero_pagamento] : [null, null];
        }

        if ($origemTipo === 'recebimento') {
            $recebimento = Recebimento::with('obra')->find($origemId);
            return $recebimento ? [$recebimento->obra->obra_nome ?? '', $recebimento->numero_recebimento] : [null, null];
        }

        return [null, null];
    }

    /** @param Collection<int, Arquivo> $arquivos ordenados — a posição na lista vira o sequencial (1-based). */
    private static function renomearGrupo(Collection $arquivos, string $tagNome, string $obraNome, string $numero): void
    {
        foreach ($arquivos->values() as $indice => $arquivo) {
            $novoNome = self::nome($tagNome, $indice + 1, $obraNome, $numero, $arquivo->extensao);
            if ($arquivo->nome_original !== $novoNome) {
                $arquivo->update(['nome_original' => $novoNome]);
            }
        }
    }
}
