<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;

/**
 * Estilo de texto nomeado pelo usuário (29/09/2026), reaproveitável em
 * qualquer modelo de contrato da empresa — ver ContratoModeloController.
 */
class ContratoEstilo extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'contrato_estilos';

    protected $fillable = [
        'id', 'empresa_id', 'nome', 'tag_html', 'fonte', 'tamanho_pt', 'cor',
        'negrito', 'italico', 'sublinhado', 'alinhamento', 'caixa_texto',
        'eh_lista', 'lista_formato', 'nivel_titulo', 'lista_prefixo', 'lista_sufixo', 'padrao',
    ];

    protected $casts = [
        'tamanho_pt' => 'integer',
        'negrito' => 'boolean',
        'italico' => 'boolean',
        'sublinhado' => 'boolean',
        'eh_lista' => 'boolean',
        'nivel_titulo' => 'integer',
        'padrao' => 'boolean',
    ];
}
