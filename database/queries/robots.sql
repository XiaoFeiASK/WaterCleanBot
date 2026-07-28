-- 文件作用：记录机器人列表查询 SQL 草稿，供后续 Repository 实现参考。

-- 管理看板使用的机器人列表查询。
SELECT id, code, model, status, created_at, updated_at
FROM robots
ORDER BY code;
