<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Item do checklist de etapas de um registro do Diário (16/09/2026).
 * Ver docblock da migration `create_diario_etapas_table` — não há enum
 * fixo, `nome` é texto livre (selecionado/editado pelo usuário).
 */
class DiarioEtapa extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'diario_etapas';

    protected $fillable = [
        'id', 'registro_id', 'nome', 'concluida',
    ];

    protected $casts = [
        'concluida' => 'boolean',
    ];

    public function registro(): BelongsTo
    {
        return $this->belongsTo(DiarioRegistro::class, 'registro_id');
    }
}
