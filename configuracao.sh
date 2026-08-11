#!/bin/bash
clear
echo "************************************************************************"
echo "********* ATENÇÃO: Este processo é demorado - Aguarde concluir *********"
echo "************************************************************************"
echo

# Lê MYSQL_ROOT_PASSWORD do .env da raiz (nunca hardcodear senha no script).
set -a
source .env
set +a

echo "********** CONFIGURANDO A APLICAÇÃO **********"
# Sem docker cp de .env aqui: controleobra-api/.env já chega pronto no
# container via bind mount do docker-compose (./controleobra-api:/usr/share/nginx/controleobra-api).
# Copiar o .env da raiz por cima dele foi o bug que quebrou login/CORS.
docker exec controleobra-phpfpm bash -c "cd /usr/share/nginx/controleobra-api && composer install"
docker exec controleobra-phpfpm bash -c "cd /usr/share/nginx/controleobra-api/storage && mkdir -p logs"
docker exec controleobra-phpfpm bash -c "cd /usr/share/nginx/controleobra-api/storage && chmod 777 * -R"
docker exec controleobra-phpfpm bash -c "cd /usr/share/nginx/controleobra-api && npm install && npm run dev"
docker exec controleobra-phpfpm bash -c "php artisan cache:clear"
#docker exec controleobra-phpfpm bash -c "cd /usr/share/nginx/controleobra-api && npm install && npm run production"

echo
echo "********* CRIANDO E POPULANDO O BANCO MYSQL *********"
echo "Aguarde..."
docker cp dump-controleobra.sql controleobra-mysql:/tmp/dump-controleobra.sql
docker exec controleobra-mysql bash -c "cd /tmp && MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -u root -e 'use dbcontroleobra; source dump-controleobra.sql;'"
echo "Banco de dados dbcontroleobra criado e populado com sucesso!"
echo "********* FIM DO PROCESSAMENTO *********"
