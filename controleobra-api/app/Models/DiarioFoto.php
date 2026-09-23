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

    /**
     * Caminho RELATIVO — mesmo bug/correção do `RdoFoto::getUrlAttribute()`
     * (23/09/2026): URL absoluta via `Storage::url()` não é alcançável de
     * fora do navegador do usuário. Diário antigo está aposentado das
     * telas normais, mas o link público de quem ainda tinha aberto e o
     * comando de migração leem este campo — mantido correto por segurança.
     */
    public function getUrlAttribute(): string
    {
        return '/storage/'.$this->caminho;
    }

    protected $appends = ['url'];
}
