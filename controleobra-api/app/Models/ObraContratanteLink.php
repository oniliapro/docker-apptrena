<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Link de acesso somente-leitura do contratante da obra (cliente final)
 * ao Diário — sem login, autorizado só pelo token (08/09/2026). O token
 * NÃO é o UUID `id` do registro: é gerado à parte (64 chars aleatórios),
 * pensado pra não ser adivinhável mesmo sabendo o id.
 */
class ObraContratanteLink extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'obra_contratante_links';

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'token', 'nome_contato', 'telefone_whatsapp', 'email',
        'expira_em', 'revogado_em', 'criado_por_user_id',
    ];

    protected $casts = [
        'expira_em' => 'datetime',
        'revogado_em' => 'datetime',
    ];

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
        if ($this->revogado_em) {
            return false;
        }

        return !$this->expira_em || $this->expira_em->isFuture();
    }

    /** Rotas públicas não têm usuário autenticado — sem esse scope explícito, `PertenceAEmpresa` não filtraria nada. */
    public function scopeSemEscopoEmpresa(Builder $query): Builder
    {
        return $query->withoutGlobalScope('empresa');
    }
}
