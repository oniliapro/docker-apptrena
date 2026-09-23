<?php

namespace App\Console\Commands;

use App\Models\DiarioRegistro;
use App\Models\EquipamentoCatalogo;
use App\Models\RdoComentarioInterno;
use App\Models\RdoEquipamento;
use App\Models\RdoFoto;
use App\Models\RdoMaoDeObra;
use App\Models\RdoOcorrencia;
use App\Models\RdoPendencia;
use App\Models\RdoRegistro;
use App\Models\RdoResponsavelPresente;
use App\Models\RdoTarefa;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Copia os registros do Diário de obra antigo para o RDO (F8, 22/09/2026) —
 * o Diário antigo é aposentado (esconde do menu, ver `app-shell.ts`), mas as
 * tabelas `diario_*` e os arquivos delas NÃO são apagados nem tocados; os
 * links públicos antigos (`/publico/diario/{token}`) só deixam de abrir
 * porque a ROTA foi removida — os dados continuam no banco.
 *
 * Idempotente: cada RDO criado por este comando grava o id do registro
 * antigo em `origem_diario_id`; rodar de novo pula o que já migrou. Sempre
 * `--dry-run` primeiro — mostra o que faria sem gravar nada.
 *
 * Diferenças de modelo, e a decisão tomada pra cada uma (nenhuma perde
 * informação — o que não tem campo próprio no RDO vai para as
 * "Observações gerais do dia"):
 *  - O Diário antigo tinha "Título" + "Descrição" livres, um por dia; o RDO
 *    não tem esses campos — tem TAREFAS numeradas. A descrição vira a
 *    tarefa nº 1 do RDO (só se não estiver vazia); o título (se diferente
 *    da descrição) some para as observações.
 *  - "Clima" era um texto livre; o RDO tem um select fixo (claro/nublado/
 *    chuva/temporal/impraticável) para cada turno. Quando o texto antigo
 *    bate com uma dessas opções (sem diferenciar maiúscula/acento), vira o
 *    clima dos 3 turnos; senão os 3 turnos ficam em branco e o texto
 *    original vai para as observações.
 *  - "Quantidade de operários" (um número só) vira UMA linha de mão de obra
 *    (categoria "direta", função "Mão de obra (Diário antigo)").
 *  - Equipamento usado referenciava o catálogo ANTIGO
 *    (`equipamentos_catalogo`) — o RDO tem um catálogo PRÓPRIO
 *    (`rdo_equipamentos_catalogo`), com ids diferentes. Em vez de tentar
 *    casar os dois catálogos, o nome do equipamento antigo vira texto livre
 *    na descrição do equipamento do RDO (sem vínculo com o catálogo novo).
 *  - "Responsável presente" tinha uma flag `presente` (podia registrar
 *    alguém como AUSENTE); o RDO só lista quem esteve presente — as linhas
 *    com `presente = false` não são migradas.
 *  - Fotos: o RDO usa o MESMO disco (`storage/app/public`), só que numa
 *    pasta diferente (`rdo/` em vez de `diario/`) — o caminho antigo é
 *    reaproveitado tal como está, os arquivos não são copiados nem movidos.
 *  - `numero` (sequencial por obra) é recalculado do zero para os RDOs
 *    migrados de cada obra, em ordem de data — não tenta preservar nenhuma
 *    numeração do Diário antigo (ele não tinha).
 */
class MigrarDiarioParaRdo extends Command
{
    protected $signature = 'diario:migrar-para-rdo {--dry-run : Só mostra o que seria migrado}';

    protected $description = 'Copia os registros do Diário de obra antigo para o RDO, sem apagar nada do Diário antigo';

    private const CAMPOS_CLIMA = ['claro', 'nublado', 'chuva', 'temporal', 'impraticavel'];

