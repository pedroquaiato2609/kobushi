#!/usr/bin/env sh
# Backup do banco e dos anexos. Uso (no servidor, na pasta do projeto):  sh ops/backup.sh [pasta_destino]
# Agende no cron, ex.: 0 3 * * * cd /opt/ninshiki && sh ops/backup.sh /var/backups/ninshiki
# No Windows (Git Bash), agende via Task Scheduler chamando este script (ver ops/schedule-backup.ps1).
# IMPORTANTE: guarde também a DATA_ENCRYPTION_KEY (fora do servidor); sem ela o backup dos campos criptografados não abre.
set -eu
export MSYS_NO_PATHCONV=1 # Git Bash no Windows "corrige" caminhos tipo /data pro sistema de arquivos local; aqui são caminhos DENTRO do container.
DEST="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
mkdir -p "$DEST"
umask 077

$COMPOSE exec -T db pg_dump -U ninshiki -d ninshiki --format=custom > "$DEST/db-$STAMP.dump"
$COMPOSE exec -T api tar -C /data -czf - files > "$DEST/files-$STAMP.tar.gz"

# Mantém os 14 backups mais recentes de cada tipo.
ls -1t "$DEST"/db-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$DEST"/files-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "Backup salvo em $DEST ($STAMP)"
# Restaurar:  docker compose ... exec -T db pg_restore -U ninshiki -d ninshiki --clean --if-exists < db-XXXX.dump
