-- 0010_add_preview_image.sql: 项目预览图（详情页「标本托板」相册）
-- 封面 preview_image_url：卡片 / Hero / 分享图用的第一张，取值 = 相册第一张；
-- 相册 preview_images_json：详情页相册展示的有序图片数组（已解析为绝对地址）。
-- 同步/导入时从已抓取的 README 里自动提取全部真实截图（跳过 shields.io 等徽章与 SVG 图标，
-- 位图优先、去重、上限 12 张），相对路径按 raw.githubusercontent.com/<owner>/<repo>/<默认分支>/<path> 解析；
-- 管理端可覆盖；两列都只在「空」时填充，不覆盖管理员填写的内容。
ALTER TABLE projects ADD COLUMN preview_image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN preview_images_json TEXT NOT NULL DEFAULT '[]';
