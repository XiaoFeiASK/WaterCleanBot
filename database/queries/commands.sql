-- 文件作用：记录命令状态查询 SQL 草稿，供后续接口实现参考。

-- 单条命令的最新命令状态查询。
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
