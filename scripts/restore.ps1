# Restores a PostgreSQL backup into a target database.
# Review the target DATABASE_URL carefully before running this script.
param(
    [Parameter(Mandatory=$true)]
    [string]$BackupPath
)

pg_restore --clean --if-exists --dbname $env:DATABASE_URL $BackupPath
