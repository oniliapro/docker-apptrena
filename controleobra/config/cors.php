<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | O frontend (html/*.html) roda em outra origem/porta que a API, então
    | precisa liberar CORS pras chamadas fetch/XHR funcionarem.
    |
    | Em produção (quando for pra internet), defina CORS_ALLOWED_ORIGINS no
    | .env com o(s) domínio(s) reais do frontend, separados por vírgula
    | (ex.: https://app.seusite.com.br). Sem essa variável, cai no "*"
    | (liberado geral), que só deve ficar assim em ambiente local/pessoal.
    |
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter(array_map('trim', explode(',', env('CORS_ALLOWED_ORIGINS', '*')))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,
];
