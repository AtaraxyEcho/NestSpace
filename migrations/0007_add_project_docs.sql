-- 0007_add_project_docs.sql: 标本文档内容（README 与 Docker Compose 编排）
-- 由 GitHub 同步/导入自动抓取首次填充，也可在管理端「项目管理 → 编辑」手工维护；
-- 空字符串代表该文档缺失，前台对应 tab 显示空状态。
-- 单份文档在抓取时截断到 100000 字符，避免单行过大触及 D1 单行上限。
ALTER TABLE projects ADD COLUMN readme_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN readme_en TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN compose_dev TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN compose_prod TEXT NOT NULL DEFAULT '';
-- 最近一次抓取文档的时间（仅供管理端展示，不参与前台渲染）
ALTER TABLE projects ADD COLUMN docs_synced_at TEXT NOT NULL DEFAULT '';
