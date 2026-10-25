param(
    [ValidateSet('local', 'mybox', 'google')]
    [string]$Target = 'local',
    [string]$Config = (Join-Path $PSScriptRoot 'config.private.json'),
    [string]$Output = (Join-Path $PSScriptRoot 'backups')
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Config -PathType Leaf)) {
    throw 'Copy config.example.json to config.private.json and fill in the settings first. See backup-recovery.md.'
}
& python (Join-Path $PSScriptRoot 'backup.py') --target $Target --config $Config --output $Output
if ($LASTEXITCODE -ne 0) { throw 'Backup failed. No complete backup was published. Check tools and settings.' }
