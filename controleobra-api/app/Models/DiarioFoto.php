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

    protected $fillable = ['id', 'registro_id', 'caminho', 'ordem'];

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
