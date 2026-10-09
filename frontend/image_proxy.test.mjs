// 图片代理纯函数单测（Node 22+ 直接运行：node image_proxy.test.mjs）
// 覆盖：宽度参数夹取、图源白名单（防开放代理/SSRF）、转换服务地址构造。
// 不发起任何网络请求。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROUTE_URL = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), 'worker', 'index.ts'),
).href

const { normalizeImageWidth, isProxyableImageHost, buildWeservUrl } = await import(ROUTE_URL)

// ============================================
// 1. 宽度参数规范化
// ============================================
assert.equal(normalizeImageWidth('160'), 160, 'case 1a: 合法宽度原样')
assert.equal(normalizeImageWidth(undefined), 1600, 'case 1b: 缺失用默认值')
assert.equal(normalizeImageWidth('abc'), 1600, 'case 1c: 非法用默认值')
assert.equal(normalizeImageWidth('0'), 64, 'case 1d: 过小夹到下限')
assert.equal(normalizeImageWidth('99999'), 2000, 'case 1e: 过大夹到上限')
assert.equal(normalizeImageWidth('160.6'), 161, 'case 1f: 小数取整')
assert.equal(normalizeImageWidth('-40'), 64, 'case 1g: 负数夹到下限')

// ============================================
// 2. 图源白名单（这层是防开放代理 / SSRF 的关键）
// ============================================
assert.equal(isProxyableImageHost('raw.githubusercontent.com'), true, 'case 2a: GitHub raw 放行')
assert.equal(isProxyableImageHost('RAW.GitHubusercontent.com'), true, 'case 2b: 大小写无关')
assert.equal(isProxyableImageHost('cdn.jsdelivr.net'), true, 'case 2c: jsDelivr 放行')
assert.equal(isProxyableImageHost('evil.example.com'), false, 'case 2d: 任意主机被拒')
assert.equal(isProxyableImageHost(''), false, 'case 2e: 空值被拒')
assert.equal(isProxyableImageHost(undefined), false, 'case 2f: 缺失被拒')
assert.equal(isProxyableImageHost('127.0.0.1'), false, 'case 2g: 环回地址被拒')
assert.equal(isProxyableImageHost('localhost'), false, 'case 2h: localhost 被拒')
assert.equal(isProxyableImageHost('169.254.169.254'), false, 'case 2i: 云元数据地址被拒')
assert.equal(isProxyableImageHost('raw.githubusercontent.com.evil.com'), false, 'case 2j: 后缀伪装被拒')
// 转换服务自身绝不能进白名单：否则 ?src=https://wsrv.nl/?url=<任意地址> 就绕过了整套限制
assert.equal(isProxyableImageHost('wsrv.nl'), false, 'case 2k: 转换服务自身不在白名单（防白名单被绕过）')
assert.equal(isProxyableImageHost('images.weserv.nl'), false, 'case 2l: 转换服务别名域名同样被拒')

// ============================================
// 3. 转换服务地址构造
// ============================================
const src = 'https://raw.githubusercontent.com/o/r/main/docs/a.png?v=2'
const built = buildWeservUrl(src, 160)
assert.ok(built.startsWith('https://wsrv.nl/?'), 'case 3a: 指向转换服务')
const parsed = new URL(built)
assert.equal(parsed.searchParams.get('w'), '160', 'case 3b: 带宽度')
assert.equal(parsed.searchParams.get('output'), 'webp', 'case 3c: 统一压成 webp')
assert.equal(
  parsed.searchParams.get('url'),
  src,
  'case 3d: 源地址（含查询串）被正确编码后再解出',
)

console.log('image_proxy：全部用例通过（宽度夹取 / 图源白名单 / 转换地址构造）✓')
