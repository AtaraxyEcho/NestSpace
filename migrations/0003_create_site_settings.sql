-- 0003_create_site_settings.sql: 站点文案与合规配置（单行表，id 恒为 1）
-- 所有字段默认为空字符串 = 前端回退到内置默认文案；
-- icp_enabled 默认 0（页脚备案号默认关闭）。
CREATE TABLE IF NOT EXISTS site_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    hero_en TEXT NOT NULL DEFAULT '',
    hero_zh TEXT NOT NULL DEFAULT '',
    subtitle_en TEXT NOT NULL DEFAULT '',
    subtitle_zh TEXT NOT NULL DEFAULT '',
    about_en TEXT NOT NULL DEFAULT '',
    about_zh TEXT NOT NULL DEFAULT '',
    github_url TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    seo_title TEXT NOT NULL DEFAULT '',
    seo_description TEXT NOT NULL DEFAULT '',
    icp_number TEXT NOT NULL DEFAULT '',
    icp_url TEXT NOT NULL DEFAULT 'https://beian.miit.gov.cn/',
    icp_enabled INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_settings (id) VALUES (1);
