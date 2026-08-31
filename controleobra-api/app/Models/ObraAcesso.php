<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Acesso de UM usuário secundário a UMA obra (31/08/2026, pedido do
 * Lucas, "Controle de permissões") — camada separada da permissão por
 * módulo; as duas se combinam (ver `PermissaoService`). Editado na
 * própria tela da obra, não na aba de Configurações.
 */
class ObraAcesso extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'obra_acessos';

    protected $fillable = ['id', 'empresa_id', 'obra_id', 'user_id', 'pode_ver', 'pode_lancar'];

    protected $casts = [
        'pode_ver' => 'boolean',
        'pode_lancar' => 'boolean',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
