// 预览图「按目录批量导入」的纯函数单测（Node 22+ 直接运行：node preview_dir.test.mjs）
// 覆盖：目录地址解析（raw / github tree/blob / 省略协议 / 分支名带斜杠 / 非 GitHub 拒绝）、
//       Contents 条目的位图筛选、排序稳定性、raw 地址拼接、异常输入不抛错。
// 不发起任何网络请求：路由里的 GitHub 调用不在本文件测试范围。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROUTE_URL = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'worker', 'index.ts'),
).href

const { parsePreviewDirUrl, pickBitmapEntries } = await import(ROUTE_URL)

const cases = []
const check = (name, fn) => cases.push([name, fn])

// —— 目录地址解析 ——
check('用户给的那种 raw 目录地址：拆成 owner/repo/ref/path', () => {
  const p = parsePreviewDirUrl(
    'raw.githubusercontent.com/AtaraxyEcho/OmniNest/main/imgs/desktop',
  )
  assert.equal(p.owner, 'AtaraxyEcho')
  assert.equal(p.repo, 'OmniNest')
  assert.deepEqual(p.candidates[0], { ref: 'main', path: 'imgs/desktop' })
})

check('带协议与 www 一样能解析', () => {
  const a = parsePreviewDirUrl('https://raw.githubusercontent.com/o/r/main/imgs')
  const b = parsePreviewDirUrl('https://www.raw.githubusercontent.com/o/r/main/imgs')
  assert.deepEqual(a.candidates[0], { ref: 'main', path: 'imgs' })
  assert.deepEqual(b.candidates[0], { ref: 'main', path: 'imgs' })
})

check('github.com 的 tree / blob 形态与 raw 形态同构', () => {
  assert.deepEqual(
    parsePreviewDirUrl('https://github.com/o/r/tree/main/imgs/mobile').candidates[0],
    { ref: 'main', path: 'imgs/mobile' },
  )
  assert.deepEqual(
    parsePreviewDirUrl('https://github.com/o/r/blob/main/imgs/mobile').candidates[0],
    { ref: 'main', path: 'imgs/mobile' },
  )
})

check('省略域名（owner/repo/ref/path）也能解析', () => {
  const p = parsePreviewDirUrl('AtaraxyEcho/OmniNest/main/imgs/desktop')
  assert.equal(p.owner, 'AtaraxyEcho')
  assert.deepEqual(p.candidates[0], { ref: 'main', path: 'imgs/desktop' })
})

check('分支名带斜杠时给一个「整段当路径 + 默认分支」的候选兜底', () => {
  const p = parsePreviewDirUrl('raw.githubusercontent.com/o/r/feat/screens/imgs')
  assert.deepEqual(p.candidates, [
    { ref: 'feat', path: 'screens/imgs' },
    { ref: '', path: 'feat/screens/imgs' },
  ])
})

check('只有仓库、没有目录：拒绝（Contents 需要目录路径）', () => {
  assert.equal(parsePreviewDirUrl('https://github.com/o/r'), null)
  assert.equal(parsePreviewDirUrl('raw.githubusercontent.com/o/r/main'), null)
  assert.equal(parsePreviewDirUrl(''), null)
  assert.equal(parsePreviewDirUrl(undefined), null)
  assert.equal(parsePreviewDirUrl('   '), null)
})

check('非 GitHub 主机一律拒绝（gitlab 等没有对应的 Contents 实现）', () => {
  assert.equal(parsePreviewDirUrl('https://gitlab.com/o/r/-/main/imgs'), null)
  assert.equal(parsePreviewDirUrl('cdn.example.com/o/r/main/imgs'), null)
})

check('owner/repo 含非法字符时拒绝，不会拼出越权地址', () => {
  assert.equal(parsePreviewDirUrl('raw.githubusercontent.com/o/../evil/main/imgs'), null)
  assert.equal(parsePreviewDirUrl('raw.githubusercontent.com/o r/x/main/imgs'), null)
})

// —— Contents 条目筛选 ——
const entry = (name, path, type = 'file') => ({ name, path, type })

check('只取位图，svg/md/目录被分开计数', () => {
  const r = pickBitmapEntries(
    [
      entry('b-second.png', 'imgs/b-second.png'),
      entry('a-first.JPG', 'imgs/a-first.JPG'),
      entry('icon.svg', 'imgs/icon.svg'),
      entry('notes.md', 'imgs/notes.md'),
      entry('nested', 'imgs/nested', 'dir'),
      entry('shot.webp', 'imgs/shot.webp'),
    ],
    'o',
    'r',
    'main',
  )
  assert.deepEqual(r.images, [
    'https://raw.githubusercontent.com/o/r/main/imgs/a-first.JPG',
    'https://raw.githubusercontent.com/o/r/main/imgs/b-second.png',
    'https://raw.githubusercontent.com/o/r/main/imgs/shot.webp',
  ])
  assert.equal(r.subDirectories, 1)
  assert.equal(r.skippedNonBitmap, 2) // svg + md
})

