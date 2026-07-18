<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TipoCusto extends Model
{
    protected $table = 'tipos_custo';

    public $timestamps = false;
    public $incrementing = true;
    protected $keyType = 'int';

    protected $fillable = ['id', 'chave', 'rotulo', 'ordem'];
}
