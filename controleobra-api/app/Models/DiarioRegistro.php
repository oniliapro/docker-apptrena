<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DiarioRegistro extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'diario_registros';

    /** 'rascunho' (editável, ainda não assinado) | 'finalizado' (assinado automaticamente pelo autor). */
    public const STATUS_RASCUNHO = 'rascunho';
    public const STATUS_FINALIZADO = 'finalizado';

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'data', 'titulo', 'descricao', 'autor', 'autor_user_id',
        'clima', 'quantidade_operarios', 'impacto_cronograma',
        'status', 'assinado_em', 'assinado_por_user_id',
    ];

    protected $casts = [
        'data' => 'date',
        'assinado_em' => 'datetime',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function fotos(): HasMany
    {
        return $this->hasMany(DiarioFoto::class, 'registro_id')->orderBy('ordem');
    }

    public function autorUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'autor_user_id');
    }

    public function assinadoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assinado_por_user_id');
    }

    public function responsaveisPresentes(): HasMany
    {
        return $this->hasMany(DiarioResponsavelPresente::class, 'registro_id');
    }

    public function equipamentosUso(): HasMany
    {
        return $this->hasMany(DiarioEquipamentoUso::class, 'registro_id');
    }

    public function ocorrencias(): HasMany
    {
        return $this->hasMany(DiarioOcorrencia::class, 'registro_id');
    }

    public function pendencias(): HasMany
    {
        return $this->hasMany(DiarioPendencia::class, 'registro_id');
    }

    public function comentariosInternos(): HasMany
    {
        return $this->hasMany(DiarioComentarioInterno::class, 'registro_id');
    }

    public function etapas(): HasMany
    {
        return $this->hasMany(DiarioEtapa::class, 'registro_id');
    }

    public function estaFinalizado(): bool
    {
        return $this->status === self::STATUS_FINALIZADO;
    }
}
