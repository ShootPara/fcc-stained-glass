$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    $npmCommand = if ($env:OS -eq 'Windows_NT') { 'npm.cmd' } else { 'npm' }
    & $npmCommand run typecheck
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $npmCommand run validate -- --stage catalog
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $npmCommand run validate -- --stage assets --id design-002
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $npmCommand test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
