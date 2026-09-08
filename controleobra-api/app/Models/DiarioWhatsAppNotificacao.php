<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;

class DiarioWhatsAppNotificacao extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'diario_whatsapp_notificacoes';

    protected $fillable = ['id', 'registro_id', 'obra_contratante_link_id', 'telefone', 'status', 'erro'];
}
