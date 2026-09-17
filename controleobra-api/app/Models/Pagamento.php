<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Pagamento extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    /** 'pendente' (gerado automático, ainda não conferido) | 'confirmado'. */
    public const STATUS_OPCOES = ['pendente', 'confirmado'];

    protected $fillable = [
        'id', 'empresa_id', 'numero_pagamento', 'obra_id', 'obra_number', 'data_solicitacao',
        'data_pagamento', 'fornecedor', 'descricao', 'valor_total', 'origem_tipo',
        'origem_ref_id', 'mapa_id', 'empreita_id', 'status', 'medicao_snapshot',
    ];

    protected $casts = [
        'data_solicitacao' => 'date',
        // `datetime`, não `date` — 26/08/2026, confirmar um pagamento grava
        // a data E a hora do clique (ver `PagamentoController::confirmar`).
        'data_pagamento' => 'datetime',
        'valor_total' => 'float',
        // Retrato da medição da Empreita no momento da geração (03/09/2026)
        // — só populado pra `origem_tipo = 'empreita'`. `array` preserva as
        // MESMAS chaves camelCase que o frontend gravou (contratoTotalEmpreita/
        // itens/...), sem tradução — é lido inteiro, nunca campo a campo.
        'medicao_snapshot' => 'array',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function mapa(): BelongsTo
    {
        return $this->belongsTo(Mapa::class);
    }

    public function empreita(): BelongsTo
    {
        return $this->belongsTo(Empreita::class);
    }

    public function itens(): HasMany
    {
        return $this->hasMany(PagamentoItem::class)->orderBy('ordem');
    }

    /**
     * Anexos (06/09/2026, controle de notas fiscais) — `Arquivo` não tem
     * `pagamento_id` de verdade, o vínculo é via `origem_tipo`/`origem_id`
     * (mesmo par que `Pagamento` usa pra apontar pra Mapa/Empreita, só que
     * aqui é o Arquivo apontando pro Pagamento). Usado por
     * `PagamentoController::index/show` (`withCount`/`loadCount`) pra
     * expor `anexosCount` na Lista de Pagamentos sem N+1.
     */
    public function anexos(): HasMany
    {
        return $this->hasMany(Arquivo::class, 'origem_id', 'id')->where('origem_tipo', 'pagamento');
    }
}
