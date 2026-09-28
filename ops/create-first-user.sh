#!/usr/bin/env bash
# Cria a sua conta (primeiro acesso) direto no servidor, ANTES de abrir o site ao público. Sem isso, quem
# acessasse o domínio primeiro veria a tela "Crie seu acesso" e poderia cadastrar a conta de administrador.
# Uso (na pasta do projeto, com db/api/web no ar e o caddy ainda desligado):  bash ops/create-first-user.sh
set -eu
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"

read -r -p "Seu nome: " NAME
read -r -p "Seu e-mail: " EMAIL
read -r -s -p "Senha (mín. 10 caracteres — uma frase longa é melhor): " PASS; echo
read -r -s -p "Repita a senha: " PASS2; echo
[ "$PASS" = "$PASS2" ] || { echo "As senhas não conferem."; exit 1; }
[ "${#PASS}" -ge 10 ] || { echo "Use pelo menos 10 caracteres."; exit 1; }

$COMPOSE exec -T -e N="$NAME" -e E="$EMAIL" -e P="$PASS" api node -e "
fetch('http://127.0.0.1:3000/api/auth/setup', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: process.env.N, email: process.env.E, password: process.env.P }),
}).then(async (r) => { console.log(r.ok ? 'Conta criada.' : 'Falhou (' + r.status + '): ' + (await r.text())); process.exit(r.ok ? 0 : 1); });
"
