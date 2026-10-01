<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;

/**
 * Modelo de contrato (28/09/2026, itens 8/9) — cadastro reaproveitável de
 * Configurações. `conteudo` é texto livre com variáveis `{{chave}}`,
 * substituídas na hora de gerar o PDF (ver `ContratoPdfController` e
 * `ContratoModeloController::VARIAVEIS`).
 */
class ContratoModelo extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'contrato_modelos';

    protected $fillable = [
        'id', 'empresa_id', 'tipo', 'nome', 'conteudo', 'ativo',
        'margem_superior_mm', 'margem_direita_mm', 'margem_inferior_mm', 'margem_esquerda_mm',
        'margem_cabecalho_mm', 'margem_rodape_mm',
        'tamanho_papel', 'orientacao', 'cabecalho_html', 'rodape_html',
        'timbrado_modo', 'timbrado_ajuste', 'tag_anexo_id',
        'timbrado_largura_pct', 'timbrado_altura_pct', 'timbrado_manter_proporcao', 'timbrado_opacidade',
    ];

    protected $casts = [
        'ativo' => 'boolean',
        'margem_superior_mm' => 'integer',
        'margem_direita_mm' => 'integer',
        'margem_inferior_mm' => 'integer',
        'margem_esquerda_mm' => 'integer',
        'margem_cabecalho_mm' => 'integer',
        'margem_rodape_mm' => 'integer',
        'timbrado_largura_pct' => 'integer',
        'timbrado_altura_pct' => 'integer',
        'timbrado_manter_proporcao' => 'boolean',
        'timbrado_opacidade' => 'integer',
    ];
}
