<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Link de acompanhamento do contratante da obra: sem senha, somente leitura,
 * só enxerga RDO finalizado. O token não é o id — são 64 caracteres
 * aleatórios, para não ser adivinhável mesmo que se conheça o id.
 */
class RdoContratanteLink extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_contratante_links';

    protected $fillable = ['id', 'empresa_id', 'obra_id', 'token', 'email', 'expira_em', 'ativo'];

    protected $casts = ['expira_em' => 'datetime', 'ativo' => 'boolean'];

    protected static function booted(): void
    {
        static::creating(function (self $link) {
            if (empty($link->token)) {
                $link->token = Str::random(64);
            }
        });
    }

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function estaValido(): bool
    {
        if (!$this->ativo) {
            return false;
        }

        return !$this->expira_em || $this->expira_em->isFuture();
    }

    /** Rotas públicas não têm usuário autenticado — sem isso o scope de empresa não filtraria nada. */
    public function scopeSemEscopoEmpresa(Builder $query): Builder
    {
        return $query->withoutGlobalScope('empresa');
    }
}
