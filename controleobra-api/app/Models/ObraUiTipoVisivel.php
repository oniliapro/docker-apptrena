<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ObraUiTipoVisivel extends Model
{
    protected $table = 'obra_ui_tipo_visivel';

    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (obra_id, tipo_custo_id)

    protected $fillable = ['obra_id', 'tipo_custo_id', 'visivel'];

    protected $casts = ['visivel' => 'boolean'];

    /** Mesmo bug do EapItemCusto (corrigido 31/07/2026) — ver aquele model. */
    protected function setKeysForSaveQuery($query)
    {
        return $query
            ->where('obra_id', '=', $this->getAttribute('obra_id'))
            ->where('tipo_custo_id', '=', $this->getAttribute('tipo_custo_id'));
    }

    protected function setKeysForSelectQuery($query)
    {
        return $this->setKeysForSaveQuery($query);
    }
}
