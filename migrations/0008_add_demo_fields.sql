-- 0008_add_demo_fields.sql: 项目演示入口（演示地址 + 演示开关）
-- demo_url 为空或 demo_enabled = 0 时，前台不渲染演示入口；
-- demo_enabled 取值 0/1，与 site_settings.icp_enabled 的既有约定一致。
-- 注意：本文件必须先于引用这两列的新版 Worker 代码执行，
-- 否则管理端保存项目会因缺列报 500。
ALTER TABLE projects ADD COLUMN demo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN demo_enabled INTEGER NOT NULL DEFAULT 0;
