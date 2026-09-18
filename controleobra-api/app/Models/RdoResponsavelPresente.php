<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Responsavel/terceiro presente na obra no dia, com a empresa e o contrato correspondente.
 *
 * Nao usa PertenceAEmpresa: o isolamento multiempresa vem do RdoRegistro pai
 * (cascade delete + sempre acessado atraves dele).
 */
class RdoResponsavelPresente extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_responsaveis_presentes';

    protected $fillable = ['id','rdo_id','nome','empresa','funcao','contrato_referencia','ordem'];

    protected $casts = ['ordem'=>'integer'];

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }
}
