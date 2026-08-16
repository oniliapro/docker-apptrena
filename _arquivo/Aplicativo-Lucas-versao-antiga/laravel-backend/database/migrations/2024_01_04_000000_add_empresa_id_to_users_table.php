<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->uuid('empresa_id')->nullable()->after('id');
            $table->string('papel', 20)->default('admin')->after('empresa_id');
            $table->index('empresa_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['empresa_id']);
            $table->dropColumn(['empresa_id', 'papel']);
        });
    }
};