check('按文件名排序，顺序不依赖 GitHub 返回顺序', () => {
  const shuffled = [entry('z.png', 'imgs/z.png'), entry('a.png', 'imgs/a.png'), entry('m.png', 'imgs/m.png')]
  const r = pickBitmapEntries(shuffled, 'o', 'r', 'main')
  assert.deepEqual(r.images.map((u) => u.split('/').pop()), ['a.png', 'm.png', 'z.png'])
})

check('徽章样式的路径被排除并单独计数', () => {
  const r = pickBitmapEntries(
    [entry('build-badge.png', 'imgs/build-badge.png'), entry('real.png', 'imgs/real.png')],
    'o',
    'r',
    'main',
  )
  assert.deepEqual(r.images, ['https://raw.githubusercontent.com/o/r/main/imgs/real.png'])
  assert.equal(r.skippedBadge, 1)
})

check('没给分支时用 GitHub 自带的 download_url（它带真实默认分支），不自己猜 main', () => {
  const r = pickBitmapEntries(
    [{ name: 'a.png', path: 'imgs/a.png', type: 'file', download_url: 'https://raw.githubusercontent.com/o/r/release-25/imgs/a.png' }],
    'o',
    'r',
    '',
  )
  assert.deepEqual(r.images, ['https://raw.githubusercontent.com/o/r/release-25/imgs/a.png'])
})

check('没给分支且没有 download_url → 宁可丢弃，也不拼一个可能 404 的 main 地址', () => {
  assert.deepEqual(pickBitmapEntries([entry('a.png', 'imgs/a.png')], 'o', 'r', '').images, [])
})

check('download_url 的主机不由我们说了算：非 raw.githubusercontent.com 一律丢', () => {
  const r = pickBitmapEntries(
    [
      { name: 'a.png', path: 'imgs/a.png', type: 'file', download_url: 'https://evil.example.com/a.png' },
      { name: 'b.png', path: 'imgs/b.png', type: 'file', download_url: 'https://raw.githubusercontent.com/o/r/dev/b.png' },
    ],
    'o',
    'r',
    '',
  )
  assert.deepEqual(r.images, ['https://raw.githubusercontent.com/o/r/dev/b.png'])
})

check('给了分支时仍按 owner/repo/分支/路径 自己拼（不受 download_url 影响）', () => {
  const r = pickBitmapEntries(
    [{ name: 'a.png', path: 'imgs/a.png', type: 'file', download_url: 'https://raw.githubusercontent.com/o/r/other/a.png' }],
    'o',
    'r',
    'v1',
  )
  assert.deepEqual(r.images, ['https://raw.githubusercontent.com/o/r/v1/imgs/a.png'])
})

check('条目 path 为空或含 . / .. 时丢弃，不拼出以斜杠结尾或穿越路径的地址', () => {
  const r = pickBitmapEntries(
    [
      { name: '', path: '', type: 'file', download_url: '' },
      { name: 'up.png', path: '../secrets/up.png', type: 'file', download_url: 'https://raw.githubusercontent.com/o/r/main/up.png' },
      entry('ok.png', 'imgs/ok.png'),
    ],
    'o',
    'r',
    '',
  )
  assert.deepEqual(r.images, [])
  const withRef = pickBitmapEntries(
    [
      { name: 'up.png', path: '../secrets/up.png', type: 'file' },
      entry('ok.png', 'imgs/ok.png'),
    ],
    'o',
    'r',
    'main',
  )
  assert.deepEqual(withRef.images, ['https://raw.githubusercontent.com/o/r/main/imgs/ok.png'])
})

check('文件名里的空格被规范化成 %20，地址仍是可直接访问的绝对 URL', () => {
  const r = pickBitmapEntries([entry('my shot.png', 'imgs/my shot.png')], 'o', 'r', 'main')
  assert.equal(r.images.length, 1)
  assert.match(r.images[0], /imgs\/my%20shot\.png$/)
})

check('非数组 / 元素形状怪异 / 非文件条目：都不抛错，退化为空', () => {
  assert.deepEqual(pickBitmapEntries(undefined, 'o', 'r', 'main').images, [])
  assert.deepEqual(pickBitmapEntries('not an array', 'o', 'r', 'main').images, [])
  assert.deepEqual(pickBitmapEntries([null, 1, 'x', {}, { type: 'file' }], 'o', 'r', 'main').images, [])
})

check('只有 name 没有 path 的条目退回用 name（目录内文件名即相对路径）', () => {
  const r = pickBitmapEntries([{ name: 'solo.png', type: 'file' }], 'o', 'r', 'v1')
  assert.deepEqual(r.images, ['https://raw.githubusercontent.com/o/r/v1/solo.png'])
})

let failed = 0
for (const [name, fn] of cases) {
  try {
    fn()
  } catch (err) {
    failed++
    console.error(`✗ ${name}\n  ${err.message}`)
  }
}
if (failed) {
  console.error(`preview_dir：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(`preview_dir：全部 ${cases.length} 个用例通过（目录解析 / 位图筛选 / 排序 / 地址拼接 / 异常兜底）✓`)
