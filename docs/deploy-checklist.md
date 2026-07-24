# Deployment Checklist

Use this checklist before staging or production deployment.

## Staging

- Environment variables are configured outside Git.
- PostgreSQL/PostGIS starts successfully.
- All migrations run from an empty database.
- Seed data is limited to development or staging only.
- MQTT broker is reachable by backend and test robot clients.

## Production

- PostgreSQL port 5432 is not exposed to the public internet.
- API uses HTTPS.
- MQTT uses TLS on port 8883.
- Robot credentials and ACL rules are configured.
- Database backup has run successfully.
- Backup restore has been tested in an isolated environment.
- Logs and basic alerts are enabled.
