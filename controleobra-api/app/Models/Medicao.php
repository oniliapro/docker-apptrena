<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Medicao extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'medicoes';

    /** Ver o comentário da migration — mesmo padrão de `Obra::STATUS_OPCOES`. */
    public const STATUS_OPCOES = ['rascunho', 'aprovada'];

    protected $fillable = [
        'id', 'obra_id', 'sequencia', 'data_medicao', 'status', 'aprovado_em',
    ];

    protected $casts = [
        'sequencia' => 'integer',
        'data_medicao' => 'date',
        'aprovado_em' => 'datetime',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function itens(): HasMany
    {
        return $this->hasMany(MedicaoItem::class)->orderBy('ordem');
    }
}
