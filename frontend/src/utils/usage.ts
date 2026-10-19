/**
 * 匿名使用度量：事件名与方式由 worker 的 USAGE_EVENTS 白名单裁决，白名单外一律 400 且被这里吞掉。
 * 落点：worker 侧写入 D1 的访问台账（按天聚合）；客户端只负责发事件。
 *
 * 为什么值得为它单开一个文件：改版前没有任何度量，"观察台有没有让人多看几张图"、
 * "批量导入有没有真的减少手工粘贴"都无法回答。这里的调用**永远不该影响用户**——
 * 没有 fetch、被 CSP 拦、离线、服务端限流，全部静默失败，不产生控制台错误或界面提示。
 *
 * 访客口径：localStorage 里一个随机匿名 ID（不含设备信息），跨天稳定，
 * 服务端用 HMAC 派生后去重。清缓存/隐私模式/多设备会各算一个新访客，这是 UV 的固有误差。
 */

import { readLocal, writeLocal, removeLocal, readSession, writeSession } from './safeStorage'
import { sharedCookieDomain } from './siteHost'
import { entrySourceOf } from './visitStats'

export type UsageEvent = 'deck' | 'imgfail' | 'dirimport' | 'pageview' | 'specimen_open' | 'outbound'

const ENDPOINT = '/api/usage'
const VISITOR_KEY = 'nestspace_visitor_id'
const OPTOUT_KEY = 'nestspace_stats_optout'
const OPTOUT_COOKIE = 'nestspace_stats_optout'
const OPTOUT_MAX_AGE = 31536000
const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// 会话入口来源的缓存键；`-` 表示"这段会话查过，确实没有外部来源"
// （sessionStorage 的读接口分不出"没存过"和"存了空串"）
const ENTRY_SOURCE_KEY = 'nestspace_entry_source'
const NO_ENTRY_SOURCE = '-'

let cachedVisitorId: string | null = null

function newVisitorId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
  } catch {
    // 生成失败就只记 PV，不记 UV
  }
  return ''
}

function visitorId(): string {
  if (cachedVisitorId !== null) return cachedVisitorId
  const stored = readLocal(VISITOR_KEY)
  if (VISITOR_ID_RE.test(stored)) {
    cachedVisitorId = stored.toLowerCase()
    return cachedVisitorId
  }
  const created = newVisitorId()
  if (created) {
    writeLocal(VISITOR_KEY, created)
    cachedVisitorId = created
  }
  return created
}

/**
 * 管理端在 `admin.<主域>`、公开站在 `<主域>`，两边的 localStorage 不互通。
 * 生产环境用一枚 Domain=<主域> 的功能性偏好 cookie，让公开站也读到同一个开关；
 * 本地 / IP / 托管预览域没有兄弟域，退回 localStorage（同源本来就能互通）。
 */
function cookieDomain(): string {
  try {
    return sharedCookieDomain(String(globalThis.location?.hostname ?? ''))
  } catch {
    // 无 window（测试/SSR）时退回 localStorage
    return ''
  }
}

function readOptOutCookie(): string {
  try {
    const prefix = `${OPTOUT_COOKIE}=`
    const entry = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
    return entry ? decodeURIComponent(entry.slice(prefix.length)) : ''
  } catch {
    return ''
  }
}

