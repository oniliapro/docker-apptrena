<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Relatório Diário de Obra (RDO) — um registro por dia, por obra.
 *
 * `numero` é o "Nº" impresso no documento: sequencial por obra, atribuído na
 * criação. `status` vale 'rascunho' enquanto o responsável ainda edita e
 * 'finalizado' depois de assinado — finalizar É assinar, não há ação
 * separada (decisão de 08/09/2026).
 */
class RdoRegistro extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_registros';

    public const STATUS_RASCUNHO = 'rascunho';
    public const STATUS_FINALIZADO = 'finalizado';

    /** Valores aceitos em clima_manha/tarde/noite. */
    public const CLIMAS = ['claro', 'nublado', 'chuva', 'temporal', 'impraticavel'];

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'numero', 'data',
        'clima_manha', 'clima_tarde', 'clima_noite', 'impacto_cronograma',
        'observacoes', 'status', 'autor_user_id',
        'assinado_em', 'assinado_por_user_id', 'assinante_nome', 'assinante_crea',
        // Preenchido só nos RDOs vindos do Diário antigo, ver `MigrarDiarioParaRdo` (F8).
        'origem_diario_id',
    ];

    protected $casts = [
        'data' => 'date',
        'assinado_em' => 'datetime',
        'numero' => 'integer',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function autorUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'autor_user_id');
    }

    public function assinadoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assinado_por_user_id');
    }

    public function tarefas(): HasMany
    {
        return $this->hasMany(RdoTarefa::class, 'rdo_id')->orderBy('ordem');
    }

    public function fotos(): HasMany
    {
        return $this->hasMany(RdoFoto::class, 'rdo_id')->orderBy('ordem');
    }

    /** Fotos não vinculadas a nenhuma tarefa — a galeria geral do dia. */
    public function fotosDoDia(): HasMany
    {
        return $this->hasMany(RdoFoto::class, 'rdo_id')->whereNull('tarefa_id')->orderBy('ordem');
    }

    public function maoDeObra(): HasMany
    {
        return $this->hasMany(RdoMaoDeObra::class, 'rdo_id')->orderBy('ordem');
    }

    public function equipamentos(): HasMany
    {
        return $this->hasMany(RdoEquipamento::class, 'rdo_id')->orderBy('ordem');
    }

    public function ocorrencias(): HasMany
    {
        return $this->hasMany(RdoOcorrencia::class, 'rdo_id')->orderBy('ordem');
    }

    public function pendencias(): HasMany
    {
        return $this->hasMany(RdoPendencia::class, 'rdo_id')->orderBy('ordem');
    }

    public function etapas(): HasMany
    {
        return $this->hasMany(RdoEtapa::class, 'rdo_id')->orderBy('ordem');
    }

    public function responsaveisPresentes(): HasMany
    {
        return $this->hasMany(RdoResponsavelPresente::class, 'rdo_id')->orderBy('ordem');
    }

    public function comentariosInternos(): HasMany
    {
        return $this->hasMany(RdoComentarioInterno::class, 'rdo_id');
    }

    /** Fichas de verificação de serviço preenchidas neste RDO (F10). */
    public function fvsPreenchimentos(): HasMany
    {
        return $this->hasMany(FvsPreenchimento::class, 'rdo_id');
    }

    public function estaFinalizado(): bool
    {
        return $this->status === self::STATUS_FINALIZADO;
    }
}
