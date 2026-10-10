// 壳层守卫（首屏主题 / 浏览器存储）的闸门（node shell_guards.test.mjs）
//
// 为什么需要它：这两处都在"JS 还没起来"或"JS 可能根本跑不动"的时刻起作用，出错的表现是
// 系统深色访客先看到一片浅色（或反过来），以及禁用存储的浏览器整站白屏——都不容易在开发机上复现。
// 深色取值的两份副本更是典型的"改一处忘另一处"陷阱，所以这里逐项比对。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (...p) => readFileSync(join(FRONTEND, ...p), 'utf8')

const css = read('src', 'index.css')
const cases = []
const check = (name, fn) => cases.push([name, fn])

/** 抽出某个规则块里的 `--var: value` 声明（含行内注释前的值） */
function declarations(block) {
  const map = {}
  for (const line of block.split('\n')) {
    const m = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line)
    if (m) map[m[1]] = m[2].trim()
  }
  return map
}

const light = declarations(css.match(/:root \{([\s\S]*?)\n\}/)[1])
const dark = declarations(css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1])
const media = declarations(
  css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\) \{([\s\S]*?)\n  \}/)[1],
)

check('深色的两份副本（显式主题 / 跟随系统）逐项相同', () => {
  // 哨兵：块被改名或删空时下面就成了"两个空对象相等"，闸门会绿得毫无意义
  assert.ok(Object.keys(dark).length >= 15, `深色变量只剩 ${Object.keys(dark).length} 条，闸门失效`)
  assert.deepEqual(media, dark, '改深色变量时两处必须一起改')
})

check('深色用到的每个变量在浅色里都有定义（否则切主题会掉回继承值）', () => {
  for (const name of Object.keys(dark)) {
    assert.ok(name in light, `${name} 只在深色里定义`)
  }
})

check('跟随系统的兜底只在"还没打标记"时生效', () => {
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\)/, '缺 :not([data-theme]) 就会覆盖访客/站点的选择')
})

check('Worker 只在显式 dark/light 时往 <html> 上注入 data-theme', () => {
  const worker = read('worker', 'index.ts')
  assert.match(worker, /SELECT seo_title, seo_description, default_theme FROM site_settings/, '没有把 default_theme 读出来')
  assert.match(worker, /const theme = seo\.theme === 'dark' \|\| seo\.theme === 'light' \? seo\.theme : ''/, '缺少"仅显式值才注入"的判据')
  assert.match(worker, /out\.replace\(\/<html\\b\[\^>\]\*>\/i/, '没有改写 <html> 标签')
})

check('App 的首屏主题优先采信已注入的标记，避免挂载后再翻一次', () => {
  const app = read('src', 'App.tsx')
  assert.match(app, /function initialDark\(\)/, '缺少 initialDark')
  assert.match(app, /document\.documentElement\.dataset\.theme/, '没有读注入的 data-theme')
  assert.match(app, /useState\(initialDark\)/, '首屏主题没有走 initialDark')
})

// ——— 浏览器存储：读发生在 render 期，抛一次就是整站白屏 ———

const storage = await import(pathToFileURL(join(FRONTEND, 'src', 'utils', 'safeStorage.ts')).href)
const { readSession, writeSession, clearSession } = storage

check('存储不可用时读返回空串、写/清不抛错', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get() {
      throw new Error('SecurityError: storage disabled')
    },
  })
  try {
    assert.equal(readSession('any'), '')
    writeSession('any', 'value')
    clearSession('any')
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original)
    else delete globalThis.sessionStorage
  }
})

check('存储可用时原样读写', () => {
  const store = new Map()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
  })
  try {
    writeSession('k', 'v')
    assert.equal(readSession('k'), 'v')
    clearSession('k')
    assert.equal(readSession('k'), '')
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original)
    else delete globalThis.sessionStorage
  }
})

let failed = 0
for (const [name, fn] of cases) {
  try {
    fn()
  } catch (err) {
    failed += 1
    console.error(`  ✗ ${name}\n    ${err.message}`)
  }
}
if (failed) {
  console.error(`shell_guards：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(
  `shell_guards：全部 ${cases.length} 个用例通过（深色两份取值一致 / 注入与首屏取值同源 / 存储不可用不白屏）✓`,
)