    public function handle(): int
    {
        $seco = (bool) $this->option('dry-run');

        $registros = DiarioRegistro::withoutGlobalScopes()
            ->with([
                'fotos', 'responsaveisPresentes', 'equipamentosUso.equipamento',
                'ocorrencias', 'pendencias', 'comentariosInternos', 'assinadoPor',
            ])
            ->orderBy('obra_id')
            ->orderBy('data')
            ->get();

        if ($registros->isEmpty()) {
            $this->info('Nenhum registro no Diário antigo — nada para migrar.');

            return self::SUCCESS;
        }

        $jaMigrados = RdoRegistro::withoutGlobalScopes()
            ->whereNotNull('origem_diario_id')
            ->pluck('origem_diario_id')
            ->all();

        // `numero` é sequencial por obra: parte do maior número já existente
        // (RDOs lançados direto, sem vir do Diário antigo) e vai subindo
        // conforme migra, na ordem cronológica dos registros antigos.
        $numeroAtualPorObra = RdoRegistro::withoutGlobalScopes()
            ->selectRaw('obra_id, MAX(numero) as maior')
            ->groupBy('obra_id')
            ->pluck('maior', 'obra_id');

        $migrados = 0;
        $pulados = 0;
        $falhas = 0;

        foreach ($registros as $antigo) {
            if (in_array($antigo->id, $jaMigrados, true)) {
                $pulados++;
                continue;
            }

            $numero = ($numeroAtualPorObra[$antigo->obra_id] ?? 0) + 1;
            $rotulo = sprintf('Diário %s (obra %s, %s)', $antigo->id, $antigo->obra_id, $antigo->data?->format('d/m/Y'));

            if ($seco) {
                $this->line("[simulação] {$rotulo} -> RDO nº {$numero}");
                $numeroAtualPorObra[$antigo->obra_id] = $numero;
                $migrados++;
                continue;
            }

            try {
                DB::transaction(fn () => $this->migrarUm($antigo, $numero));
                $numeroAtualPorObra[$antigo->obra_id] = $numero;
                $this->line("Migrado: {$rotulo} -> RDO nº {$numero}");
                $migrados++;
            } catch (Throwable $e) {
                $this->error("Falhou: {$rotulo} — {$e->getMessage()}");
                $falhas++;
            }
        }

        $this->info(($seco ? 'Simulação: ' : '')."{$migrados} migrado(s), {$pulados} já migrado(s) antes, {$falhas} falha(s).");

        return $falhas > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function migrarUm(DiarioRegistro $antigo, int $numero): void
    {
        $clima = $this->normalizarClima($antigo->clima);
        $observacoes = $this->montarObservacoes($antigo, $clima);

        $novo = RdoRegistro::withoutGlobalScopes()->create([
            'id' => (string) Str::uuid(),
            'origem_diario_id' => $antigo->id,
            'empresa_id' => $antigo->empresa_id,
            'obra_id' => $antigo->obra_id,
            'numero' => $numero,
            'data' => $antigo->data,
            'clima_manha' => $clima,
            'clima_tarde' => $clima,
            'clima_noite' => $clima,
            'impacto_cronograma' => $antigo->impacto_cronograma,
            'observacoes' => $observacoes ?: null,
            'status' => $antigo->status,
            'autor_user_id' => $antigo->autor_user_id,
            'assinado_em' => $antigo->assinado_em,
            'assinado_por_user_id' => $antigo->assinado_por_user_id,
            'assinante_nome' => $antigo->estaFinalizado() ? $this->nomeDoAssinante($antigo) : null,
            'assinante_crea' => null,
        ]);

        if (trim((string) $antigo->descricao) !== '') {
            RdoTarefa::create([
                'id' => (string) Str::uuid(),
                'rdo_id' => $novo->id,
                'ordem' => 1,
                'descricao' => trim((string) $antigo->descricao),
            ]);
        }

        if ((int) $antigo->quantidade_operarios > 0) {
            RdoMaoDeObra::create([
                'id' => (string) Str::uuid(),
                'rdo_id' => $novo->id,
                'ordem' => 0,
                'categoria' => 'direta',
                'funcao' => 'Mão de obra (Diário antigo)',
                'quantidade' => (int) $antigo->quantidade_operarios,
            ]);
        }

        foreach ($antigo->fotos as $foto) {
            RdoFoto::create([
                'id' => (string) Str::uuid(),
                'rdo_id' => $novo->id,
                'tarefa_id' => null,
                'tipo' => 'foto',
                'caminho' => $foto->caminho,
                'ordem' => $foto->ordem,
            ]);
        }

        foreach ($antigo->responsaveisPresentes as $ordem => $responsavel) {
            if (!$responsavel->presente) {
                continue;
            }
            RdoResponsavelPresente::create([
                'id' => (string) Str::uuid(),
                'rdo_id' => $novo->id,
                'ordem' => $ordem,
                'nome' => $responsavel->nome,
                'empresa' => $responsavel->empresa,
                'funcao' => $responsavel->funcao,
                'contrato_referencia' => $responsavel->contrato_referencia,
            ]);
        }

        foreach ($antigo->equipamentosUso as $ordem => $uso) {
            RdoEquipamento::create([
                'id' => (string) Str::uuid(),
                'rdo_id' => $novo->id,
                'ordem' => $ordem,
                'equipamento_id' => null,
                'descricao' => optional($uso->equipamento)->nome ?? 'Equipamento (Diário antigo)',
                'quantidade' => $uso->quantidade,
            ]);
        }

        foreach ($antigo->ocorrencias as $ordem => $ocorrencia) {
            RdoOcorrencia::create([
                'id' => (string) Str::uuid(),
                'rdo_id' => $novo->id,
                'ordem' => $ordem,
                'tipo' => $ocorrencia->tipo,
                'descricao' => $ocorrencia->descricao,
                'responsavel' => $ocorrencia->responsavel,
                'motivo' => $ocorrencia->motivo,
                'danos_materiais' => $ocorrencia->danos_materiais,
            ]);
        }

        foreach ($antigo->pendencias as $ordem => $pendencia) {
            RdoPendencia::create([
                'id' => (string) Str::uuid(),
                'rdo_id' => $novo->id,
                'ordem' => $ordem,
                'descricao' => $pendencia->descricao,
                'responsavel' => $pendencia->responsavel,
                'prazo' => $pendencia->prazo,
                'status' => $pendencia->status,
            ]);
        }

        foreach ($antigo->comentariosInternos as $comentario) {
            RdoComentarioInterno::create([
                'id' => (string) Str::uuid(),
                'rdo_id' => $novo->id,
                'autor_user_id' => $comentario->autor_user_id,
                'texto' => $comentario->texto,
                'visivel_contratante' => $comentario->visivel_contratante,
            ]);
        }
    }

    /** Mesmo texto que `RdoController::finalizar` gravaria — nome de quem assinou, sem depender do cadastro mudar depois. */
    private function nomeDoAssinante(DiarioRegistro $antigo): ?string
    {
        if ($antigo->assinadoPor) {
            return $antigo->assinadoPor->name;
        }

        return User::withoutGlobalScopes()->find($antigo->assinado_por_user_id)?->name;
    }

    /** Sem acento (troca manual — este servidor não tem a extensão `intl`/`Normalizer`) e sem maiúscula, pra "Impraticável"/"IMPRATICAVEL" baterem com "impraticavel". */
    private const MAPA_ACENTOS = [
        'á' => 'a', 'à' => 'a', 'ã' => 'a', 'â' => 'a', 'ä' => 'a',
        'é' => 'e', 'ê' => 'e', 'è' => 'e',
        'í' => 'i', 'ì' => 'i',
        'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ò' => 'o',
        'ú' => 'u', 'ù' => 'u', 'ü' => 'u',
        'ç' => 'c',
    ];

    private function normalizarClima(?string $bruto): ?string
    {
        if (!$bruto) {
            return null;
        }
        $limpo = strtr(strtolower(trim($bruto)), self::MAPA_ACENTOS);

        return in_array($limpo, self::CAMPOS_CLIMA, true) ? $limpo : null;
    }

    private function montarObservacoes(DiarioRegistro $antigo, ?string $climaReconhecido): string
    {
        $partes = [];

        $titulo = trim((string) $antigo->titulo);
        $descricao = trim((string) $antigo->descricao);
        if ($titulo !== '' && $titulo !== $descricao) {
            $partes[] = $titulo;
        }

        if ($antigo->clima && !$climaReconhecido) {
            $partes[] = 'Clima registrado no Diário antigo: '.$antigo->clima;
        }

        $partes[] = sprintf('Migrado do Diário antigo (registro de %s).', $antigo->data?->format('d/m/Y'));

        return implode("\n", $partes);
    }
}
