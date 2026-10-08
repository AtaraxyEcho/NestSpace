-- 0004_add_nav_and_logo_settings.sql: 扩充站点导航、品牌Logo及统计活跃度配置
ALTER TABLE site_settings ADD COLUMN logo_text TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN logo_subtext TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN logo_image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN logo_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE site_settings ADD COLUMN nav_items_json TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN stats_since_year TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN stats_as_of_date TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN custom_citations TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN activity_log_mode TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE site_settings ADD COLUMN activity_log_json TEXT NOT NULL DEFAULT '';
