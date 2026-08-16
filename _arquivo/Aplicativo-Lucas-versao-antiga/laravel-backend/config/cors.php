<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | O frontend (html/*.html) roda em outra origem/porta que a API
    | (localhost:8088), então precisa liberar CORS pras chamadas fetch/XHR
    | funcionarem. Liberado geral aqui porque é ambiente local/pessoal —
    | se um dia isso for exposto fora de localhost, restrinja
    | allowed_origins para o domínio real do frontend.
    |
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,
];
