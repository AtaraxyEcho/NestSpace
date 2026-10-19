-- 访问台账：按天聚合的浏览与事件计数。
--
-- 口径（与 worker、管理端面板共用）：
--   * 日/时一律按 Asia/Shanghai 切（中国无夏令时，固定 +8）。
--   * 只存聚合，不存单次访问行、不存 IP/UA/完整来源 URL。
--   * 唯一带"人"的痕迹是 vkey：浏览器端第一方随机匿名 ID 经 HMAC(hash_salt, id) 派生；
--     原始匿名 ID 与 hash_salt 都不出库（客户端只发 ID，Worker 只落派生值）。
--   * 聚合表永久保留（累计口径）；visit_day_visitor 只是"某天来过"的去重索引，
--     由每日 cron（worker 的 scheduled handler）清理 90 天前的行——日 UV 快照已在 visit_day 里，
--     不受清理影响。

CREATE TABLE IF NOT EXISTS visit_day (
    day TEXT PRIMARY KEY,
    pv INTEGER NOT NULL DEFAULT 0,
    uv INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visit_page_day (
    day TEXT NOT NULL,
    surface TEXT NOT NULL,
    ref TEXT NOT NULL DEFAULT '',
    pv INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, surface, ref)
) WITHOUT ROWID;

-- 非页面浏览事件（deck / specimen_open / outbound / imgfail / dirimport）。
-- host 只给 imgfail 用（图源主机名）；ref 只放合法的标本编号。
CREATE TABLE IF NOT EXISTS visit_event_day (
    day TEXT NOT NULL,
    event TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT '',
    host TEXT NOT NULL DEFAULT '',
    ref TEXT NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, event, method, host, ref)
) WITHOUT ROWID;

-- 粗分类维度：country / device / lang / source。value 只会是短枚举或两位国家码。
CREATE TABLE IF NOT EXISTS visit_dim_day (
    day TEXT NOT NULL,
    dim TEXT NOT NULL,
    value TEXT NOT NULL,
    pv INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, dim, value)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS visit_hour_day (
    day TEXT NOT NULL,
    hour INTEGER NOT NULL,
    pv INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, hour)
) WITHOUT ROWID;

-- 累计独立访客：一行一个浏览器匿名标识的派生键，永久保留，COUNT(*) 即累计 UV。
CREATE TABLE IF NOT EXISTS visit_identity (
    vkey TEXT PRIMARY KEY,
    first_seen_day TEXT NOT NULL
) WITHOUT ROWID;

-- 当天的去重索引：只为"今天是否来过"和"近 N 天 UV"服务，可清理。
-- 主键 (day, vkey) 已覆盖按 day 的前缀查询，不再额外建索引。
CREATE TABLE IF NOT EXISTS visit_day_visitor (
    day TEXT NOT NULL,
    vkey TEXT NOT NULL,
    PRIMARY KEY (day, vkey)
) WITHOUT ROWID;

-- 哈希盐：迁移时生成一次，之后不再变化。它和 vkey 同在库里，
-- 能防的是"派生键被拿去别处关联"，防不了已拿到整库的人暴力枚举——这是本方案的已知边界。
CREATE TABLE IF NOT EXISTS visit_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
) WITHOUT ROWID;

INSERT OR IGNORE INTO visit_meta (key, value) VALUES ('hash_salt', lower(hex(randomblob(32))));
