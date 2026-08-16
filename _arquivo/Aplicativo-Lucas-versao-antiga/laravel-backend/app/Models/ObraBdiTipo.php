<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ObraBdiTipo extends Model
{
    protected $table = 'obra_bdi_tipo';

    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (obra_id, tipo_custo_id)

    protected $fillable = ['obra_id', 'tipo_custo_id', 'bdi_mode', 'bdi_percent', 'bdi_value'];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function tipoCusto(): BelongsTo
    {
        return $this->belongsTo(TipoCusto::class);
    }
}
