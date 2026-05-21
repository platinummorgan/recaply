param()

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Script
  )

  Write-Host "==> $Name"
  & $Script
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $Name"
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$package = Get-Content -Path "package.json" -Raw | ConvertFrom-Json
$appConfig = Get-Content -Path "app.json" -Raw | ConvertFrom-Json
$pkgVersion = $package.version
$appVersion = $appConfig.expo.version

if ($pkgVersion -ne $appVersion) {
  throw "Version mismatch: package.json=$pkgVersion app.json=$appVersion"
}

$releaseNotesCandidates = @(
  "RELEASE_NOTES_v$pkgVersion.txt",
  "RELEASE_NOTES_v$pkgVersion.md"
)

$versionNotesPath = $releaseNotesCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $versionNotesPath) {
  throw "Missing versioned release notes file. Expected one of: $($releaseNotesCandidates -join ', ')"
}

$requiredNotes = @(
  $versionNotesPath,
  "RELEASE_NOTES_APP_STORE.txt",
  "RELEASE_NOTES_PLAY_STORE.txt"
)

foreach ($noteFile in $requiredNotes) {
  if (-not (Test-Path $noteFile)) {
    throw "Missing release notes file: $noteFile"
  }

  $content = (Get-Content -Path $noteFile -Raw).Trim()
  if ($content.Length -eq 0) {
    throw "Release notes file is empty: $noteFile"
  }
}

Invoke-Step -Name "Frontend typecheck" -Script { npm run typecheck:frontend }
Invoke-Step -Name "Root typecheck" -Script { npm run typecheck:root }
Invoke-Step -Name "Frontend lint" -Script { npm run lint:frontend }
Invoke-Step -Name "Frontend tests" -Script { npm run test:frontend }
Invoke-Step -Name "Backend build" -Script { npm --prefix backend run build }
Invoke-Step -Name "Backend tests" -Script { npm --prefix backend test }

Write-Host ""
Write-Host "Release checks passed for version $pkgVersion."
