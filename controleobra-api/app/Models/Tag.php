<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tag (06/09/2026) — cadastrada em Configurações, usada pra organizar
 * anexos de Pagamento/Recebimento (controle de notas fiscais). Ver
 * `TagController` pra criação/renomeação da pasta correspondente em cada
 * obra, e `AnexoController` pra como um arquivo vira "anexo" com uma tag.
 */
class Tag extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id', 'empresa_id', 'nome', 'ativo'];

    protected $casts = [
        'ativo' => 'boolean',
    ];

    /** Pastas correspondentes a esta tag, uma por obra (ver `Pasta::ehDeTag`). */
    public function pastas(): HasMany
    {
        return $this->hasMany(Pasta::class);
    }
}
