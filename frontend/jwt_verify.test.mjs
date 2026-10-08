// verifyAccessJwt 单元测试（Node 22+ 直接运行：node frontend/jwt_verify.test.mjs）
// 注意：本文件必须位于 functions/ 目录之外，否则会被 Cloudflare Pages 当作函数路由模块。
// 通过本地生成 RSA 密钥对 + 伪造证书端点，验证 JWT 校验的各个分支。
// 该测试不发起任何真实网络请求（fetch 被替换为本地桩）。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROUTE_URL = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), 'functions', 'api', '[[route]].ts'),
).href

// 通过追加查询参数导入全新模块实例，隔离各用例的模块级证书缓存状态
let instanceCounter = 0
const loadRoute = async () => import(`${ROUTE_URL}?instance=${++instanceCounter}`)

const TEAM = 'nestspace-test'
const AUD = 'aud-tag-test-1234'

// 1. 生成本地 RSA 密钥对，模拟 Cloudflare Access 的签名证书
const generateKeyPair = () =>
  crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
const keyPair = await generateKeyPair()
const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
publicJwk.kid = 'test-kid'
publicJwk.alg = 'RS256'
publicJwk.use = 'sig'

let certsFormat = 'map' // 'map' | 'array'，覆盖证书端点的两种返回形态
const realFetch = globalThis.fetch
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () =>
    certsFormat === 'map'
      ? { keys: { 'test-kid': publicJwk } }
      : { keys: [publicJwk] },
})

// 2. JWT 构造与签名工具
function b64url(bytes) {
  let bin = ''
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const b64urlJson = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)))
async function signJwt(header, payload, key = keyPair.privateKey) {
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${b64url(sig)}`
}

const now = Math.floor(Date.now() / 1000)
const goodHeader = { alg: 'RS256', kid: 'test-kid', typ: 'JWT' }
const goodPayload = {
  iss: `https://${TEAM}.cloudflareaccess.com`,
  aud: AUD,
  sub: 'user-uuid',
  email: 'curator@example.com',
  iat: now,
  exp: now + 600,
}
const make = (overHeader = {}, overPayload = {}, key) =>
  signJwt({ ...goodHeader, ...overHeader }, { ...goodPayload, ...overPayload }, key)

// ============================================
// 第一组：基础校验分支（单一模块实例）
// ============================================
const { verifyAccessJwt } = await loadRoute()

// 3. 逐项验证各分支
assert.deepStrictEqual(await verifyAccessJwt(await make(), TEAM, AUD), { valid: true }, 'case 1: valid token')

// array 格式证书端点：先以未知 kid 触发一次强制刷新（重新拉取并按数组解析），再验合法令牌
certsFormat = 'array'
assert.deepStrictEqual(
  await verifyAccessJwt(await make({ kid: 'trigger-refresh' }), TEAM, AUD),
  { valid: false, reason: 'unknown_kid' },
  'case 2a: unknown kid triggers certs refetch (array format)',
)
assert.deepStrictEqual(
  await verifyAccessJwt(await make(), TEAM, AUD),
  { valid: true },
  'case 2b: valid token (array-format certs actually parsed)',
)

// 篡改 payload（签名不匹配）——窃贼改写 email 声明后签名必然失效
const validToken = await make()
const [vh, , vs] = validToken.split('.')
assert.deepStrictEqual(
  await verifyAccessJwt(
    `${vh}.${b64urlJson({ ...goodPayload, email: 'attacker@evil.com' })}.${vs}`,
    TEAM,
    AUD,
  ),
  { valid: false, reason: 'bad_signature' },
  'case 3: tampered payload',
)

assert.deepStrictEqual(
  await verifyAccessJwt(await make({}, { aud: 'another-app-aud' }), TEAM, AUD),
  { valid: false, reason: 'bad_aud' },
  'case 4: bad aud',
)
assert.deepStrictEqual(
  await verifyAccessJwt(await make({}, { iss: 'https://evil.cloudflareaccess.com' }), TEAM, AUD),
  { valid: false, reason: 'bad_iss' },
  'case 5: bad iss',
)
assert.deepStrictEqual(
  await verifyAccessJwt(await make({}, { exp: now - 100 }), TEAM, AUD),
  { valid: false, reason: 'expired' },
  'case 6: expired',
)
assert.deepStrictEqual(
  await verifyAccessJwt(await make({}, { iat: now + 500 }), TEAM, AUD),
  { valid: false, reason: 'bad_iat' },
  'case 7: future iat',
)
assert.deepStrictEqual(
  await verifyAccessJwt(await make({ alg: 'HS256' }), TEAM, AUD),
  { valid: false, reason: 'unsupported_alg' },
  'case 8: alg downgrade',
)
assert.deepStrictEqual(
  await verifyAccessJwt(await make({ kid: 'unknown-kid' }), TEAM, AUD),
  { valid: false, reason: 'unknown_kid' },
  'case 9: unknown kid (refresh rate-limited, still rejected)',
)
assert.deepStrictEqual(
  await verifyAccessJwt('not-a-jwt', TEAM, AUD),
  { valid: false, reason: 'malformed' },
  'case 10: malformed',
)
assert.deepStrictEqual(
  await verifyAccessJwt('only.two', TEAM, AUD),
  { valid: false, reason: 'malformed' },
  'case 11: two-part token',
)

// ============================================
// 第二组：证书轮换场景（全新模块实例 = 干净的缓存状态）
// ============================================
const rotatedKeyPair = await generateKeyPair()
const rotatedJwk = await crypto.subtle.exportKey('jwk', rotatedKeyPair.publicKey)
rotatedJwk.kid = 'rotated-kid'
rotatedJwk.alg = 'RS256'
rotatedJwk.use = 'sig'

let serveRotatedCerts = false
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () =>
    serveRotatedCerts
      ? { keys: { 'rotated-kid': rotatedJwk } }
      : { keys: { 'test-kid': publicJwk } },
})

const { verifyAccessJwt: verifyFresh } = await loadRoute()

// 先用旧证书验证一枚旧令牌，把旧公钥写入模块缓存
assert.deepStrictEqual(
  await verifyFresh(await make(), TEAM, AUD),
  { valid: true },
  'case 12a: old cert cached',
)
// 模拟 Cloudflare 轮换签名证书：端点改为返回新公钥，攻击面/正常流量随后改用新 kid 签名
serveRotatedCerts = true
// 5 分钟限频窗口在全新实例中尚未消耗 → 未知 kid 应触发强制刷新并取回新证书，验证通过
assert.deepStrictEqual(
  await verifyFresh(
    await make({ kid: 'rotated-kid' }, {}, rotatedKeyPair.privateKey),
    TEAM,
    AUD,
  ),
  { valid: true },
  'case 12b: cert rotation handled via forced refresh',
)

globalThis.fetch = realFetch
console.log('All 13 JWT verification cases passed (incl. array-format certs & key rotation) ✓')
