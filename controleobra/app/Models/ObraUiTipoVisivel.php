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
}
