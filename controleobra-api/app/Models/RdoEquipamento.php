<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Equipamento usado no dia: descricao + quantidade. Pode referenciar o catalogo da empresa.
 *
 * Nao usa PertenceAEmpresa: o isolamento multiempresa vem do RdoRegistro pai
 * (cascade delete + sempre acessado atraves dele).
 */
class RdoEquipamento extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_equipamentos';

    protected $fillable = ['id','rdo_id','equipamento_id','descricao','quantidade','ordem'];

    protected $casts = ['quantidade'=>'integer','ordem'=>'integer'];

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }
}
