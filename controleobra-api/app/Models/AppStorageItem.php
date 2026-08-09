<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppStorageItem extends Model
{
    protected $table = 'app_storage';

    // Chave primária composta (empresa_id + key_name) — Eloquent não tem
    // suporte nativo a PK composta, então não usamos ->find()/route model
    // binding aqui, só consultas explícitas com where() nos dois campos
    // (ver StorageController).
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['empresa_id', 'key_name', 'value'];
}
