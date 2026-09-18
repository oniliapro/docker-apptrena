<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pendencia aberta no dia, com responsavel e prazo.
 *
 * Nao usa PertenceAEmpresa: o isolamento multiempresa vem do RdoRegistro pai
 * (cascade delete + sempre acessado atraves dele).
 */
class RdoPendencia extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_pendencias';

    protected $fillable = ['id','rdo_id','descricao','responsavel','prazo','status','ordem'];

    protected $casts = ['prazo'=>'date','ordem'=>'integer'];

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }
}
