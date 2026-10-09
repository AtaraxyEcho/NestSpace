// GitHub 同步字段归属规则的单测（Node 22+ 直接运行：node sync_update.test.mjs）
// 覆盖：GitHub 权威字段的覆盖口径、编辑性字段的"只填空白"、文档抓取跳过规则、
//       星数格式统一、仓库地址解析（含非 GitHub 主机拒绝）。
// 该测试不发起任何网络请求：全部针对导出的纯函数。
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

// 本文件在 frontend/test/ 下：模块与源码都在上一级 frontend/，而迁移目录再往上一级（仓库根）
const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..')

const ROUTE_URL = pathToFileURL(join(FRONTEND, 'worker', 'index.ts')).href

const {
  buildProjectSyncUpdate,
  buildTimelineEvents,
  parseGithubRepo,
  isNonGithubHost,
  formatStarCount,
  extractPreviewImages,
  parsePreviewImages,
  sanitizeImageUrl,
  validatePreviewInput,
  previewFieldsFromBody,
  adminProjectRow,
  EDITABLE_COLUMNS,
  EDITABLE_JSON_COLUMNS,
  resolveRepoAssetUrl,
  buildRepoLikePattern,
} = await import(ROUTE_URL)

// 封面 = 相册第一张（生产代码只维护 extractPreviewImages 一处实现）
const firstImage = (md, owner, repo, branch) =>
  extractPreviewImages(md, owner, repo, branch)[0] ?? ''

const baseRow = (over = {}) => ({
  id: '001',
  name: 'Aperture',
  repository: 'github.com/nestspace/aperture',
  description_json: '{"en":"","zh":""}',
  has_readme_zh: 0,
  has_readme_en: 0,
  has_compose_dev: 0,
  has_compose_prod: 0,
  ...over,
})

const meta = (over = {}) => ({
  stargazers_count: 2800,
  forks_count: 145,
  open_issues_count: 7,
  pushed_at: '2026-09-30T12:00:00Z',
  created_at: '2023-04-18T08:00:00Z',
  language: 'TypeScript',
  description: 'A quiet image pipeline',
  topics: ['cli', 'images', 'rust', 'pipeline', 'extra-topic'],
  ...over,
})

const RELEASES = [
  { tag_name: 'v2.4.1', name: 'Autumn release', published_at: '2026-09-01T00:00:00Z' },
]

const docs = (over = {}) => ({
  readmeZh: '',
  readmeEn: '',
  composeDev: '',
  composeProd: '',
  ...over,
})

// ============================================
// 1. 星数格式统一（stars 字段与指标卡必须同口径）
// ============================================
assert.equal(formatStarCount(2800), '2.8k', 'case 1a: ≥1000 用一位小数 k')
assert.equal(formatStarCount(500), '500', 'case 1b: <1000 原样')
assert.equal(formatStarCount(0), '0', 'case 1c: 0 原样')
assert.equal(formatStarCount(undefined), '0', 'case 1d: 缺失按 0')
assert.equal(formatStarCount(-3), '0', 'case 1e: 负数按 0')

const basic = buildProjectSyncUpdate(baseRow(), meta(), RELEASES, null)
assert.equal(basic.columns.stars, '2.8k', 'case 2a: GitHub 权威 → stars 覆盖')
const metrics = JSON.parse(String(basic.columns.metrics_json))
assert.deepEqual(
  metrics,
  [
    { label: 'STARS', value: '2.8k' },
    { label: 'FORKS', value: '145' },
    { label: 'OPEN ISSUES', value: '7' },
  ],
  'case 2b: 指标卡与 stars 同口径（不再出现 2.8k 与 2800 并存）',
)
assert.equal(basic.columns.updated, '2026.09.30', 'case 2c: pushed_at → updated（点号分隔）')
assert.equal(basic.columns.version, 'v2.4.1', 'case 2d: Release tag → version')
assert.equal(basic.columns.language, 'TypeScript', 'case 2e: 仓库主语言 → language')
assert.equal(basic.columns.date, '2023.04', 'case 2f: created_at → date')
assert.equal(basic.columns.year, '2023', 'case 2g: created_at → year')

// ============================================
// 2. topics → features（前 4 个；无 topics 时不写，保留现有内容）
// ============================================
assert.deepEqual(
  JSON.parse(String(basic.columns.features_json)),
  ['cli', 'images', 'rust', 'pipeline'],
  'case 3a: topics 取前 4 个写入 features',
)
const noTopics = buildProjectSyncUpdate(baseRow(), meta({ topics: [] }), [], null)
assert.equal('features_json' in noTopics.columns, false, 'case 3b: 无 topics 时不覆盖已有特性')
const blankTopics = buildProjectSyncUpdate(baseRow(), meta({ topics: ['  ', 'ok'] }), [], null)
assert.deepEqual(JSON.parse(String(blankTopics.columns.features_json)), ['ok'], 'case 3c: 空白 topic 被剔除')

