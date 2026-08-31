<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Representante legal da empresa — pro futuro módulo de contratos/
 * propostas preencher automaticamente quem assina (26/08/2026, pedido do
 * Lucas, aba "Dados da empresa" do popup de Configurações).
 */
class EmpresaRepresentante extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'empresa_representantes';

    protected $fillable = ['id', 'empresa_id', 'nome', 'cargo', 'cpf', 'email', 'telefone', 'ativo'];

    protected $casts = [
        'ativo' => 'boolean',
    ];

    public function empresa(): BelongsTo
    {
        return $this->belongsTo(Empresa::class);
    }
}
