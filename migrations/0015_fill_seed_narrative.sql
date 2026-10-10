-- 0015_fill_seed_narrative.sql
--
-- 背景：0002 的种子把「挑战 / 方案」写进**旧单列**（英文），0011 之后读侧优先 challenge_json /
-- solution_json，于是全新部署里这两段只能按内容猜语言回退到英文、并在中文视图标「原文」；
-- 而内置回退数据（frontend/src/data/fallbackProjects.ts）里同一批标本是**成对双语**的
-- —— 同一件标本出现两套内容，取决于接口通不通。
--
-- 这里把成对文案补进 JSON 列，两条自我约束：
--   1) 只在列为空时填（库值优先，绝不覆盖已有内容——和 0012 协议列同一个原则）；
--   2) 只认种子行（repository 指向 github.com/nestspace/*），不碰任何真实项目。
-- 文案与 frontend/src/data/fallbackProjects.ts 逐字相同，改那一边时这里没有副本可改——
-- 它只跑一次，之后以库为准。
-- 001 Aperture
UPDATE projects SET challenge_json = '{"en":"Creative teams were spending more time maintaining image tooling than shaping the work itself. Existing pipelines were powerful, but configuration-heavy and difficult to reproduce.","zh":"创意团队花在维护图片工具链上的时间，多过打磨作品本身。既有管线足够强大，但配置繁重、结果难以复现。"}'
 WHERE id = '001' AND repository LIKE 'github.com/nestspace/%' AND (challenge_json IS NULL OR challenge_json = '');
UPDATE projects SET solution_json = '{"en":"Aperture turns a folder of source material into a deterministic, production-ready image set through one concise command and a human-readable manifest.","zh":"Aperture 用一条简短命令和一份人能直接读懂的清单，把一整目录的源素材变成确定、可上线的图片集。"}'
 WHERE id = '001' AND repository LIKE 'github.com/nestspace/%' AND (solution_json IS NULL OR solution_json = '');

-- 002 Lumen
UPDATE projects SET challenge_json = '{"en":"Edge applications needed useful traces without shipping a full observability stack or exposing customer data.","zh":"边缘应用想要有用的链路记录，却不愿为此打包整套可观测性方案，也不能暴露客户数据。"}'
 WHERE id = '002' AND repository LIKE 'github.com/nestspace/%' AND (challenge_json IS NULL OR challenge_json = '');
UPDATE projects SET solution_json = '{"en":"Lumen captures a minimal set of structured signals at the edge, then assembles them into readable traces close to the developer workflow.","zh":"Lumen 在边缘只采集最小一组结构化信号，再在离开发者工作流最近的地方拼成可读的链路。"}'
 WHERE id = '002' AND repository LIKE 'github.com/nestspace/%' AND (solution_json IS NULL OR solution_json = '');

-- 003 Fjord
UPDATE projects SET challenge_json = '{"en":"Small internal services inherited deployment complexity designed for systems many times their size.","zh":"规模很小的内部服务，却继承了为大它许多的系统设计的部署复杂度。"}'
 WHERE id = '003' AND repository LIKE 'github.com/nestspace/%' AND (challenge_json IS NULL OR challenge_json = '');
UPDATE projects SET solution_json = '{"en":"Fjord packages process supervision, service discovery, and local persistence into a portable runtime with deliberately narrow boundaries.","zh":"Fjord 把进程守护、服务发现和本地持久化收进一个可移植的运行时，边界刻意划得很窄。"}'
 WHERE id = '003' AND repository LIKE 'github.com/nestspace/%' AND (solution_json IS NULL OR solution_json = '');

-- 004 Meridian
UPDATE projects SET challenge_json = '{"en":"Conventional search flattened rich visual collections into ranked lists and removed their sense of place.","zh":"常规检索把丰富的视觉收藏压成排序列表，也抹掉了它们的空间感。"}'
 WHERE id = '004' AND repository LIKE 'github.com/nestspace/%' AND (challenge_json IS NULL OR challenge_json = '');
UPDATE projects SET solution_json = '{"en":"Meridian combines a compact spatial index with interaction primitives for maps, canvases, timelines, and exploratory archives.","zh":"Meridian 用一个紧凑的空间索引，加上面向地图、画布、时间线与探索式档案的交互原语。"}'
 WHERE id = '004' AND repository LIKE 'github.com/nestspace/%' AND (solution_json IS NULL OR solution_json = '');
