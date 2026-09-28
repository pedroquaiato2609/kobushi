# Chamado pela Tarefa Agendada do Windows ("Ninshiki - Backup diario"). Roda o backup.sh via Git Bash
# e guarda um log — assim dá pra conferir depois se rodou e se deu certo, sem precisar abrir o Task Scheduler.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$rootPosix = $root -replace '\\', '/'   # Git Bash aceita "C:/Users/..." direto, sem precisar virar "/c/Users/..."
$log = Join-Path $root "ops\backup.log"
$bash = "C:\Program Files\Git\bin\bash.exe"

"[$(Get-Date -Format o)] iniciando backup..." | Out-File -FilePath $log -Append -Encoding utf8
try {
  & $bash -lc "cd '$rootPosix' && sh ops/backup.sh ./backups" 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
  "[$(Get-Date -Format o)] backup concluido com sucesso." | Out-File -FilePath $log -Append -Encoding utf8
} catch {
  "[$(Get-Date -Format o)] FALHA no backup: $_" | Out-File -FilePath $log -Append -Encoding utf8
  exit 1
}
