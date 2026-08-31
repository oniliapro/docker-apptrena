<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Permissão de UM usuário secundário num módulo do sistema (31/08/2026,
 * pedido do Lucas, "Controle de permissões") — ver `PermissaoService`
 * pra como as flags se combinam e `modulo_permissoes` (migration) pro
 * porquê da ausência de linha significar "sem acesso nenhum".
 */
class ModuloPermissao extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'modulo_permissoes';

    protected $fillable = [
        'id', 'empresa_id', 'user_id', 'modulo',
        'pode_usar', 'pode_criar', 'pode_editar', 'pode_excluir', 'pode_reabrir',
    ];

    protected $casts = [
        'pode_usar' => 'boolean',
        'pode_criar' => 'boolean',
        'pode_editar' => 'boolean',
        'pode_excluir' => 'boolean',
        'pode_reabrir' => 'boolean',
    ];

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
