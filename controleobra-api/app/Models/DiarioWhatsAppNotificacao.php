<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;

/**
 * Órfã desde 16/09/2026: o canal de aviso ao contratante virou e-mail
 * (item 12 dos pedidos de ajuste), e `EmailContratanteNotifier` não
 * grava mais nada aqui. Tabela/model mantidos só porque já existiam em
 * produção (sem motivo pra descartar dado já gravado) — nenhum código
 * novo deve escrever nesta tabela.
 */
class DiarioWhatsAppNotificacao extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'diario_whatsapp_notificacoes';

    protected $fillable = ['id', 'registro_id', 'obra_contratante_link_id', 'telefone', 'status', 'erro'];
}
