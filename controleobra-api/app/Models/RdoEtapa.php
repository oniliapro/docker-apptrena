<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Etapa/fase da obra neste lancamento. Pre-preenchida com as nao concluidas do RDO anterior; sempre editavel.
 *
 * `eap_item_id` (F9, 24/09/2026) e opcional: liga a etapa a um item de
 * verdade da EAP da obra, pra rastreio — `nome` continua sendo o rotulo
 * exibido/impresso (copiado do item quando vinculado, ou texto livre
 * quando a etapa nao corresponde a nenhuma linha da EAP, ex.: "Limpeza do
 * canteiro").
 *
 * Nao usa PertenceAEmpresa: o isolamento multiempresa vem do RdoRegistro pai
 * (cascade delete + sempre acessado atraves dele).
 */
class RdoEtapa extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_etapas';

    protected $fillable = ['id','rdo_id','eap_item_id','nome','concluida','ordem'];

    protected $casts = ['concluida'=>'boolean','ordem'=>'integer'];

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class, 'eap_item_id');
    }
}
