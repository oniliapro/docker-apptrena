<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MapaItemPreco extends Model
{
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (mapa_item_id, fornecedor_id)

    protected $fillable = ['mapa_item_id', 'fornecedor_id', 'valor_unitario', 'comprar'];

    protected $casts = [
        'valor_unitario' => 'float',
        'comprar' => 'boolean',
    ];

    public function mapaItem(): BelongsTo
    {
        return $this->belongsTo(MapaItem::class);
    }

    public function fornecedor(): BelongsTo
    {
        return $this->belongsTo(MapaFornecedor::class, 'fornecedor_id');
    }

    /** Mesmo bug do EapItemCusto (corrigido 31/07/2026) — ver aquele model. */
    protected function setKeysForSaveQuery($query)
    {
        return $query
            ->where('mapa_item_id', '=', $this->getAttribute('mapa_item_id'))
            ->where('fornecedor_id', '=', $this->getAttribute('fornecedor_id'));
    }

    protected function setKeysForSelectQuery($query)
    {
        return $this->setKeysForSaveQuery($query);
    }
}
