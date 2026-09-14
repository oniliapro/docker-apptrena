<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Mirror de `Pagamento.php` — ver comentário da migration `create_recebimentos_schema`. */
class Recebimento extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    /** 'pendente' (gerado automático, ainda não conferido) | 'confirmado'. */
    public const STATUS_OPCOES = ['pendente', 'confirmado'];

    protected $fillable = [
        'id', 'empresa_id', 'numero_recebimento', 'obra_id', 'obra_number', 'data_solicitacao',
        'data_recebimento', 'cliente', 'descricao', 'valor_total', 'origem_tipo',
        'origem_ref_id', 'medicao_id', 'status',
    ];

    protected $casts = [
        'data_solicitacao' => 'date',
        'data_recebimento' => 'datetime',
        'valor_total' => 'float',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function medicao(): BelongsTo
    {
        return $this->belongsTo(Medicao::class);
    }

    public function itens(): HasMany
    {
        return $this->hasMany(RecebimentoItem::class)->orderBy('ordem');
    }

    /** Anexos (14/09/2026) — mesmo padrão de `Pagamento::anexos()`: vínculo via `origem_tipo`/`origem_id`, não FK de verdade. */
    public function anexos(): HasMany
    {
        return $this->hasMany(Arquivo::class, 'origem_id', 'id')->where('origem_tipo', 'recebimento');
    }
}
