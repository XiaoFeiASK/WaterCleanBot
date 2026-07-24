-- Development-only seed data.
-- Do not load this file in production environments.
INSERT INTO robots (code, model, status)
VALUES
    ('H20-001', 'prototype-a', 'online'),
    ('H20-002', 'prototype-a', 'inactive')
ON CONFLICT (code) DO NOTHING;
