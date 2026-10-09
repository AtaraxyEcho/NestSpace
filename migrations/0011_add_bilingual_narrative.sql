-- 0011_add_bilingual_narrative.sql: 挑战 / 解决方案 的中英双语文本
-- 现状：challenge / solution 是**单列纯文本**（历史内容基本是中文），所以切到 EN 语言后
-- 详情页这两段仍然显示中文（用户报的问题）。
-- 做法：新增两列存 {en, zh}，沿用 description_json 那一套（EDITABLE_JSON_COLUMNS + 管理端投影）。
-- 旧列不删也不双写，降级为**只读兜底**：新列为空时把旧列的值当中文用（asBilingual 里实现），
-- 因此线上老数据不会因为这次改动而变空，管理员补英文前，EN 站点按 README 的既有规则
-- 回退到中文并标注「原文」。
ALTER TABLE projects ADD COLUMN challenge_json TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN solution_json TEXT NOT NULL DEFAULT '';
