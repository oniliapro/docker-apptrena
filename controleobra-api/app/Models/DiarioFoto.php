<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiarioFoto extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'diario_fotos';

    protected $fillable = [
        'id', 'registro_id', 'caminho', 'ordem',
        // Croqui (16/09/2026, item 9): marcação opcional de local na
        // própria foto — coordenadas relativas (0 a 1), ver docblock da
        // migration `add_croqui_a_diario_fotos`.
        'marcador_x', 'marcador_y', 'marcador_nota',
    ];

    protected $casts = [
        'marcador_x' => 'float',
        'marcador_y' => 'float',
    ];

    public function registro(): BelongsTo
    {
        return $this->belongsTo(DiarioRegistro::class, 'registro_id');
    }

    public function getUrlAttribute(): string
    {
        return \Illuminate\Support\Facades\Storage::disk('public')->url($this->caminho);
    }

    protected $appends = ['url'];
}
