// 访问统计的纯判据：Worker 与管理端共用，可在 Node 里直接测（无 DOM、无 Workers API）。
//
// 口径刻意保守：设备、语言、来源、国家都只落粗分类，
// 目的只有一个——回答"多少人、看了什么、从哪来"，而不是重建某个人的浏览轨迹。

export type VisitDevice = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'other'

// 爬虫判据：客户端埋点天然挡掉大多数不跑 JS 的爬虫，这里拦的是会跑 JS 的那些（以及回放/探针工具）。
// 刻意不用裸 `bot` 子串：CUBOT 等真实手机品牌会含 "BOT"，那会把真人统计成爬虫。
const BOT_RE =
  /(?:googlebot|bingbot|yandexbot|duckduckbot|baiduspider|applebot|petalbot|bytespider|gptbot|claudebot|ccbot|perplexitybot|semrushbot|ahrefsbot|mj12bot|dotbot|adsbot|mediapartners-google|facebookexternalhit|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|embedly|pinterestbot|bot\/|crawler|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|curl\/|wget\/|python-requests|node-fetch)/i
const TABLET_RE = /ipad|tablet|kindle|playbook|silk/i
const MOBILE_RE = /mobi|android|iphone|ipod|windows phone/i

/** 固定 +8 切日/时：中国无夏令时，不引入 Intl/时区依赖 */
export function beijingDayHour(nowMs: number = Date.now()): { day: string; hour: number } {
  const shifted = new Date(nowMs + 8 * 60 * 60 * 1000)
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() }
}

/** 在 YYYY-MM-DD 上加减天数（按 UTC 计日，不做本地时区换算） */
export function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

export function deviceOf(userAgent: string | undefined | null): VisitDevice {
  const ua = String(userAgent ?? '')
  if (!ua) return 'other'
  if (BOT_RE.test(ua)) return 'bot'
  if (TABLET_RE.test(ua)) return 'tablet'
  if (MOBILE_RE.test(ua)) return 'mobile'
  return 'desktop'
}

export function languageOf(acceptLanguage: string | undefined | null): string {
  const first = String(acceptLanguage ?? '').split(',')[0]?.trim().toLowerCase() ?? ''
  if (first.startsWith('zh')) return 'zh'
  if (first.startsWith('en')) return 'en'
  return first ? 'other' : 'unknown'
}

// 搜索引擎只认真实的主域形态：`google.evil.com` 这种冒名主机不能算搜索来源
const SEARCH_HOST_RE =
  /(^|\.)(google\.[a-z]{2,3}(\.[a-z]{2})?|bing\.com|baidu\.com|duckduckgo\.com|yandex\.[a-z]{2,3}(\.[a-z]{2})?|sogou\.com|so\.com|naver\.com|yahoo\.[a-z]{2,3}(\.[a-z]{2})?)$/
const SOCIAL_HOST_RE = /(^|\.)(x\.com|twitter\.com|t\.co|weibo\.com|zhihu\.com|reddit\.com|facebook\.com|instagram\.com)$/

/** 只落"来源类别"：未知站点不再记录域名，避免把私人链接的域名写进统计库 */
export function sourceOf(referrerHost: string | undefined | null): string {
  const host = String(referrerHost ?? '').trim().toLowerCase()
  if (!host) return 'direct'
  if (SEARCH_HOST_RE.test(host)) return 'search'
  if (host === 'github.com' || host.endsWith('.github.com')) return 'github'
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin'
  if (SOCIAL_HOST_RE.test(host)) return 'social'
  return 'other'
}

export function countryOf(country: string | undefined | null): string {
  const code = String(country ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : 'unknown'
}

/**
 * 会话入口来源：把 `document.referrer` 归一成"站外主机名"，其余一律当没给。
 *
 * 同站互跳不是来源：`document.referrer` 在 SPA 切换时不会清空，逐次上报会把整段会话
 * 都归因到进入时那一个来源——而站内翻页（首页 → 详情）本身没有"引流"含义。
 * `admin.<主域>` 与 `<主域>` 之间互跳同理，按同一站点处理（比精确主机名更宽一层）。
 */
export function entrySourceOf(
  referrer: string | undefined | null,
  currentHost: string | undefined | null,
): string {
  const raw = String(referrer ?? '').trim()
  if (!raw) return ''
  let host = ''
  try {
    host = new URL(raw).hostname.toLowerCase()
  } catch {
    return ''
  }
  if (!/^[a-z0-9.-]{1,63}$/.test(host)) return ''
  const current = String(currentHost ?? '').trim().toLowerCase()
  if (current && (host === current || host.endsWith(`.${current}`) || current.endsWith(`.${host}`))) {
    return ''
  }
  return host
}
