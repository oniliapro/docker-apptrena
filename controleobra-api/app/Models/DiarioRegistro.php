<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DiarioRegistro extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'diario_registros';

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'data', 'titulo', 'descricao', 'autor', 'clima',
    ];

    protected $casts = [
        'data' => 'date',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function fotos(): HasMany
    {
        return $this->hasMany(DiarioFoto::class, 'registro_id')->orderBy('ordem');
    }
}
