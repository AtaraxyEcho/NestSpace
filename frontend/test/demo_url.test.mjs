// normalizeDemoUrl 单元测试（Node 22+ 直接运行：node demo_url.test.mjs）
// 覆盖协议白名单、缺协议补全与边界输入；不发起任何网络请求。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROUTE_URL = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'worker', 'index.ts'),
).href

const { normalizeDemoUrl } = await import(ROUTE_URL)

// [输入, 期望值]
const cases = [
  // 缺协议按 https 补全
  ['demo.example.com/app', 'https://demo.example.com/app'],
  ['nestspace.online', 'https://nestspace.online/'],
  // 已带协议原样保留
  ['https://demo.example.com/app', 'https://demo.example.com/app'],
  ['https://demo.example.com/a?b=1#c', 'https://demo.example.com/a?b=1#c'],
  // 允许明文 http（自建演示机常常没有证书）
  ['http://192.168.1.10:8080/app', 'http://192.168.1.10:8080/app'],
  ['http://localhost:8080/demo', 'http://localhost:8080/demo'],
  // 空值 = 未填，返回空串（与"无效"的 null 区分，调用方据此选择 400 还是存空）
  ['', ''],
  ['   ', ''],
  [undefined, ''],
  [null, ''],
  // 拒绝非 http/https 协议：该值会进入公开页面的 href，必须挡住
  ['javascript:alert(1)', null],
  ['JAVASCRIPT:alert(1)', null],
  ['data:text/html,x', null],
  ['vbscript:msgbox(1)', null],
  ['ftp://files.example.com', null],
  ['file:///etc/passwd', null],
  // 拒绝无点裸词与裸 host:port（后者会被当成协议头，必须写明 http://）
  ['abc', null],
  ['localhost:8787/demo', null],
]

let passed = 0
for (const [input, expected] of cases) {
  const actual = normalizeDemoUrl(input)
  assert.equal(
    actual,
    expected,
    `normalizeDemoUrl(${JSON.stringify(input)}) 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`,
  )
  passed += 1
}

// 兜底不变式：任何被接受的地址都必须以 http 或 https 开头
for (const [input] of cases) {
  const accepted = normalizeDemoUrl(input)
  if (accepted) {
    assert.ok(
      accepted.startsWith('http://') || accepted.startsWith('https://'),
      `被接受的地址必须以 http(s) 开头，实际 ${JSON.stringify(accepted)}`,
    )
  }
}

console.log(`normalizeDemoUrl: ${passed} 个用例全部通过（协议白名单 / 补全 / 边界）✓`)
