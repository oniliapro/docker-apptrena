<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmpreitaRegistroLinhaTipo extends Model
{
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (empreita_registro_linha_id, tipo_custo_id)

    protected $fillable = [
        'empreita_registro_linha_id', 'tipo_custo_id', 'from_percent',
        'to_percent', 'avanco_percent', 'pagar_valor', 'reservar_valor',
    ];

    protected $casts = [
        'from_percent' => 'float',
        'to_percent' => 'float',
        'avanco_percent' => 'float',
        'pagar_valor' => 'float',
        'reservar_valor' => 'float',
    ];
}
