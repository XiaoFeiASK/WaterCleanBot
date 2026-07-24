-- Latest command status query for one command.
SELECT c.id,
       r.code AS robot_code,
       c.type,
       c.status,
       c.payload,
       c.created_at,
       c.updated_at
FROM commands c
JOIN robots r ON r.id = c.robot_id
WHERE c.id = $1;
