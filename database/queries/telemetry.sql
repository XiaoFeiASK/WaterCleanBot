-- Recent telemetry query for one robot.
-- Bind the robot code and time window from application code.
SELECT t.reported_at,
       ST_Y(t.location::geometry) AS latitude,
       ST_X(t.location::geometry) AS longitude,
       t.battery_percent,
       t.speed_mps,
       t.trash_weight_kg
FROM telemetry_samples t
JOIN robots r ON r.id = t.robot_id
WHERE r.code = $1
  AND t.reported_at >= $2
ORDER BY t.reported_at DESC;
