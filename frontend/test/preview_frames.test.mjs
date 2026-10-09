// 观察台「哪几张牌在场」与「牌面文字」的纯函数单测（Node 22+ 直接运行：node preview_frames.test.mjs）
// 覆盖：环形邻居去重、后牌 +N 的张数口径、越界 active 的夹取、URL → 文件名/目录 的解析与解码兜底。
// 该测试不发起任何网络请求，也不碰浏览器：只针对导出的纯函数。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROUTE_URL = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'utils', 'previewFrames.ts'),
).href

const { previewFrames, hiddenFrameCount, frameLabel } = await import(ROUTE_URL)

const pos = (total, active) => previewFrames(total, active).map((f) => `${f.index}:${f.position}`)
const cases = []
const check = (name, fn) => cases.push([name, fn])

// —— 在场张数与位置 ——
check('0 张：不渲染任何牌', () => {
  assert.deepEqual(previewFrames(0, 0), [])
  assert.equal(hiddenFrameCount(0, 0), 0)
})

check('1 张：只有主牌，没有侧牌与后牌', () => {
  assert.deepEqual(pos(1, 0), ['0:active'])
  assert.equal(hiddenFrameCount(1, 0), 0)
})

check('2 张：环形取到的 next 与 previous 是同一张，去重后只剩一张侧牌', () => {
  assert.deepEqual(pos(2, 0), ['0:active', '1:next'])
  assert.deepEqual(pos(2, 1), ['1:active', '0:next'])
  assert.equal(hiddenFrameCount(2, 0), 0)
})

check('3 张：主牌 + 左右邻，不取后牌', () => {
  assert.deepEqual(pos(3, 0), ['0:active', '1:next', '2:previous'])
  assert.deepEqual(pos(3, 2), ['2:active', '0:next', '1:previous'])
  assert.equal(hiddenFrameCount(3, 1), 0)
})

check('4 张：四张全在场，往后没藏（不显示 +0）', () => {
  assert.deepEqual(pos(4, 0), ['0:active', '1:next', '3:previous', '2:back'])
  assert.equal(hiddenFrameCount(4, 0), 0)
})

check('5 张：四张在场，藏 1 张', () => {
  assert.equal(previewFrames(5, 0).length, 4)
  assert.equal(hiddenFrameCount(5, 0), 1)
})

check('12 张：在场四张 = 主牌/右邻/左邻/后牌，后牌标 +8', () => {
  assert.deepEqual(pos(12, 0), ['0:active', '1:next', '11:previous', '2:back'])
  assert.equal(hiddenFrameCount(12, 0), 8)
})

check('环形回绕：最后一张的右邻是第 1 张', () => {
  assert.deepEqual(pos(12, 11), ['11:active', '0:next', '10:previous', '1:back'])
})

check('越界 active：夹回最后一张而不是取到 undefined', () => {
  assert.deepEqual(pos(5, 99), ['4:active', '0:next', '3:previous', '1:back'])
  assert.deepEqual(pos(5, -2), ['0:active', '1:next', '4:previous', '2:back'])
})

check('不变量：1–20 张 × 每个位置都只有一张主牌、无重复、最多 4 张在场', () => {
  for (let total = 1; total <= 20; total++) {
    for (let active = 0; active < total; active++) {
      const frames = previewFrames(total, active)
      const indices = frames.map((f) => f.index)
      assert.equal(new Set(indices).size, indices.length, `${total}/${active} 出现重复牌`)
      assert.ok(indices.length <= 4, `${total}/${active} 在场张数超了`)
      assert.equal(
        frames.filter((f) => f.position === 'active').length,
        1,
        `${total}/${active} 主牌数量不对`,
      )
      assert.equal(frames[0].index, active, `${total}/${active} 主牌必须排在最前`)
      assert.equal(
        hiddenFrameCount(total, active),
        total - indices.length,
        `${total}/${active} +N 口径不对`,
      )
      for (const f of frames) {
        assert.ok(f.index >= 0 && f.index < total, `${total}/${active} 索引越界`)
        assert.ok(['active', 'next', 'previous', 'back'].includes(f.position))
      }
      const back = frames.filter((f) => f.position === 'back')
      assert.equal(back.length, total > 3 ? 1 : 0, `${total}/${active} 后牌该有就有、该没有就没有`)
    }
  }
})

// —— 牌面文字：只从 URL 自身取 ——
check('raw.githubusercontent 地址：标题是文件名，目录是 pathname 去掉文件', () => {
  const l = frameLabel(
    'https://raw.githubusercontent.com/AtaraxyEcho/nestspace/HEAD/docs/screens/preview-home.png',
    'Fjord',
  )
  assert.equal(l.title, 'preview-home')
  assert.equal(l.path, 'AtaraxyEcho/nestspace/HEAD/docs/screens')
})

check('带查询串与多级目录：pathname 与 query 分得开', () => {
  const l = frameLabel('https://example.com/a/b/c/single.svg?v=2', 'Fjord')
  assert.equal(l.title, 'single')
  assert.equal(l.path, 'a/b/c')
})

check('根目录图片：没有目录可显示时退回项目名', () => {
  const l = frameLabel('https://example.com/x.png', 'Aperture')
  assert.equal(l.title, 'x')
  assert.equal(l.path, 'Aperture')
})

check('百分号编码还原；非法转义原样显示（decodeURIComponent 会抛）', () => {
  assert.equal(frameLabel('https://example.com/docs/my%20pic.png', 'Fjord').title, 'my pic')
  assert.equal(frameLabel('https://example.com/docs/100%shot.png', 'Fjord').title, '100%shot')
})

check('大写扩展名与多点文件名：只剥掉最后一段扩展名', () => {
  assert.equal(frameLabel('https://example.com/i/Shot.PNG', 'Fjord').title, 'Shot')
  assert.equal(frameLabel('https://example.com/i/v2.4.1.png', 'Fjord').title, 'v2.4.1')
})

check('无扩展名 / 空路径 / 非 URL：一律有兜底，牌面不会空白', () => {
  assert.equal(frameLabel('https://example.com/img/logo', 'Fjord').title, 'logo')
  assert.equal(frameLabel('https://example.com/', 'Fjord').title, 'Fjord')
  assert.equal(frameLabel('not a url', 'Fjord').title, 'Fjord')
  assert.equal(frameLabel('', 'Fjord').path, 'Fjord')
})

check('+N 的期望值来自独立写死的表，不是 total 减在场张数的恒等式', () => {
  // hiddenFrameCount 目前就是 total - frames.length 实现的；只断言那个等式等于什么都没测。
  // 这张表独立写出"该藏几张"，改坏实现（比如写死 total-4、或阈值改错）会红。
  const table = [
    [1, 0, 0],
    [2, 1, 0],
    [3, 2, 0],
    [4, 0, 0],
    [5, 0, 1],
    [8, 3, 4],
    [12, 0, 8],
    [12, 11, 8],
    [20, 7, 16],
  ]
  for (const [total, active, expected] of table) {
    assert.equal(
      hiddenFrameCount(total, active),
      expected,
      `+N 口径：${total} 张在第 ${active + 1} 张时应藏 ${expected} 张`,
    )
  }
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
  console.error(`preview_frames：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(
  `preview_frames：全部 ${cases.length} 个用例通过（在场张数 / 环形去重 / +N 口径 / 越界夹取 / URL 解析兜底）✓`,
)
