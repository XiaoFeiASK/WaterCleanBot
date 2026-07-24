-- Robot list query used by the management dashboard.
SELECT id, code, model, status, created_at, updated_at
FROM robots
ORDER BY code;
