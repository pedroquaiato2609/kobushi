#!/usr/bin/env bash
# Prepara uma VPS nova (Ubuntu/Debian) para rodar o Ninshiki em produção. Rode UMA vez, como root:
#   curl -fsSL https://raw.githubusercontent.com/<usuario>/<repo>/main/ops/vps-setup.sh | bash   (ou copie e rode)
# Faz: atualiza o sistema, instala Docker, cria swap (o build do frontend usa bastante memória),
# firewall (só SSH/HTTP/HTTPS), fail2ban (bloqueia força bruta no SSH), atualizações de segurança
# automáticas e, se já houver chave SSH cadastrada, desliga login por senha no SSH.
set -eu
[ "$(id -u)" -eq 0 ] || { echo "Rode como root (sudo -i)."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "==> Atualizando o sistema e instalando pacotes"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades

echo "==> Docker"
command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

echo "==> Swap de 2 GB (se ainda não existir)"
if [ -z "$(swapon --show --noheadings)" ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Firewall: só SSH, HTTP e HTTPS"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> fail2ban (SSH) e atualizações de segurança automáticas"
systemctl enable --now fail2ban
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades

echo "==> SSH: desliga senha só se já existir chave cadastrada (evita te trancar pra fora)"
if [ -s /root/.ssh/authorized_keys ]; then
  mkdir -p /etc/ssh/sshd_config.d
  printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/99-ninshiki.conf
  sshd -t && (systemctl reload ssh 2>/dev/null || systemctl reload sshd)
  echo "    login por senha desativado (só chave SSH)."
else
  echo "    AVISO: nenhuma chave SSH em /root/.ssh/authorized_keys — login por senha continua ligado."
  echo "    Cadastre sua chave (ssh-copy-id) e rode este script de novo pra desligar a senha."
fi

echo "==> Pronto. Próximo passo: clonar o repositório e configurar o .env.production."
