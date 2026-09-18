<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Uma linha de mao de obra: funcao + quantidade, na categoria 'indireta' ou 'direta' (as duas colunas do RDO).
 *
 * Nao usa PertenceAEmpresa: o isolamento multiempresa vem do RdoRegistro pai
 * (cascade delete + sempre acessado atraves dele).
 */
class RdoMaoDeObra extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_mao_de_obra';

    protected $fillable = ['id','rdo_id','categoria','funcao','quantidade','ordem'];

    protected $casts = ['quantidade'=>'integer','ordem'=>'integer'];

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }
}
