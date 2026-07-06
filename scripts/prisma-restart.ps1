$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RootDir = Resolve-Path (Join-Path $PSScriptRoot '..')
$ApiDir = Join-Path $RootDir 'apps/api'
$EnvFile = Join-Path $RootDir '.env'
$EnvExample = Join-Path $RootDir '.env.example'
$PrismaCli = Join-Path $RootDir 'node_modules/prisma/build/index.js'
$RunSeed = $env:RUN_SEED -ne '0'

function Show-Usage {
  @'
Usage: npm run prisma:restart -- [options]

Windows-friendly Prisma reset for the local development database:
  1. Ensures .env exists at the repository root
  2. Runs Prisma migrate reset with --force and --skip-seed
  3. Regenerates Prisma Client
  4. Seeds demo data unless disabled

Options:
  --no-seed       Skip demo seed data
  -h, --help      Show this help

Environment:
  RUN_SEED=0      Same as --no-seed

Warning:
  This resets the local database configured by DATABASE_URL.
'@ | Write-Host
}

foreach ($Arg in $args) {
  switch ($Arg) {
    '--no-seed' { $RunSeed = $false; continue }
    '-h' { Show-Usage; exit 0 }
    '--help' { Show-Usage; exit 0 }
    default {
      Write-Error "Unknown option: $Arg"
      Show-Usage
      exit 1
    }
  }
}

function Write-Step([string] $Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked([string] $FilePath, [string[]] $Arguments, [string] $WorkingDirectory = $RootDir) {
  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Stop-LocalNodeProcesses {
  $RootPath = [System.IO.Path]::GetFullPath($RootDir.Path)
  $Processes = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($RootPath) }

  if (-not $Processes) {
    return
  }

  Write-Step 'Stopping local dev servers that may lock Prisma files'
  foreach ($Process in $Processes) {
    Write-Host "Stopping node process $($Process.ProcessId)"
    Stop-Process -Id $Process.ProcessId -Force
  }
  Start-Sleep -Seconds 1
}

if (-not (Test-Path $EnvFile)) {
  if (-not (Test-Path $EnvExample)) {
    throw "Missing .env and .env.example at $RootDir"
  }
  Write-Step 'Creating .env from .env.example'
  Copy-Item $EnvExample $EnvFile
}

if (-not (Test-Path $PrismaCli)) {
  throw 'Prisma CLI was not found. Run npm install first, then rerun npm run prisma:restart.'
}

Stop-LocalNodeProcesses

Write-Step 'Resetting local database and replaying Prisma migrations'
Invoke-Checked 'node' @('--env-file=../../.env', $PrismaCli, 'migrate', 'reset', '--force', '--skip-seed') $ApiDir

Write-Step 'Generating Prisma Client'
Invoke-Checked 'node' @('--env-file=../../.env', $PrismaCli, 'generate') $ApiDir

if ($RunSeed) {
  Write-Step 'Seeding demo data'
  Invoke-Checked 'node' @('--env-file=../../.env', '--import', 'tsx', 'prisma/seed.ts') $ApiDir
} else {
  Write-Step 'Skipping seed'
}

Write-Host ''
Write-Host 'Prisma restart complete.'
