<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmpreitaTipoIncluido extends Model
{
    protected $table = 'empreita_tipos_incluidos';

    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (empreita_id, tipo_custo_id)

    protected $fillable = ['empreita_id', 'tipo_custo_id', 'ativo'];

    protected $casts = ['ativo' => 'boolean'];

    /** Mesmo bug do EapItemCusto (corrigido 31/07/2026) — ver aquele model. */
    protected function setKeysForSaveQuery($query)
    {
        return $query
            ->where('empreita_id', '=', $this->getAttribute('empreita_id'))
            ->where('tipo_custo_id', '=', $this->getAttribute('tipo_custo_id'));
    }

    protected function setKeysForSelectQuery($query)
    {
        return $this->setKeysForSaveQuery($query);
    }
}
