param(
  [Parameter(Mandatory = $true)]
  [string]$Note,

  [string]$Author = "codex"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $repoRoot "docs/SESSION_LOG.md"
$timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
$branch = (git -C $repoRoot rev-parse --abbrev-ref HEAD).Trim()
$head = (git -C $repoRoot rev-parse --short HEAD).Trim()
$status = git -C $repoRoot status --short

if (-not (Test-Path $logPath)) {
  Set-Content -Path $logPath -Value "# Session Log`n"
}

if (-not $status) {
  $status = "clean"
}

$statusLines = ($status | ForEach-Object { "- $_" }) -join "`n"

$entry = @"
## $timestamp
- Author: $Author
- Branch: $branch
- HEAD: $head
- Note: $Note
- Working tree:
$statusLines

"@

Add-Content -Path $logPath -Value $entry
Write-Host "Checkpoint appended to docs/SESSION_LOG.md"
