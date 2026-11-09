[CmdletBinding(DefaultParameterSetName = 'Acquire')]
param(
    [Parameter(ParameterSetName = 'Acquire')][string]$SourceRoot,
    [Parameter(ParameterSetName = 'Acquire')][string]$HistoryRoot,
    [Parameter(ParameterSetName = 'Acquire')][string]$CoverFile,
    [Parameter(Mandatory, ParameterSetName = 'Verify')][switch]$VerifyExisting,
    [Parameter(Mandatory, ParameterSetName = 'Replace')][string]$ReplaceSource,
    [Parameter(Mandatory, ParameterSetName = 'Replace')][string]$ReplacementFile
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$originalLocation = Get-Location
$npmArguments = @('run', 'import', '--')

# Resolve caller-supplied paths before changing directory. Preserve each path
# as one argument; this works for paths containing spaces.
if ($VerifyExisting) { $npmArguments += '--verify-existing' }
if ($SourceRoot) { $npmArguments += @('--source-root', (Resolve-Path -LiteralPath $SourceRoot).Path) }
if ($HistoryRoot) { $npmArguments += @('--history-root', (Resolve-Path -LiteralPath $HistoryRoot).Path) }
if ($CoverFile) { $npmArguments += @('--cover-file', (Resolve-Path -LiteralPath $CoverFile).Path) }
if ($ReplaceSource) { $npmArguments += @('--replace-source', $ReplaceSource) }
if ($ReplacementFile) { $npmArguments += @('--replacement-file', (Resolve-Path -LiteralPath $ReplacementFile).Path) }

$commandExitCode = 2
try {
    Set-Location -LiteralPath $projectRoot
    $npmCommand = if ($env:OS -eq 'Windows_NT') { 'npm.cmd' } else { 'npm' }
    & $npmCommand @npmArguments
    $commandExitCode = $LASTEXITCODE
}
finally {
    Set-Location -LiteralPath $originalLocation.Path
}
exit $commandExitCode
