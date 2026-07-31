<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EapItemCusto extends Model
{
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (eap_item_id, tipo_custo_id)

    protected $fillable = ['eap_item_id', 'tipo_custo_id', 'valor_unitario'];

    protected $casts = ['valor_unitario' => 'float'];

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class);
    }

    public function tipoCusto(): BelongsTo
    {
        return $this->belongsTo(TipoCusto::class);
    }

    /**
     * Bug corrigido em 31/07/2026: com $primaryKey = null, o Eloquent monta
     * a query de UPDATE como `WHERE null = ...`, que não bate com nenhuma
     * linha — o UPDATE roda, afeta 0 linhas, e não dá erro nenhum. Resultado:
     * o valor digitado aparecia salvo na hora, mas ao recarregar a página
     * voltava a 0,00 sempre (só a criação da linha, com o valor padrão,
     * "pegava"; qualquer edição depois disso era descartada). O Eloquent
     * não suporta chave composta nativamente, então a query de save/select
     * precisa ser montada à mão com as duas colunas.
     */
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
