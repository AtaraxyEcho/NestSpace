-- 0014_add_section_copy.sql: 栏目与页面的文案槽位（管理端「栏目与页面文案」可编辑）
-- 形状：{ "<page>.<slot>": { "en": "...", "zh": "..." } }，单行 JSON，键为固定槽位名。
-- 首批五个槽位：home.catalogue / home.index（新增的描述行）、
--               detail.preview / detail.anatomy / detail.related（替换原先写死在组件里的三处标题）。
-- 留空 = 前端回退到内置默认（BUILT_IN_SECTION_SLOTS）；home.* 的内置默认为空串，即"不填就不渲染这一行"。
-- 刻意不给标题另开字段：首页栏目标题就是导航标签本身，改名必然传播（见 docs/plans/SECTION_CONFIG_PLAN_003.md）。
ALTER TABLE site_settings ADD COLUMN section_copy_json TEXT NOT NULL DEFAULT '';
