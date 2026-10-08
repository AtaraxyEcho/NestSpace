// GitHub 同步字段归属规则的单测（Node 22+ 直接运行：node sync_update.test.mjs）
// 覆盖：GitHub 权威字段的覆盖口径、编辑性字段的"只填空白"、文档抓取跳过规则、
//       星数格式统一、仓库地址解析（含非 GitHub 主机拒绝）。
// 该测试不发起任何网络请求：全部针对导出的纯函数。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROUTE_URL = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), 'worker', 'index.ts'),
).href

const {
  buildProjectSyncUpdate,
  buildTimelineEvents,
  parseGithubRepo,
  isNonGithubHost,
  formatStarCount,
  extractPreviewImages,
  parsePreviewImages,
  sanitizeImageUrl,
  resolveRepoAssetUrl,
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
  { en: 'A quiet image pipeline', zh: 'A quiet image pipeline' },
  'case 4a: 整对为空时首次填充',
)
assert.ok(basic.notes.some((n) => n.includes('描述已按仓库信息首次填充')), 'case 4b: 填充有说明')

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

assert.deepEqual(
  parsePreviewImages('["https://a.example/1.png","javascript:alert(1)","https://a.example/1.png"]'),
  ['https://a.example/1.png'],
  'case 15a: JSON 字符串解析 + 白名单 + 去重',
)
assert.deepEqual(parsePreviewImages('not json'), [], 'case 15b: 坏 JSON 退化为空数组')
assert.deepEqual(parsePreviewImages('{"a":1}'), [], 'case 15c: 非数组退化为空数组')
assert.deepEqual(parsePreviewImages(undefined), [], 'case 15d: 空值退化为空数组')
assert.deepEqual(parsePreviewImages([1, null, 'https://a.example/x.png']), ['https://a.example/x.png'], 'case 15e: 非字符串项被剔除')

console.log('sync_update：全部用例通过（字段归属 / 格式口径 / 文档规则 / 地址解析 / 时间线 / 预览图 / 相册）✓')
