<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Uma linha da ficha preenchida (F10): descrição (copiada do modelo no
 * momento em que a ficha foi criada — não muda se o modelo for editado
 * depois), resultado (Conforme/Não conforme/Não se aplica, nulo enquanto
 * não respondida), observação e fotos.
 *
 * Não usa PertenceAEmpresa: o isolamento vem do `FvsPreenchimento` pai
 * (cascade delete + sempre acessado através dele).
 */
class FvsPreenchimentoItem extends Model
{
    use HasUuidPrimaryKey;

    public const RESULTADOS = ['conforme', 'nao_conforme', 'nao_se_aplica'];

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'fvs_preenchimento_itens';

    protected $fillable = ['id', 'fvs_preenchimento_id', 'ordem', 'descricao', 'resultado', 'observacao'];

    protected $casts = ['ordem' => 'integer'];

    public function preenchimento(): BelongsTo
    {
        return $this->belongsTo(FvsPreenchimento::class, 'fvs_preenchimento_id');
    }

    public function fotos(): HasMany
    {
        return $this->hasMany(FvsFoto::class);
    }
}
