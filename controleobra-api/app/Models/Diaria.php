<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Um lançamento de diária de um profissional numa obra (F7). Ver a migration. */
class Diaria extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public const STATUS_OPCOES = ['rascunho', 'fechada'];

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'profissional_id', 'profissional_nome', 'profissional_funcao',
        'data', 'meia_diaria', 'valor_diaria_base', 'vale_transporte', 'vale_alimentacao',
        'combustivel', 'valor_extra', 'observacoes', 'status', 'pagamento_id', 'origem',
    ];

    protected $casts = [
        'data' => 'date',
        'meia_diaria' => 'boolean',
        'valor_diaria_base' => 'float',
        'vale_transporte' => 'float',
        'vale_alimentacao' => 'float',
        'combustivel' => 'float',
        'valor_extra' => 'float',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function pagamento(): BelongsTo
    {
        return $this->belongsTo(Pagamento::class);
    }

    public function etapas(): HasMany
    {
        return $this->hasMany(DiariaEtapa::class);
    }
}
