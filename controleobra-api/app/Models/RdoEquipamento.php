<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Equipamento usado no dia: descricao + quantidade. Pode referenciar o catalogo da empresa.
 *
 * Nao usa PertenceAEmpresa: o isolamento multiempresa vem do RdoRegistro pai
 * (cascade delete + sempre acessado atraves dele).
 */
class RdoEquipamento extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_equipamentos';

    protected $fillable = [
        'id', 'rdo_id', 'categoria', 'equipamento_id', 'contrato_equipamento_item_id',
        'contrato_referencia', 'presente', 'descricao', 'quantidade', 'ordem',
    ];

    protected $casts = ['quantidade'=>'integer','ordem'=>'integer','presente'=>'boolean'];

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }

    /** Só pra rastreio (qual item do contrato gerou esta linha) — fornecedor/contrato exibidos são o snapshot em texto, ver a migration. */
    public function contratoEquipamentoItem(): BelongsTo
    {
        return $this->belongsTo(ContratoEquipamentoItem::class, 'contrato_equipamento_item_id');
    }
}