// ============================================
// 3. 描述与文档：编辑性字段只填空白，绝不覆盖手写内容
// ============================================
assert.deepEqual(
  JSON.parse(String(basic.columns.description_json)),
  // 英文仓库描述只进 en 栏：同塞两种语言会让"当前语言有内容"成立，
  // 中文站于是把英文简介当中文文案显示，连「原文」标注都不给
  { en: 'A quiet image pipeline', zh: '' },
  'case 4a: 整对为空时首次填充（按内容猜一种语言）',
)
assert.ok(basic.notes.some((n) => n.includes('描述已按仓库信息首次填充')), 'case 4b: 填充有说明')

const zhDesc = buildProjectSyncUpdate(
  baseRow(),
  meta({ description: '面向个人与家庭自托管场景' }),
  RELEASES,
  null,
)
assert.deepEqual(
  JSON.parse(String(zhDesc.columns.description_json)),
  { en: '', zh: '面向个人与家庭自托管场景' },
  'case 4a2: 中文描述只进 zh 栏（与导入路径同一口径，不再一边 {t,t} 一边 {t,""}）',
)

const ownCopy = buildProjectSyncUpdate(
  baseRow({ description_json: '{"en":"EN copy","zh":"中文文案"}' }),
  meta(),
  RELEASES,
  null,
)
assert.equal('description_json' in ownCopy.columns, false, 'case 4c: 已有文案 → 不写描述列')
assert.ok(ownCopy.notes.some((n) => n.includes('描述已保留')), 'case 4d: 保留有说明')

const tolerant = buildProjectSyncUpdate(baseRow(), meta(), null, null)
assert.equal(tolerant.columns.stars, '2.8k', 'case 4f: releases 传 null 不崩（GitHub 返回值不受控）')
assert.equal('timeline_json' in tolerant.columns, true, 'case 4g: 传 null 时时间线仍由仓库事实生成')

const noDesc = buildProjectSyncUpdate(baseRow(), meta({ description: '' }), [], null)
assert.equal('description_json' in noDesc.columns, false, 'case 4e: 仓库无描述 → 不写')

const withDocs = buildProjectSyncUpdate(
  baseRow(),
  meta(),
  [],
  docs({ readmeEn: '# EN', composeDev: 'services:' }),
)
assert.equal(withDocs.columns.readme_en, '# EN', 'case 5a: 空白文档被填充')
assert.equal(withDocs.columns.compose_dev, 'services:', 'case 5b: compose 同样填充')
assert.ok(typeof withDocs.columns.docs_synced_at === 'string' && withDocs.columns.docs_synced_at.length > 0, 'case 5c: 抓取过就刷新时间戳')
assert.ok(withDocs.notes.some((n) => n.includes('文档已填充')), 'case 5d: 填充有说明')

const keepDocs = buildProjectSyncUpdate(
  baseRow({ has_readme_en: 1, has_compose_dev: 1, has_readme_zh: 1, has_compose_prod: 1 }),
  meta(),
  [],
  docs({ readmeEn: '# 新的', composeDev: 'new:', readmeZh: 'zh', composeProd: 'prod' }),
)
assert.equal('readme_en' in keepDocs.columns, false, 'case 5e: 已有文档不覆盖')
assert.equal('readme_zh' in keepDocs.columns, false, 'case 5f: 已有中文文档不覆盖')
assert.ok(keepDocs.notes.some((n) => n.includes('文档均已存在')), 'case 5g: 提示"均已存在"')
assert.ok(keepDocs.notes.every((n) => !n.includes('已填充')), 'case 5h: 不谎报填充')

const nothingFetched = buildProjectSyncUpdate(baseRow(), meta(), [], docs())
assert.ok(
  nothingFetched.notes.some((n) => n.includes('未抓到文档')),
  'case 5i: 一个文件都没抓到 → 如实提示（不谎称"已存在"）',
)
assert.ok(typeof nothingFetched.columns.docs_synced_at === 'string', 'case 5j: 抓取过仍刷新时间戳')

// ============================================
// 4. 仓库地址解析（非 GitHub 主机必须拒绝）
// ============================================
assert.deepEqual(parseGithubRepo('github.com/o/r'), { owner: 'o', repo: 'r' }, 'case 6a: 无协议 github.com')
assert.deepEqual(parseGithubRepo('o/r'), { owner: 'o', repo: 'r' }, 'case 6b: 纯 owner/repo')
assert.deepEqual(parseGithubRepo('https://github.com/o/r.git'), { owner: 'o', repo: 'r' }, 'case 6c: 带 .git')
assert.deepEqual(parseGithubRepo('git@github.com:o/r'), { owner: 'o', repo: 'r' }, 'case 6d: SSH 形式')
assert.deepEqual(parseGithubRepo('https://github.com/o/r/tree/main'), { owner: 'o', repo: 'r' }, 'case 6e: 带子路径')
assert.equal(parseGithubRepo('gitlab.com/o/r'), null, 'case 6f: gitlab 被拒绝')
assert.equal(parseGithubRepo('https://bitbucket.org/o/r'), null, 'case 6g: bitbucket 被拒绝')
assert.equal(parseGithubRepo(''), null, 'case 6h: 空值')
assert.equal(parseGithubRepo('o'), null, 'case 6i: 只有一段')
assert.equal(parseGithubRepo('https://github.com/../etc/passwd'), null, 'case 6j: 路径穿越被拒绝')
assert.equal(isNonGithubHost('gitlab.com/o/r'), true, 'case 7a: 识别非 GitHub 主机')
assert.equal(isNonGithubHost('o/r'), false, 'case 7b: 无主机名不算')
assert.equal(isNonGithubHost('github.com/o/r'), false, 'case 7c: github.com 不算')

