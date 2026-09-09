<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiarioPendencia extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'diario_pendencias';

    /** 'aberta' | 'concluida' */
    public const STATUS = ['aberta', 'concluida'];

    protected $fillable = ['id', 'registro_id', 'descricao', 'responsavel', 'prazo', 'status'];

    protected $casts = ['prazo' => 'date'];

    public function registro(): BelongsTo
    {
        return $this->belongsTo(DiarioRegistro::class, 'registro_id');
    }
}