function writeOptOutCookie(optOut: boolean, domain: string): void {
  try {
    const secure = globalThis.location?.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${OPTOUT_COOKIE}=${optOut ? '1' : ''}; Domain=${domain}; Path=/; Max-Age=${
      optOut ? OPTOUT_MAX_AGE : 0
    }; SameSite=Lax${secure}`
  } catch {
    // cookie 被禁用时由 setStatsOptOut 的回读判定失败
  }
}

/** 这台设备是否已选择不计入访问（管理端面板可切换） */
export function isStatsOptOut(): boolean {
  return readLocal(OPTOUT_KEY) === '1' || readOptOutCookie() === '1'
}

/**
 * 写入排除开关；返回是否真的生效（存储被禁用时会返回 false，由界面明说）。
 * 有跨子域 cookie 时两层都要核对：只写进当前 origin 的 localStorage
 * 不能证明公开站也排除了；任一层失败都回滚到调用前，避免"界面说没生效、
 * 刷新后却发现仍被排除"的假状态。
 */
export function setStatsOptOut(optOut: boolean): boolean {
  const wasOptOut = isStatsOptOut()
  const domain = cookieDomain()
  if (optOut) writeLocal(OPTOUT_KEY, '1')
  else removeLocal(OPTOUT_KEY)
  if (domain) writeOptOutCookie(optOut, domain)

  const localOk = (readLocal(OPTOUT_KEY) === '1') === optOut
  const cookieOk = domain ? (readOptOutCookie() === '1') === optOut : true
  if (localOk && cookieOk) return true

  if (wasOptOut) writeLocal(OPTOUT_KEY, '1')
  else removeLocal(OPTOUT_KEY)
  if (domain) writeOptOutCookie(wasOptOut, domain)
  return false
}

/** 主机名只保留可安全进数据集的形态，其余（带路径/查询/超长）当没给 */
function safeHost(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return /^[a-z0-9.-]{1,63}$/.test(host) ? host : ''
  } catch {
    return ''
  }
}

/**
 * 这一段会话的入口来源（站外主机名），整段会话的每次 pageview 都带同一个值。
 * 缓存在 sessionStorage 里（按标签页隔离，正好就是"这一段会话"）；存储被禁用时逐次重读
 * `document.referrer`，结论一样——SPA 切换不会改它。
 */
function entrySourceHost(): string {
  const cached = readSession(ENTRY_SOURCE_KEY)
  if (cached) return cached === NO_ENTRY_SOURCE ? '' : cached
  const host = entrySourceOf(
    typeof document === 'undefined' ? '' : document.referrer,
    globalThis.location?.hostname,
  )
  writeSession(ENTRY_SOURCE_KEY, host || NO_ENTRY_SOURCE)
  return host
}

export function trackUsage(
  event: UsageEvent,
  method?: string,
  host?: string,
  ref?: string,
  source?: string,
): void {
  if (isStatsOptOut()) return
  if (typeof navigator === 'undefined' && typeof fetch === 'undefined') return
  let payload: string
  try {
    payload = JSON.stringify({
      e: event,
      m: method ?? '',
      h: host ?? '',
      r: ref ?? '',
      v: visitorId(),
      s: source ?? '',
    })
  } catch {
    return
  }
  try {
    // sendBeacon 连页面正在卸载时也能发出，且不受 CORS 预检影响；没有再退到 keepalive fetch
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ENDPOINT, payload)
      return
    }
    if (typeof fetch === 'function') {
      void fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: payload,
        keepalive: true,
        credentials: 'omit',
      }).catch(() => {})
    }
  } catch {
    // 埋点失败对用户不可见
  }
}

/** 取图失败：<img onError> 直接调这个，主机名用于定位是哪个图源在坏 */
export const trackImageFailure = (url: string) => trackUsage('imgfail', '', safeHost(url))

/** 看了哪个页面；详情页把标本编号带上，深链打开也能知道是哪一件 */
export const trackPageView = (surface: 'home' | 'detail' | 'admin', ref?: string) => {
  // 先判排除再取来源：被排除的浏览不该往 sessionStorage 里留任何痕迹
  if (isStatsOptOut()) return
  trackUsage('pageview', surface, '', ref ?? '', entrySourceHost())
}

/** 从哪个位置打开某件标本（card 陈列卡 / index 目录行 / related 相邻标本 / footer 页脚清单） */
export const trackSpecimenOpen = (surface: 'card' | 'index' | 'related' | 'footer', id: string) =>
  trackUsage('specimen_open', surface, '', id)

/** 真的出站了（github / demo）：与 specimen_open 相除就是转化率 */
export const trackOutbound = (kind: 'github' | 'demo', id: string) =>
  trackUsage('outbound', kind, '', id)
