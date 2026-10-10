-- 0013_add_detail_headlines.sql: 详情页「挑战 / 方案」两段的小标题（管理端「内容管理」可编辑）
-- 这两句原先写死在组件里（Why it needed to exist. / A narrow tool, carefully shaped.）。
-- 默认值为空串 = 前端回退到内置默认文案，所以"清空"的语义是恢复默认，不是删掉标题。
ALTER TABLE site_settings ADD COLUMN challenge_headline_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN challenge_headline_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN solution_headline_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN solution_headline_zh TEXT NOT NULL DEFAULT '';