// 查重用的 LIKE 模式形状：两端必须是**真通配符**，只转义中间的 owner/repo。
// 反例（曾写错）：连两端一起转义 → `\%o/r\%`，LIKE 变成字面量匹配，命中 0 行、查重失效。
const likePattern = buildRepoLikePattern('AtaraxyEcho', 'my_repo')
assert.equal(likePattern, '%AtaraxyEcho/my\\_repo%', 'case 7d: 两端留通配符，中间的 _ 被转义')
assert.ok(likePattern.startsWith('%') && !likePattern.startsWith('\\%'), 'case 7e: 开头的 % 不能被转义')
assert.ok(likePattern.endsWith('%') && !likePattern.endsWith('\\%'), 'case 7f: 结尾的 % 不能被转义')
assert.equal(buildRepoLikePattern('o', 'a%b'), '%o/a\\%b%', 'case 7g: 中间出现的 % 也要转义')

// ============================================
// 5. 时间线：由 GitHub 事实生成（建档 / Release / 最近推送）
// ============================================
const created = { created_at: '2023-04-18T08:00:00Z', pushed_at: '2026-09-30T12:00:00Z', full_name: 'nestspace/aperture' }
const tl = buildTimelineEvents(created, RELEASES)
assert.equal(tl.length, 3, 'case 8a: 建档 + 1 个 Release + 最近推送 = 3 条')
assert.deepEqual(tl.map((e) => e.date), ['2026.09', '2026.09', '2023.04'], 'case 8b: 按月份倒序')
assert.equal(tl[0].title, 'Release v2.4.1', 'case 8c: Release 标题带 tag')
assert.equal(tl[0].note, 'Autumn release', 'case 8d: Release 说明取 Release 名称')
assert.ok(tl[2].note.includes('nestspace/aperture'), 'case 8e: 建档说明带仓库全名')

const noName = buildTimelineEvents(created, [
  { tag_name: 'v1.0.0', published_at: '2024-01-05T00:00:00Z' },
])
assert.equal(
  noName.find((e) => e.title === 'Release v1.0.0').note,
  'Tagged v1.0.0 on GitHub.',
  'case 8f: Release 无名称时给出 tag 说明（按标题定位，事件是倒序的）',
)

const sameMonth = buildTimelineEvents(
  { created_at: '2024-05-02T00:00:00Z', pushed_at: '2024-05-20T00:00:00Z' },
  [],
)
assert.equal(sameMonth.length, 1, 'case 8g: 建档月与推送月相同 → 不重复一条')

const noMeta = buildTimelineEvents({}, [])
assert.equal(noMeta.length, 0, 'case 8h: 无任何时间字段 → 空时间线（不编造）')

const skipped = buildTimelineEvents(created, [
  { tag_name: '', published_at: '2026-01-01T00:00:00Z' },
  { tag_name: 'v9.9.9' },
])
assert.equal(skipped.length, 2, 'case 8i: 缺 tag 或缺发布时间的 Release 被跳过（只剩建档+推送）')

const capped = buildTimelineEvents(created, [
  { tag_name: 'a', published_at: '2026-09-01T00:00:00Z' },
  { tag_name: 'b', published_at: '2026-08-01T00:00:00Z' },
  { tag_name: 'c', published_at: '2026-07-01T00:00:00Z' },
  { tag_name: 'd', published_at: '2026-06-01T00:00:00Z' },
  { tag_name: 'e', published_at: '2026-05-01T00:00:00Z' },
])
assert.equal(capped.filter((e) => e.title.startsWith('Release')).length, 4, 'case 8j: Release 事件最多取 4 条')

const withTimeline = buildProjectSyncUpdate(baseRow(), meta(), RELEASES, null)
const stored = JSON.parse(String(withTimeline.columns.timeline_json))
assert.equal(stored.length, 3, 'case 9a: 同步会写入 timeline_json')
assert.equal(stored[0].title, 'Release v2.4.1', 'case 9b: 落库时间线含真实 Release')

