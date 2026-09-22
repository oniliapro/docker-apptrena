<?php

namespace App\Models;

use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Uma linha da config "Categorias de custo padrão" das Diárias (F7) — chave
 * composta (empresa_id, campo). Ver a migration.
 */
class DiariaCategoriaCusto extends Model
{
    use PertenceAEmpresa;

    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (empresa_id, campo)

    protected $table = 'diaria_categorias_custo';

    protected $fillable = ['empresa_id', 'campo', 'tipo_custo_id'];

    public function tipoCusto(): BelongsTo
    {
        return $this->belongsTo(TipoCusto::class);
    }

    /** Mesmo ajuste do EapItemCusto/MedicaoItemTipo — chave composta, sem `id`. */
    protected function setKeysForSaveQuery($query)
    {
        return $query
            ->where('empresa_id', '=', $this->getAttribute('empresa_id'))
            ->where('campo', '=', $this->getAttribute('campo'));
    }

    protected function setKeysForSelectQuery($query)
    {
        return $this->setKeysForSaveQuery($query);
    }
}
