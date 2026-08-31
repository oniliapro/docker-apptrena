<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'empresa_id',
        'papel',
        'pode_gerenciar_permissoes',
        'ativo',
        'name',
        'email',
        'password',
    ];

    public function empresa()
    {
        return $this->belongsTo(Empresa::class);
    }

    public function permissoesModulo(): HasMany
    {
        return $this->hasMany(ModuloPermissao::class);
    }

    public function obraAcessos(): HasMany
    {
        return $this->hasMany(ObraAcesso::class);
    }

    /** `'admin'` = dono da empresa (criado no cadastro); sempre ignora as checagens de permissão. */
    public function ehAdmin(): bool
    {
        return $this->papel === 'admin';
    }

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'pode_gerenciar_permissoes' => 'boolean',
            'ativo' => 'boolean',
        ];
    }
}