// ============================================
// 6. 预览图提取（README 首图；跳过徽章与 SVG 图标）
// ============================================
assert.equal(
  firstImage('![shot](https://cdn.example.com/a.png)', 'o', 'r', 'main'),
  'https://cdn.example.com/a.png',
  'case 10a: 绝对地址原样使用',
)
assert.equal(
  firstImage('![shot](./docs/a.png)', 'o', 'r', 'main'),
  'https://raw.githubusercontent.com/o/r/main/docs/a.png',
  'case 10b: 相对路径按默认分支解析',
)
assert.equal(
  firstImage('<img src="docs/b.png" width="600" />', 'o', 'r', 'master'),
  'https://raw.githubusercontent.com/o/r/master/docs/b.png',
  'case 10c: HTML img 同样识别，分支取自 default_branch',
)
assert.equal(
  firstImage(
    `![build](https://img.shields.io/badge/build-passing-green)
![shot](docs/c.png)`,
    'o',
    'r',
    'main',
  ),
  'https://raw.githubusercontent.com/o/r/main/docs/c.png',
  'case 10d: 跳过 shields.io 徽章，取下一张',
)
assert.equal(
  firstImage('![logo](docs/logo.svg)', 'o', 'r', 'main'),
  'https://raw.githubusercontent.com/o/r/main/docs/logo.svg',
  'case 10e: 只有矢量图时仍可用（位图优先）',
)
assert.equal(
  firstImage(
    `![logo](docs/logo.svg)
![shot](docs/shot.png)`,
    'o',
    'r',
    'main',
  ),
  'https://raw.githubusercontent.com/o/r/main/docs/shot.png',
  'case 10f: 有位图时优先位图',
)
assert.equal(firstImage('no image here', 'o', 'r', 'main'), '', 'case 10g: 没有图片返回空串（不编造）')
assert.equal(firstImage('', 'o', 'r', 'main'), '', 'case 10h: 空文本返回空串')
assert.equal(
  resolveRepoAssetUrl('data:image/png;base64,AAAA', 'o', 'r', 'main'),
  '',
  'case 11a: data: 内联资源不作为预览图',
)
assert.equal(
  resolveRepoAssetUrl('//cdn.example.com/a.png', 'o', 'r', 'main'),
  'https://cdn.example.com/a.png',
  'case 11b: 协议相对地址补 https',
)
assert.equal(
  resolveRepoAssetUrl('/docs/a.png', 'o', 'r', 'main'),
  'https://raw.githubusercontent.com/o/r/main/docs/a.png',
  'case 11c: 以 / 开头的仓库内绝对路径',
)

const withPreview = buildProjectSyncUpdate(
  baseRow({ has_preview: 0, has_preview_images: 0, readme_head_en: '![shot](docs/x.png)' }),
  meta(),
  [],
  null,
)
assert.equal(
  withPreview.columns.preview_image_url,
  'https://raw.githubusercontent.com/nestspace/aperture/main/docs/x.png',
  'case 12a: 文档已齐时也能从 README 头部片段提取封面',
)
assert.deepEqual(
  JSON.parse(String(withPreview.columns.preview_images_json)),
  ['https://raw.githubusercontent.com/nestspace/aperture/main/docs/x.png'],
  'case 12a2: 同一趟同时写相册',
)
const keepPreview = buildProjectSyncUpdate(
  baseRow({ has_preview: 1, has_preview_images: 1, readme_head_en: '![other](docs/y.png)' }),
  meta(),
  [],
  null,
)
assert.equal('preview_image_url' in keepPreview.columns, false, 'case 12b: 已有封面不覆盖')
assert.equal('preview_images_json' in keepPreview.columns, false, 'case 12b2: 已有相册不覆盖')

const galleryOnlyMissing = buildProjectSyncUpdate(
  baseRow({ has_preview: 1, has_preview_images: 0, readme_head_en: '![a](docs/a.png)\n![b](docs/b.png)' }),
  meta(),
  [],
  null,
)
assert.equal('preview_image_url' in galleryOnlyMissing.columns, false, 'case 12c: 已有封面时不改写封面')
assert.deepEqual(
  JSON.parse(String(galleryOnlyMissing.columns.preview_images_json)),
  [
    'https://raw.githubusercontent.com/nestspace/aperture/main/docs/a.png',
    'https://raw.githubusercontent.com/nestspace/aperture/main/docs/b.png',
  ],
  'case 12d: 仅相册为空时补齐相册（多张，顺序保持）',
)

