<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Foto de evidência de um item da FVS (F10).
 *
 * `caminho` RELATIVO (`/storage/...`) desde a criação — ver o bug já achado
 * e corrigido em 23/09/2026 pras mídias do RDO (`RdoFoto::getUrlAttribute`):
 * URL absoluta não é alcançável de dentro do container que gera o PDF.
 *
 * Não usa PertenceAEmpresa: o isolamento vem do item pai (cascade delete +
 * sempre acessado através dele).
 */
class FvsFoto extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'fvs_fotos';

    protected $fillable = ['id', 'fvs_preenchimento_item_id', 'caminho', 'ordem'];

    protected $casts = ['ordem' => 'integer'];

    protected $appends = ['url'];

    public function item(): BelongsTo
    {
        return $this->belongsTo(FvsPreenchimentoItem::class, 'fvs_preenchimento_item_id');
    }

    public function getUrlAttribute(): string
    {
        return '/storage/'.$this->caminho;
    }
}
