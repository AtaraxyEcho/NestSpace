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

const { buildProjectSyncUpdate, buildTimelineEvents, parseGithubRepo, isNonGithubHost, formatStarCount } =
  await import(ROUTE_URL)

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

console.log('sync_update：全部用例通过（字段归属 / 格式口径 / 文档规则 / 地址解析 / 时间线）✓')