// ============================================
// 7. 相册提取与解析（多张 / 去重 / 上限 / 白名单）
// ============================================
const multi = extractPreviewImages(
  `![s1](docs/one.png)
![s2](docs/two.png)
![s3](https://cdn.example.com/three.png)`,
  'o',
  'r',
  'main',
)
assert.deepEqual(
  multi,
  [
    'https://raw.githubusercontent.com/o/r/main/docs/one.png',
    'https://raw.githubusercontent.com/o/r/main/docs/two.png',
    'https://cdn.example.com/three.png',
  ],
  'case 13a: 多张按出现顺序返回（绝对地址原样保留）',
)
assert.deepEqual(
  extractPreviewImages('![a](docs/a.png)\n![a](docs/a.png)', 'o', 'r', 'main'),
  ['https://raw.githubusercontent.com/o/r/main/docs/a.png'],
  'case 13b: 同一地址去重',
)
assert.deepEqual(
  extractPreviewImages('', 'o', 'r', 'main'),
  [],
  'case 13c: 没有图片返回空数组（不编造）',
)
assert.deepEqual(
  extractPreviewImages(
    `![build](https://img.shields.io/badge/build-passing-green)
![logo](docs/logo.svg)
![s1](docs/s1.png)
![s2](docs/s2.png)`,
    'o',
    'r',
    'main',
  ),
  [
    'https://raw.githubusercontent.com/o/r/main/docs/s1.png',
    'https://raw.githubusercontent.com/o/r/main/docs/s2.png',
    'https://raw.githubusercontent.com/o/r/main/docs/logo.svg',
  ],
  'case 13d: 徽章排除；位图在前、矢量收尾；多张顺序不变',
)
const many = extractPreviewImages(
  Array.from({ length: 15 }, (_, i) => `![s${i}](docs/s${i}.png)`).join('\n'),
  'o',
  'r',
  'main',
)
assert.equal(many.length, 12, 'case 13e: 相册最多 12 张')
assert.equal(many[0], 'https://raw.githubusercontent.com/o/r/main/docs/s0.png', 'case 13f: 截断保留最前面的图')

