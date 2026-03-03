param(
  [Parameter(Mandatory = $true)]
  [string]$ConnectionString,

  [Parameter(Mandatory = $true)]
  [string]$InputPath
)

if (-not (Test-Path $InputPath)) {
  throw "Backup file not found: $InputPath"
}

Write-Host "Restoring DB from -> $InputPath"
pg_restore --dbname "$ConnectionString" --clean --if-exists --no-owner --no-privileges "$InputPath"

if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed with exit code $LASTEXITCODE"
}

Write-Host "Restore completed"
