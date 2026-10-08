-- 0005_add_footer_settings.sql: 公开站点底部栏文案（管理端「08 底部栏」可编辑）
-- 所有字段默认为空字符串 = 前端回退到内置默认文案；
-- 文案内 {name} / {since} / {year} 占位符由前端渲染时替换为署名、馆藏起始年份与当前年份。
ALTER TABLE site_settings ADD COLUMN footer_kicker_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_kicker_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_blurb_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_blurb_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_col_specimens_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_col_specimens_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_col_collection_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_col_collection_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_col_links_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_col_links_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_github_label_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_github_label_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_contact_label_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_contact_label_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_colophon_link_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_colophon_link_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_colophon_line_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_colophon_line_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_copyright_en TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN footer_copyright_zh TEXT NOT NULL DEFAULT '';