assert.equal(
  sanitizeImageUrl('data:image/png;base64,AAAA'),
  '',
  'case 14a: data: 被丢弃',
)
assert.equal(sanitizeImageUrl('javascript:alert(1)'), '', 'case 14b: javascript: 被丢弃')
assert.equal(sanitizeImageUrl('docs/a.png'), '', 'case 14c: 相对路径不算合法绝对地址')
assert.equal(sanitizeImageUrl('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png', 'case 14d: http(s) 放行')
assert.equal(sanitizeImageUrl('https://'), '', 'case 14e: 空壳地址（无主机名）被拒')
assert.equal(sanitizeImageUrl(['https://a.example/1.png', 'https://a.example/2.png']), '', 'case 14f: 数组不当作单个地址')

assert.deepEqual(
  parsePreviewImages('["https://a.example/1.png","javascript:alert(1)","https://a.example/1.png"]'),
  ['https://a.example/1.png'],
  'case 15a: JSON 字符串解析 + 白名单 + 去重',
)
assert.deepEqual(parsePreviewImages('not json'), [], 'case 15b: 坏 JSON 退化为空数组')
assert.deepEqual(parsePreviewImages('{"a":1}'), [], 'case 15c: 非数组退化为空数组')
assert.deepEqual(parsePreviewImages(undefined), [], 'case 15d: 空值退化为空数组')
assert.deepEqual(parsePreviewImages([1, null, 'https://a.example/x.png']), ['https://a.example/x.png'], 'case 15e: 非字符串项被剔除')

// ============================================
// 8. 管理端写入校验（宁 400 不静默丢条：否则后台会出现假状态）
// ============================================
const okGallery = validatePreviewInput(
  ['https://a.example/1.png', 'https://a.example/2.png'],
  'https://a.example/1.png',
)
assert.equal(okGallery.ok, true, 'case 16a: 合法数组 + 合法封面通过')
assert.deepEqual(okGallery.gallery, ['https://a.example/1.png', 'https://a.example/2.png'], 'case 16b: 原样保留顺序')

const jsonSource = validatePreviewInput('["https://a.example/1.png"]', undefined)
assert.equal(jsonSource.ok, true, 'case 16c: 接受 JSON 字符串形式')
assert.deepEqual(jsonSource.gallery, ['https://a.example/1.png'], 'case 16d: JSON 字符串解析正确')

const noScheme = validatePreviewInput(['https://a.example/1.png', 'example.com/2.png'], undefined)
assert.equal(noScheme.ok, false, 'case 16e: 缺协议的行被拒绝')
assert.ok(String(noScheme.error).includes('第 2 行'), `case 16f: 错误信息点名行号（实际：${noScheme.error}）`)

const dup = validatePreviewInput(['https://a.example/1.png', 'https://a.example/1.png'], undefined)
assert.equal(dup.ok, false, 'case 16g: 重复条目被拒绝（而不是静默去重）')
assert.ok(String(dup.error).includes('重复'), 'case 16h: 说明是重复')

const tooMany = validatePreviewInput(
  Array.from({ length: 13 }, (_, i) => `https://a.example/${i}.png`),
  undefined,
)
assert.equal(tooMany.ok, false, 'case 16i: 超过 12 张被拒绝（而不是静默截断）')
assert.ok(String(tooMany.error).includes('13'), 'case 16j: 报出实际张数')

assert.equal(validatePreviewInput('not json', undefined).ok, false, 'case 16k: 坏 JSON 被拒绝')
assert.equal(validatePreviewInput('{"a":1}', undefined).ok, false, 'case 16l: 非数组被拒绝')
assert.equal(validatePreviewInput([42], undefined).ok, false, 'case 16m: 非字符串项被拒绝')
assert.equal(validatePreviewInput(undefined, 'ftp://a.example/x').ok, false, 'case 16n: 非法协议封面被拒绝')

const emptyBoth = validatePreviewInput(undefined, undefined)
assert.deepEqual(emptyBoth, { ok: true, gallery: [], cover: '' }, 'case 16o: 两者都不传 → 空值合法')

const clearedCover = validatePreviewInput(['https://a.example/1.png'], '')
assert.equal(clearedCover.ok, true, 'case 16p: 显式清空项目图片是合法写法')
// 关键不变量（改版）：项目图片不再由相册第一张推导。
// 旧行为会让后台显示"项目图片为空"而库里存了首张（假状态），也让"调整相册顺序"意外改掉大图。
// 自动补齐只允许发生在 README 同步的「只填空白」路径（见 buildProjectSyncUpdate）。
assert.equal(clearedCover.cover, '', 'case 16r: 显式空封面保持为空，不取相册首张')
assert.equal(
  validatePreviewInput(['https://a.example/1.png'], undefined).cover,
  '',
  'case 16s: 未提供该键时也不凭空造封面',
)
assert.equal(
  validatePreviewInput(undefined, '').cover,
  '',
  'case 16t: 本次不带相册时，清空就是清空',
)
assert.equal(
  validatePreviewInput(['https://a.example/1.png'], 'https://keep.example/x.png').cover,
  'https://keep.example/x.png',
  'case 16u: 显式项目图片不被相册首张覆盖',
)

// —— 同一列两种拼写（camel 投影名 vs snake 原始列名）的取舍 ——
// 管理端只应提交 snake；camel 只出现在误用公开投影的场景。两者同时出现且不一致时
// 必须由服务端拒绝，而不是挑一个——挑错就是"界面显示 A、库里存 B"。
const bothSame = previewFieldsFromBody({
  previewImages: ['https://a.example/1.png'],
  preview_images_json: JSON.stringify(['https://a.example/1.png']),
})
assert.equal(bothSame.error, undefined, 'case 16v: 两种拼写内容一致 → 放行')
assert.deepEqual(
  bothSame.gallery,
  JSON.stringify(['https://a.example/1.png']),
  'case 16v: 一致时取的是管理端那份原值（不是 camel 的那份）',
)
const bothDiffer = previewFieldsFromBody({
  previewImages: ['https://a.example/1.png', 'https://a.example/2.png'],
  preview_images_json: JSON.stringify(['https://a.example/9.png']),
})
assert.equal(bothDiffer.error !== undefined, true, 'case 16w: 两种拼写内容不一致 → 拒绝写入')
assert.ok(/previewImages/.test(bothDiffer.error), 'case 16w: 错误信息点名两种写法')
const onlySnake = previewFieldsFromBody({ preview_images_json: '[]', preview_image_url: '' })
assert.deepEqual(
  { gallery: onlySnake.gallery, cover: onlySnake.cover },
  { gallery: '[]', cover: '' },
  'case 16x: 只给 snake 时原样透传（空串也算"提供了该键"）',
)
const onlyCamel = previewFieldsFromBody({ previewImages: ['https://a.example/1.png'] })
assert.deepEqual(
  parsePreviewImages(onlyCamel.gallery),
  ['https://a.example/1.png'],
  'case 16y: 只给 camel（旧客户端）仍可写，不因为改名而失败',
)
assert.deepEqual(
  previewFieldsFromBody({}),
  { gallery: undefined, cover: undefined },
  'case 16z: 两者都没给 → undefined，交给"部分更新不写该列"的语义',
)
assert.deepEqual(
  previewFieldsFromBody({ previewImages: null, previewImageUrl: null }),
  { gallery: undefined, cover: undefined },
  'case 16z2: null 视为"没提供"（当提供会静默清空相册/项目图片，与部分更新语义冲突）',
)
// 「13 张」「含非法项」「含重复项」这类差异必须被抓出来：
// 早先用宽松的 parsePreviewImages 归一化比较，会把它们抹平成"看起来一样"，坏的那一份被静默丢掉。
const overCap = previewFieldsFromBody({
  previewImages: Array.from({ length: 13 }, (_, i) => `https://a.example/${i}.png`),
  preview_images_json: JSON.stringify(Array.from({ length: 12 }, (_, i) => `https://a.example/${i}.png`)),
})
assert.match(overCap.error || '', /previewImages/, 'case 16aa: 超上限的坏值要点名是哪个键')
const badItem = previewFieldsFromBody({
  previewImages: ['ftp://a.example/x'],
  preview_images_json: '[]',
})
assert.match(badItem.error || '', /previewImages/, 'case 16ab: 非法协议同样要点名')
const dupItem = previewFieldsFromBody({
  previewImages: ['https://a.example/1.png', 'https://a.example/1.png'],
  preview_images_json: JSON.stringify(['https://a.example/1.png']),
})
assert.match(dupItem.error || '', /previewImages/, 'case 16ac: 折叠重复项不能被当成"一致"')
const coverConflict = previewFieldsFromBody({
  previewImageUrl: 'https://a.example/other.png',
  preview_image_url: 'https://a.example/mine.png',
})
assert.match(coverConflict.error || '', /previewImageUrl/, 'case 16ad: 项目图片两种拼写不一致同样拒绝（上一版零覆盖）')
const coverAgree = previewFieldsFromBody({
  previewImageUrl: 'https://a.example/mine.png',
  preview_image_url: ' https://a.example/mine.png ',
})
assert.equal(coverAgree.error, undefined, 'case 16ae: 只差首尾空格算同一个值')
assert.equal(coverAgree.cover, ' https://a.example/mine.png ', 'case 16ae: 一致时保留管理端原值')

// —— 管理端列表投影必须覆盖抽屉能编辑的全部字段 ——
// 这条就是"保存后再次打开没有回显"的根因守卫：公开投影缺这些列，
// 一旦管理端误用公开接口（或两个接口共用一份状态），README/Compose/相册/排序会整片变空。
// 种子行按「可编辑字段全集」生成：它能抓住"投影吃掉/改名某一列"，
// 抓不住"SQL 从 SELECT * 换成漏列的显式清单"——那种回归由下面的 case 17e 钉。
const adminSeed = {}
for (const field of Object.keys(EDITABLE_COLUMNS)) adminSeed[field] = `值-${field}`
for (const field of Object.keys(EDITABLE_JSON_COLUMNS)) {
  adminSeed[`${field}_json`] = field === 'description' ? '{"en":"e","zh":"中"}' : '[]'
}
Object.assign(adminSeed, {
  id: '001',
  demo_enabled: 1,
  demo_url: 'https://demo.example',
  features_json: '["f1"]',
  metrics_json: '[{"label":"L","value":"V"}]',
  timeline_json: '[{"date":"2024.01","title":"T","note":"N"}]',
  internal_notes: '笔记',
  sort_order: 3,
  docs_synced_at: '2024-09-01T00:00:00Z',
  preview_image_url: 'https://a.example/cover.png',
  preview_images_json: '["https://a.example/cover.png"]',
})
const adminRow = adminProjectRow({ ...adminSeed, name: 'Aperture' })
const requiredKeys = [
  ...Object.keys(EDITABLE_COLUMNS),
  ...Object.keys(EDITABLE_JSON_COLUMNS),
  'preview_images_json',
  'preview_image_url',
  'docs_synced_at',
  'demoEnabled',
  'demoUrl',
]
for (const key of requiredKeys) {
  assert.equal(
    adminRow[key] !== undefined,
    true,
    `case 17a: 管理端投影缺字段「${key}」会让编辑抽屉整片空白（回显 bug 的根因）`,
  )
}
assert.equal(adminRow.demoEnabled, true, 'case 17b: 0/1 转布尔只在管理端投影里做')
assert.deepEqual(adminRow.features, ['f1'], 'case 17c: JSON 列在投影里已摊平成数组')
assert.equal(adminRow.readme_zh, '值-readme_zh', 'case 17d: 原始列名保留是刻意为之（抽屉绑的就是它）')
// 上面的守卫看不到 SQL：如果哪天把 SELECT * 换成显式列清单并漏掉一列，投影守卫仍然全绿
// （种子是我们在测试里手工造的，压根没走 SQL）。这条直接把"仍取全列"钉在源码上。
const workerSrc = readFileSync(join(FRONTEND, 'worker', 'index.ts'), 'utf8')
assert.match(
  workerSrc,
  /SELECT \* FROM projects ORDER BY sort_order/,
  'case 17e: 管理端列表必须是整行取回（改成显式列清单时要同步扩这条断言的清单）',
)

// case 17f：**代码引用的列必须真的存在于 migrations/**
// 动机（本轮实测到的真实风险）：公开列表/详情把 challenge_json / solution_json 写进了显式 SELECT，
// 而生产库当时还没跑 0011 —— 一旦"新 Worker 先上、迁移后跑"，SQLite 直接 `no such column`，
// 公开接口 500，而前端会把接口失败**静默退化成内置的 4 条 fallback 标本**（App.tsx 的
// `if (projects && projects.length > 0) setItems(projects)`），于是线上不是报错页、是内容悄悄变少。
// 这条闸门把"代码列 ⊆ 迁移列"钉住，顺序错了在 CI 就红，不必等到部署后才发现。
const MIGRATIONS_DIR = join(FRONTEND, '..', 'migrations')
const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

/** 从迁移文本里收集每张表被创建或被 ADD COLUMN 的列名 */
function columnsByMigration(files) {
  const map = new Map()
  const add = (table, column) => {
    const key = table.toLowerCase()
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(column.toLowerCase())
  }
  for (const name of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8').replace(
      /--[^\n]*/g,
      '',
    )
    for (const m of sql.matchAll(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/gi)) {
      add(m[1], m[2])
    }
    // CREATE TABLE 的列清单不能按"第一个右括号"截断：`CHECK (id = 1)` 里就有一对括号。
    // 按括号深度扫到真正的收尾，否则整表列会被解析成只剩第一列（实测踩过）。
    for (const start of sql.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s*\(/gi)) {
      const table = start[1]
      const from = start.index + start[0].length
      let depth = 1
      let end = from
      while (end < sql.length && depth > 0) {
        const ch = sql[end]
        if (ch === '(') depth += 1
        else if (ch === ')') depth -= 1
        end += 1
      }
      const body = sql.slice(from, end - 1)
      for (const line of body.split(',')) {
        const col = /^\s*`?(\w+)`?\s+(\w+)/.exec(line)
        if (col && !/^(primary|unique|foreign|check|constraint)$/i.test(col[2])) add(table, col[1])
      }
    }
  }
  return map
}

