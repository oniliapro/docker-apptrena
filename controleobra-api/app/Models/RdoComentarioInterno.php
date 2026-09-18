<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Observação da contratada. `visivel_contratante` false (padrão) mantém o
 * texto fora da visão do cliente final — serve de prova/lembrete interno.
 */
class RdoComentarioInterno extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_comentarios_internos';

    protected $fillable = ['id', 'rdo_id', 'autor_user_id', 'texto', 'visivel_contratante'];

    protected $casts = ['visivel_contratante' => 'boolean'];

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }

    public function autorUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'autor_user_id');
    }
}
