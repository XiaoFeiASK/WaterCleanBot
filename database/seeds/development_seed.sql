-- 文件作用：提供本地开发和演示用机器人种子数据。

-- 仅用于开发的种子数据。
-- 不要在生产环境加载此文件。
INSERT INTO robots (code, model, status)
VALUES
    ('H20-001', 'prototype-a', 'online'),
    ('H20-002', 'prototype-a', 'inactive')
ON CONFLICT (code) DO NOTHING;
