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
}
