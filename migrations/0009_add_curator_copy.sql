-- 0009_add_curator_copy.sql: 馆长手记（Curator）栏目文案（管理端「内容管理」可编辑）
-- 默认值为空串 = 前端回退到内置默认文案；
-- curator_headline_* 支持多行（管理端按行输入，前台逐行渲染）。
ALTER TABLE site_settings ADD COLUMN curator_eyebrow_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN curator_eyebrow_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN curator_headline_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN curator_headline_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN curator_quote_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN curator_quote_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN curator_habitat TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN curator_field TEXT NOT NULL DEFAULT '';
