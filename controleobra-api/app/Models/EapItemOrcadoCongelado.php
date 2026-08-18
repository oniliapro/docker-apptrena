<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Snapshot do "Orçado" por categoria de um item da EAP, gravado só no
 * momento da confirmação — ver a migration que cria esta tabela.
 * Mesma chave composta (sem PK própria) de `EapItemCusto`, com a mesma
 * ressalva sobre `setKeysForSaveQuery`/`setKeysForSelectQuery`.
 */
class EapItemOrcadoCongelado extends Model
{
    protected $table = 'eap_item_orcados_congelados';

    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (eap_item_id, tipo_custo_id)

    protected $fillable = ['eap_item_id', 'tipo_custo_id', 'valor'];

    protected $casts = ['valor' => 'float'];

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class);
    }

    public function tipoCusto(): BelongsTo
    {
        return $this->belongsTo(TipoCusto::class);
    }

    protected function setKeysForSaveQuery($query)
    {
        return $query
            ->where('eap_item_id', '=', $this->getAttribute('eap_item_id'))
            ->where('tipo_custo_id', '=', $this->getAttribute('tipo_custo_id'));
    }

    protected function setKeysForSelectQuery($query)
    {
        return $this->setKeysForSaveQuery($query);
    }
}