/** 从一条 SELECT 里抽出"被引用的列名"：先剥掉字符串、括号表达式与 AS 别名，再按标识符切 */
const SQL_NOISE_WORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'as', 'asc', 'desc',
  'order', 'limit', 'group', 'by', 'having', 'distinct', 'case', 'when', 'then', 'else', 'end',
  'count', 'sum', 'max', 'min', 'substr', 'length', 'coalesce', 'exists', 'union', 'all', 'like',
  'set', 'values', 'update', 'delete', 'insert', 'into', 'on', 'join', 'left', 'inner',
])

function columnsReferenced(selectSql) {
  const stripped = selectSql
    .replace(/'[^']*'/g, " '' ")
    .replace(/\$\{[^}]*\}/g, ' 0 ')
    .replace(/\b\w+\s+AS\s+\w+/gi, ' ')
    .replace(/\bas\s+\w+/gi, ' ')
  let work = stripped
  for (let i = 0; i < 8; i += 1) {
    // 反复剥掉最内层括号内容：(readme_zh <> '')、substr(readme_en, 1, 2000) 这类表达式不是列
    const next = work.replace(/\([^()]*\)/g, ' ')
    if (next === work) break
    work = next
  }
  const out = new Set()
  const tokens = work.match(/[A-Za-z_][A-Za-z_0-9$]*(?:\.[A-Za-z_][A-Za-z_0-9$]*)?/g) || []
  for (const token of tokens) {
    for (const part of token.split('.')) {
      const lower = part.toLowerCase()
      if (part === '') continue
      if (/^\d+$/.test(part)) continue
      if (SQL_NOISE_WORDS.has(lower)) continue
      out.add(lower)
    }
  }
  return out
}

