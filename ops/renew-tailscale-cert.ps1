# Chamado pela Tarefa Agendada do Windows ("Ninshiki - Renovar certificado Tailscale"). O certificado do
# Tailscale dura ~90 dias; isso busca um novo antes de vencer e reinicia o Caddy pra carregá-lo.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root "ops\tailscale-certs"
$domain = "ninshiki.taild2ff46.ts.net"
$log = Join-Path $root "ops\tailscale-cert-renew.log"
$tailscale = "C:\Program Files\Tailscale\tailscale.exe"

"[$(Get-Date -Format o)] renovando certificado..." | Out-File -FilePath $log -Append -Encoding utf8
try {
  & $tailscale cert --cert-file "$certDir\$domain.crt" --key-file "$certDir\$domain.key" $domain 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
  docker restart ninshiki-prod-caddy-1 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
  "[$(Get-Date -Format o)] certificado renovado e Caddy reiniciado com sucesso." | Out-File -FilePath $log -Append -Encoding utf8
} catch {
  "[$(Get-Date -Format o)] FALHA ao renovar certificado: $_" | Out-File -FilePath $log -Append -Encoding utf8
  exit 1
}
