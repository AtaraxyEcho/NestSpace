-- 项目开源协议：由管理端填写（首页标本卡片右下角展示；留空则不显示）。
-- GitHub 同步会把仓库识别出的 license.spdx_id **填进空白字段**，但不覆盖手工填的值——
-- 协议是"作者怎么授权"的声明，不能让一次同步替作者改口。
ALTER TABLE projects ADD COLUMN license TEXT NOT NULL DEFAULT '';
