$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RootDir = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RootDir

$RunSeed = $env:RUN_SEED -ne '0'
$RunDbSetup = $env:RUN_DB_SETUP -ne '0'
$ResetDb = $env:RESET_DB -eq '1'

function Show-Usage {
  @'
Usage: npm run welcome -- [options]

Prepares a freshly pulled branch for local development on Windows:
  1. Creates .env from .env.example if missing
  2. Installs npm dependencies
  3. Prepares a local PostgreSQL database
  4. Generates Prisma Client
  5. Applies pending Prisma migrations without deleting data
  6. Seeds demo data unless disabled

Options:
  --no-db-setup   Skip local PostgreSQL setup
  --no-seed       Skip demo seed data
  --reset-db      Drop local data and replay migrations before seeding
  -h, --help      Show this help

Environment:
  RUN_DB_SETUP=0  Same as --no-db-setup
  RUN_SEED=0      Same as --no-seed
  RESET_DB=1      Same as --reset-db

PostgreSQL:
  If psql is available, this script uses the local PostgreSQL server.
  If psql is not available but Docker is running, it starts/reuses a local
  container named toquehub-postgres-dev on port 5432.
'@ | Write-Host
}

foreach ($Arg in $args) {
  switch ($Arg) {
    '--no-db-setup' { $RunDbSetup = $false; continue }
    '--no-seed' { $RunSeed = $false; continue }
    '--reset-db' { $ResetDb = $true; continue }
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

function Test-Command([string] $Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Checked([string] $FilePath, [string[]] $Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

function Quote-SqlIdentifier([string] $Value) {
  return '"' + $Value.Replace('"', '""') + '"'
}

function Quote-SqlLiteral([string] $Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

function Invoke-Psql([string] $Database, [string[]] $Arguments) {
  $BaseArgs = @(
    '-v', 'ON_ERROR_STOP=1',
    '-h', $script:DbHost,
    '-p', $script:DbPort,
    '-d', $Database
  )
  & psql @BaseArgs @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "psql command failed."
  }
}

function Invoke-PsqlScalar([string] $Database, [string] $Sql) {
  $BaseArgs = @(
    '-v', 'ON_ERROR_STOP=1',
    '-h', $script:DbHost,
    '-p', $script:DbPort,
    '-d', $Database,
    '-tAc', $Sql
  )
  $Output = & psql @BaseArgs
  if ($LASTEXITCODE -ne 0) {
    throw "psql query failed."
  }
  return (($Output | Out-String).Trim())
}

function Prepare-PostgresWithPsql {
  if (Test-Command 'pg_isready') {
    & pg_isready -h $script:DbHost -p $script:DbPort *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "PostgreSQL is not reachable on $($script:DbHost):$($script:DbPort). Start PostgreSQL, then rerun this script."
    }
  }

  try {
    Invoke-Psql 'postgres' @('-tAc', 'SELECT 1') *> $null
  } catch {
    throw 'Could not connect to PostgreSQL database "postgres" with your current Windows user. Try running this script as a PostgreSQL superuser, install psql with the right PATH, or rerun with Docker available and psql removed from PATH.'
  }

  $UserIdentifier = Quote-SqlIdentifier $script:DbUser
  $UserLiteral = Quote-SqlLiteral $script:DbUser
  $PasswordLiteral = Quote-SqlLiteral $script:DbPassword
  $DatabaseIdentifier = Quote-SqlIdentifier $script:DbName
  $DatabaseLiteral = Quote-SqlLiteral $script:DbName

  $UserExists = Invoke-PsqlScalar 'postgres' "SELECT 1 FROM pg_roles WHERE rolname = $UserLiteral"
  if ($UserExists -ne '1') {
    Invoke-Psql 'postgres' @('-c', "CREATE USER $UserIdentifier WITH PASSWORD $PasswordLiteral CREATEDB;")
  } else {
    Invoke-Psql 'postgres' @('-c', "ALTER USER $UserIdentifier WITH PASSWORD $PasswordLiteral CREATEDB;")
  }

  $DatabaseExists = Invoke-PsqlScalar 'postgres' "SELECT 1 FROM pg_database WHERE datname = $DatabaseLiteral"
  if ($DatabaseExists -ne '1') {
    Invoke-Psql 'postgres' @('-c', "CREATE DATABASE $DatabaseIdentifier OWNER $UserIdentifier;")
  }

  Invoke-Psql 'postgres' @('-c', "ALTER DATABASE $DatabaseIdentifier OWNER TO $UserIdentifier;")
  Invoke-Psql 'postgres' @('-c', "GRANT ALL PRIVILEGES ON DATABASE $DatabaseIdentifier TO $UserIdentifier;")
  Invoke-Psql $script:DbName @('-c', "GRANT ALL ON SCHEMA public TO $UserIdentifier;") *> $null
}

function Invoke-Docker([string[]] $Arguments) {
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker command failed: docker $($Arguments -join ' ')"
  }
}

function Test-DockerContainerExists([string] $Name) {
  $Existing = & docker ps -a --format '{{.Names}}'
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker is installed but is not responding. Start Docker Desktop, then rerun this script.'
  }
  return @($Existing) -contains $Name
}

function Wait-DockerPostgres([string] $ContainerName) {
  for ($Attempt = 1; $Attempt -le 45; $Attempt++) {
    & docker exec $ContainerName pg_isready -U $script:DbUser -d $script:DbName *> $null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "PostgreSQL container $ContainerName did not become ready in time."
}

function Invoke-DockerPsql([string] $ContainerName, [string] $Database, [string[]] $Arguments) {
  $BaseArgs = @(
    'exec',
    $ContainerName,
    'psql',
    '-v', 'ON_ERROR_STOP=1',
    '-U', $script:DbUser,
    '-d', $Database
  )
  Invoke-Docker ($BaseArgs + $Arguments)
}

function Prepare-PostgresWithDocker {
  if ($script:DbHost -notin @('localhost', '127.0.0.1')) {
    throw "Docker fallback only supports localhost databases. Current TOQUEHUB_DB_HOST is $($script:DbHost)."
  }

  Invoke-Docker @('info') *> $null

  $ContainerName = if ($env:TOQUEHUB_POSTGRES_CONTAINER) { $env:TOQUEHUB_POSTGRES_CONTAINER } else { 'toquehub-postgres-dev' }
  $VolumeName = if ($env:TOQUEHUB_POSTGRES_VOLUME) { $env:TOQUEHUB_POSTGRES_VOLUME } else { 'toquehub-postgres-dev-data' }
  $Image = if ($env:POSTGRES_DOCKER_IMAGE) { $env:POSTGRES_DOCKER_IMAGE } else { 'postgres:15-alpine' }

  if (Test-DockerContainerExists $ContainerName) {
    Write-Step "Starting PostgreSQL Docker container $ContainerName"
    Invoke-Docker @('start', $ContainerName) *> $null
  } else {
    Write-Step "Creating PostgreSQL Docker container $ContainerName"
    Invoke-Docker @(
      'run', '-d',
      '--name', $ContainerName,
      '-e', "POSTGRES_DB=$($script:DbName)",
      '-e', "POSTGRES_USER=$($script:DbUser)",
      '-e', "POSTGRES_PASSWORD=$($script:DbPassword)",
      '-p', "$($script:DbPort):5432",
      '-v', "${VolumeName}:/var/lib/postgresql/data",
      $Image
    ) *> $null
  }

  Wait-DockerPostgres $ContainerName

  $UserIdentifier = Quote-SqlIdentifier $script:DbUser
  $DatabaseIdentifier = Quote-SqlIdentifier $script:DbName

  Invoke-DockerPsql $ContainerName 'postgres' @('-c', "ALTER USER $UserIdentifier CREATEDB;")
  Invoke-DockerPsql $ContainerName 'postgres' @('-c', "ALTER DATABASE $DatabaseIdentifier OWNER TO $UserIdentifier;")
  Invoke-DockerPsql $ContainerName 'postgres' @('-c', "GRANT ALL PRIVILEGES ON DATABASE $DatabaseIdentifier TO $UserIdentifier;")
  Invoke-DockerPsql $ContainerName $script:DbName @('-c', "GRANT ALL ON SCHEMA public TO $UserIdentifier;") *> $null
}

function Prepare-LocalPostgres {
  $script:DbName = if ($env:TOQUEHUB_DB_NAME) { $env:TOQUEHUB_DB_NAME } else { 'toquehub' }
  $script:DbUser = if ($env:TOQUEHUB_DB_USER) { $env:TOQUEHUB_DB_USER } else { 'toquehub' }
  $script:DbPassword = if ($env:TOQUEHUB_DB_PASSWORD) { $env:TOQUEHUB_DB_PASSWORD } else { 'toquehub' }
  $script:DbHost = if ($env:TOQUEHUB_DB_HOST) { $env:TOQUEHUB_DB_HOST } else { 'localhost' }
  $script:DbPort = if ($env:TOQUEHUB_DB_PORT) { $env:TOQUEHUB_DB_PORT } else { '5432' }

  if (Test-Command 'psql') {
    try {
      Prepare-PostgresWithPsql
      return
    } catch {
      if ((Test-Command 'docker') -and ($script:DbHost -in @('localhost', '127.0.0.1'))) {
        Write-Warning "$($_.Exception.Message)"
        Write-Warning 'Falling back to a local Docker PostgreSQL container.'
        Prepare-PostgresWithDocker
        return
      }
      throw
    }
  }

  if (Test-Command 'docker') {
    Prepare-PostgresWithDocker
  } else {
    throw @'
psql was not found and Docker is not available.
Install PostgreSQL client tools, start PostgreSQL locally, or install/start Docker Desktop.
'@
  }

  Write-Host ''
  Write-Host 'Local PostgreSQL database is ready. Use this DATABASE_URL in .env:'
  Write-Host "postgresql://$($script:DbUser):$($script:DbPassword)@$($script:DbHost):$($script:DbPort)/$($script:DbName)?schema=public"
}

if (-not (Test-Path '.env')) {
  Write-Step 'Creating .env from .env.example'
  Copy-Item '.env.example' '.env'
} else {
  Write-Step '.env already exists, keeping it'
}

Write-Step 'Installing npm dependencies'
Invoke-Checked 'npm' @('install')

if ($RunDbSetup) {
  Write-Step 'Preparing local PostgreSQL'
  Prepare-LocalPostgres
} else {
  Write-Step 'Skipping local PostgreSQL setup'
}

Write-Step 'Generating Prisma Client'
Invoke-Checked 'npm' @('run', 'prisma:generate')

if ($ResetDb) {
  Write-Step 'Resetting local database and replaying Prisma migrations'
  Invoke-Checked 'npm' @('run', 'prisma:reset', '--', '--force')
} else {
  Write-Step 'Applying Prisma migrations'
  & npm run prisma:deploy
  if ($LASTEXITCODE -ne 0) {
    @'

Prisma migration failed.

If Prisma reported drift, a failed migration, or a migration that exists in your
local database but not in this branch, your local dev database is out of sync
with the code.
When you are okay with losing local data, rerun:
  npm run welcome -- --reset-db

To keep local data, recover the missing migration/code instead of resetting.
'@ | Write-Error
    exit 1
  }
}

if ($RunSeed) {
  Write-Step 'Seeding demo data'
  Invoke-Checked 'npm' @('run', 'prisma:seed')
} else {
  Write-Step 'Skipping seed'
}

@'

Done. You can now start the app with:
  npm run api:dev
  npm run web:dev
'@ | Write-Host
