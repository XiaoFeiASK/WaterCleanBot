# Production Deployment Notes

Production deployment is not automated yet.

Before production launch:

- Use managed secrets instead of `.env` files committed to Git.
- Keep PostgreSQL on a private network.
- Enable TLS for API and MQTT.
- Require per-robot MQTT credentials and ACL rules.
- Run database backups and restore drills.
- Document rollback steps for every release.