const tableColumns = columnsByMigration(migrationFiles)
// 只扫"字符串里的 SQL"，不做注释剥离：源码里有一句中文注释写着「绝不 SELECT *」，
// 用正则去注释反而会把真正的 SQL 模板一起吞掉（实测踩过）。要求 SELECT 紧跟在引号/反引号之后。
const sqlLiterals = workerSrc.match(/`[\s\S]*?`|'[^'\n]*'|"[^"\n]*"/g) || []
const seenStatements = new Set()
for (const literal of sqlLiterals) {
  const m = /^\s*SELECT([\s\S]*?)\bFROM\s+(\w+)/i.exec(literal.slice(1, -1))
  if (!m) continue
  const [, columnText, rawTable] = m
  const table = rawTable.toLowerCase()
  if (table === 'sqlite_master' || table === 'd1_executions') continue
  const known = tableColumns.get(table)
  assert.ok(known, `case 17f: migrations/ 里找不到表 ${table}（代码却在 SELECT 它）`)
  for (const column of columnsReferenced(columnText)) {
    const key = `${table}.${column}`
    if (seenStatements.has(key)) continue
    seenStatements.add(key)
    assert.ok(
      known.has(column),
      `case 17f: 代码引用了 ${table}.${column}，但 migrations/ 里没有这条列 —— ` +
        `部署时必须先补迁移，否则接口 500 且前端静默退回内置数据`,
    )
  }
}
// 提取器是**保守**的：括号表达式里的列（`(readme_zh <> '')`、`substr(readme_en, ...)`）会被剥掉，
// 所以它只核"裸列清单"。这意味着它可能少查，但不会误报。为了不让"少查"退化成"整条静默通过"，
// 这里点名几个必须被覆盖到的列——它们正是本轮 0011 新加的那两列所在的语句。
for (const sentinel of [
  'projects.challenge_json',
  'projects.solution_json',
  'projects.preview_images_json',
  'projects.demo_url',
  'site_settings.github_url',
]) {
  assert.ok(seenStatements.has(sentinel), `case 17f: 提取器没扫到 ${sentinel}，闸门本身失效了`)
}

console.log('sync_update：全部用例通过（字段归属 / 格式口径 / 文档规则 / 地址解析 / 时间线 / 预览图 / 相册 / 写入校验 / 两种拼写冲突 / 管理端投影字段集）✓')
