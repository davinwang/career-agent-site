$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "Created .env from .env.example - please edit with your API keys"
}

New-Item -ItemType Directory -Force -Path ../data/db, ../data/uploads, ../data/repos | Out-Null

docker compose up --build -d

# Read the exposed port from .env (defaults to 8090) for accurate output.
$ExposePort = 8090
if (Test-Path .env) {
    $match = Select-String -Path .env -Pattern '^\s*EXPOSE_PORT\s*=\s*(.+)$' | Select-Object -First 1
    if ($match) { $ExposePort = $match.Matches.Groups[1].Value.Trim() }
}

Write-Host ""
Write-Host "Services started:"
Write-Host "  Recruiter portal: http://localhost:$ExposePort/"
Write-Host "  Admin portal:     http://localhost:$ExposePort/admin/"
Write-Host "  Backend API:      http://localhost:$ExposePort/api/"
Write-Host ""
Write-Host "First-time setup: docker compose exec backend npm run seed:prod"
