<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiarioResponsavelPresente extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'diario_responsaveis_presentes';

    protected $fillable = ['id', 'registro_id', 'nome', 'empresa', 'funcao', 'contrato_referencia', 'presente'];

    protected $casts = ['presente' => 'boolean'];

    public function registro(): BelongsTo
    {
        return $this->belongsTo(DiarioRegistro::class, 'registro_id');
    }
}
