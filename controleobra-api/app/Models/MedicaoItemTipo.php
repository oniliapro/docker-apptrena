<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MedicaoItemTipo extends Model
{
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (medicao_item_id, tipo_custo_id)

    protected $fillable = ['medicao_item_id', 'tipo_custo_id', 'valor_percentual', 'manual'];

    protected $casts = [
        'valor_percentual' => 'float',
        'manual' => 'boolean',
    ];

    public function medicaoItem(): BelongsTo
    {
        return $this->belongsTo(MedicaoItem::class);
    }

    public function tipoCusto(): BelongsTo
    {
        return $this->belongsTo(TipoCusto::class);
    }

    /** Mesmo bug do EapItemCusto (corrigido 31/07/2026) — ver aquele model. */
    protected function setKeysForSaveQuery($query)
    {
        return $query
            ->where('medicao_item_id', '=', $this->getAttribute('medicao_item_id'))
            ->where('tipo_custo_id', '=', $this->getAttribute('tipo_custo_id'));
    }

    protected function setKeysForSelectQuery($query)
    {
        return $this->setKeysForSaveQuery($query);
    }
}
