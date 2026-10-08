-- 0001_create_projects.sql: 创建核心 projects 表，支持草稿/审核状态隔离
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT', -- 'LIVE' (正式公开) | 'BETA' (测试展示) | 'DRAFT' (私密草稿) | 'ARCHIVED' (归档下线)
    name TEXT NOT NULL,
    cn TEXT NOT NULL,
    latin TEXT,
    habitat TEXT NOT NULL,
    type TEXT NOT NULL,
    language TEXT NOT NULL,
    stars TEXT DEFAULT '0',
    year TEXT NOT NULL,
    shape TEXT NOT NULL DEFAULT 'aperture', -- 'aperture' | 'lumen' | 'fjord' | 'meridian'
    version TEXT NOT NULL,
    updated TEXT NOT NULL,
    repository TEXT,
    challenge TEXT,
    solution TEXT,
    description_json TEXT NOT NULL,
    features_json TEXT NOT NULL,
    metrics_json TEXT NOT NULL,
    timeline_json TEXT NOT NULL,
    internal_notes TEXT DEFAULT '',         -- 仅管理员可见字段，严禁对外接口返回
    sort_order INTEGER DEFAULT 0,          -- 排序权重
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_sort_order ON projects(sort_order);
