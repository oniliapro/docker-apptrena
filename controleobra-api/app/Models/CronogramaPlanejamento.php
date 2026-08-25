<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Ver o comentário da migration `create_cronograma_planejamentos_table`. */
class CronogramaPlanejamento extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'cronograma_planejamentos';

    protected $fillable = ['id', 'obra_id', 'eap_item_id', 'tipo_custo_id', 'periodo_inicio', 'valor'];

    protected $casts = [
        'periodo_inicio' => 'date',
        'valor' => 'float',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class);
    }

    public function tipoCusto(): BelongsTo
    {
        return $this->belongsTo(TipoCusto::class);
    }
}
