<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/** Cadastro de materiais e equipamentos da empresa (F6). Ver a migration. */
class MaterialEquipamento extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public const TIPOS = ['material', 'equipamento'];

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'materiais_equipamentos';

    protected $fillable = [
        'id', 'empresa_id', 'tipo', 'nome', 'unidade', 'valor_unitario', 'marcas', 'foto_path', 'ativo',
    ];

    protected $casts = [
        'valor_unitario' => 'float',
        'marcas' => 'array',
        'ativo' => 'boolean',
    ];

    protected $appends = ['foto_url'];

    public function getFotoUrlAttribute(): ?string
    {
        return $this->foto_path ? Storage::disk('public')->url($this->foto_path) : null;
    }
}
