<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;

/**
 * Cada cliente que assina o sistema é uma Empresa. Todo dado do app
 * (obras, EAP, mapas, empreitas, pagamentos, preferências) é isolado por
 * empresa_id — nenhum usuário de uma empresa enxerga dado de outra.
 */
class Empresa extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'empresas';

    protected $fillable = [
        'nome',
        'cnpj',
        'plano',
        'assinatura_status',
        'assinatura_valida_ate',
    ];

    protected function casts(): array
    {
        return [
            'assinatura_valida_ate' => 'datetime',
        ];
    }

    public function usuarios()
    {
        return $this->hasMany(User::class);
    }
}
