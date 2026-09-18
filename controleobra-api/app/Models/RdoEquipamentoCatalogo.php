<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;

/** Equipamentos recorrentes da empresa, para não redigitar a cada RDO. */
class RdoEquipamentoCatalogo extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_equipamentos_catalogo';

    protected $fillable = ['id', 'empresa_id', 'nome'];
}
