<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Mapa extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'codigo', 'empresa_id', 'obra_id', 'numero_mapa', 'descricao', 'cliente', 'responsavel_mapa',
        'responsavel_obra', 'data_finalizacao', 'data_necessidade', 'frete_particular',
        'freteiro_particular', 'lancar_frete_como_item', 'frete_etapa_id', 'frete_categoria_tipo',
        'lancar_imposto_desconto_como_item', 'imposto_desconto_etapa_id', 'imposto_desconto_categoria_tipo',
        'modo_manual', 'is_confirmed', 'confirmed_at', 'ultima_finalizacao_em', 'total_mapa',
    ];

    protected $casts = [
        'data_finalizacao' => 'date',
        'data_necessidade' => 'date',
        'frete_particular' => 'float',
        'lancar_frete_como_item' => 'boolean',
        'lancar_imposto_desconto_como_item' => 'boolean',
        'modo_manual' => 'boolean',
        'is_confirmed' => 'boolean',
        // 'date' truncava a hora (virava sempre 00:00) — 'datetime' corrige
        // isso pra valer o que o comentário de MapaStore::alternarConfirmacao
        // já dizia querer desde 04/08/2026 ("guarda data E hora").
        'confirmed_at' => 'datetime',
        'ultima_finalizacao_em' => 'datetime',
        'total_mapa' => 'float',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function fornecedores(): HasMany
    {
        return $this->hasMany(MapaFornecedor::class)->orderBy('ordem');
    }

    public function itens(): HasMany
    {
        return $this->hasMany(MapaItem::class)->orderBy('ordem');
    }

    public function pagamentos(): HasMany
    {
        return $this->hasMany(Pagamento::class);
    }
}
