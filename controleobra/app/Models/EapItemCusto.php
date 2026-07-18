<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EapItemCusto extends Model
{
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (eap_item_id, tipo_custo_id)

    protected $fillable = ['eap_item_id', 'tipo_custo_id', 'valor_unitario'];

    protected $casts = ['valor_unitario' => 'float'];

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class);
    }

    public function tipoCusto(): BelongsTo
    {
        return $this->belongsTo(TipoCusto::class);
    }
}
