<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Named 'login' route required by Laravel's default auth-guest redirect logic
// (Illuminate\Auth\Middleware\Authenticate::redirectTo calls route('login')).
// This app's real login UI is the Angular SPA at /app/login; this route only
// exists so route('login') resolves instead of throwing RouteNotFoundException.
Route::get('/login', function () {
    return redirect('/app/login');
})->name('login');
