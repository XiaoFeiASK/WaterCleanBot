-- 管理看板使用的机器人列表查询。
SELECT id, code, model, status, created_at, updated_at
FROM robots
ORDER BY code;
