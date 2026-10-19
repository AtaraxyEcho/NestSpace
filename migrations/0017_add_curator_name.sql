-- 0017_add_curator_name.sql: 首页「馆长手记」的姓名槽位
-- 那张卡以前只有 所在地 / 方向 / GitHub，没有一处能写"这是谁"：about 是一段话，签名位是空的。
-- 留空 = 回退到内置默认（defaultSiteSettings.curatorName），所以老库不填也不会凭空多出名字。
ALTER TABLE site_settings ADD COLUMN curator_name TEXT NOT NULL DEFAULT '';
