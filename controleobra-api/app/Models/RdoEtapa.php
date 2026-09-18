<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Etapa/fase da obra neste lancamento. Pre-preenchida com as nao concluidas do RDO anterior; sempre editavel.
 *
 * Nao usa PertenceAEmpresa: o isolamento multiempresa vem do RdoRegistro pai
 * (cascade delete + sempre acessado atraves dele).
 */
class RdoEtapa extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_etapas';

    protected $fillable = ['id','rdo_id','nome','concluida','ordem'];

    protected $casts = ['concluida'=>'boolean','ordem'=>'integer'];

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }
}
