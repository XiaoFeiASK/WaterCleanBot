# Loads development seed data into the local database.
# Never run seed scripts against production.
psql $env:DATABASE_URL -f database/seeds/development_seed.sql
