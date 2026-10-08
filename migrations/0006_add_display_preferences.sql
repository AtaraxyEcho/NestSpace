-- 0006_add_display_preferences.sql: 公开站点展示偏好（管理端「07 站点设置」可编辑）
-- 默认值与内置默认文案一致，保证未做配置的部署行为不变：
--   default_language='auto' 跟随浏览器语言；default_theme='auto' 跟随系统深浅色；
--   首页统计 / 深色模式开关 / 双语切换默认全部开启。
ALTER TABLE site_settings ADD COLUMN default_language TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE site_settings ADD COLUMN default_theme TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE site_settings ADD COLUMN home_stats_visible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE site_settings ADD COLUMN theme_toggle_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE site_settings ADD COLUMN language_toggle_enabled INTEGER NOT NULL DEFAULT 1;
