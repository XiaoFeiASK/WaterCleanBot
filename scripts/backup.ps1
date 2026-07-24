# Creates a local PostgreSQL backup.
# Production backups should run from server automation and be copied off-host.
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
pg_dump $env:DATABASE_URL -Fc -f "tmp/waterbot-$timestamp.dump"
