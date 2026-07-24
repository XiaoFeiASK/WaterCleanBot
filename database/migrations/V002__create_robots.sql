-- robots 存储每台实体清洁机器人的后端记录。
CREATE TABLE IF NOT EXISTS robots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    model text NOT NULL DEFAULT 'unknown',
    status text NOT NULL DEFAULT 'inactive',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 管理看板过滤器会频繁使用机器人状态。
CREATE INDEX IF NOT EXISTS idx_robots_status ON robots (status);
