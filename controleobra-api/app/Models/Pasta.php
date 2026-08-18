<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Pasta extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'parent_id', 'owner_user_id', 'tipo_raiz', 'nome',
    ];

    /** Verdadeiro para as duas pastas automáticas (própria/compartilhada) — travadas contra renomear/excluir. */
    public function ehRaiz(): bool
    {
        return $this->tipo_raiz !== null;
    }

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function pai(): BelongsTo
    {
        return $this->belongsTo(Pasta::class, 'parent_id');
    }

    public function subpastas(): HasMany
    {
        return $this->hasMany(Pasta::class, 'parent_id')->orderBy('nome');
    }

    public function arquivos(): HasMany
    {
        return $this->hasMany(Arquivo::class)->orderBy('nome_original');
    }
}
