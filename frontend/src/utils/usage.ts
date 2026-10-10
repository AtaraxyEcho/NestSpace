/**
 * 匿名使用度量：事件名与方式由 worker 的 USAGE_EVENTS 白名单裁决，白名单外一律 400 且被这里吞掉。
 *
 * 为什么值得为它单开一个文件：改版前没有任何度量，"观察台有没有让人多看几张图"、
 * "批量导入有没有真的减少手工粘贴"都无法回答。这里的调用**永远不该影响用户**——
 * 没有 fetch、被 CSP 拦、离线、服务端限流，全部静默失败，不产生控制台错误或界面提示。
 */

export type UsageEvent = 'deck' | 'imgfail' | 'dirimport' | 'pageview' | 'specimen_open' | 'outbound'

const ENDPOINT = '/api/usage'

/** 主机名只保留可安全进数据集的形态，其余（带路径/查询/超长）当没给 */
function safeHost(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return /^[a-z0-9.-]{1,63}$/.test(host) ? host : ''
  } catch {
    return ''
  }
}

export function trackUsage(event: UsageEvent, method?: string, host?: string, ref?: string): void {
  if (typeof navigator === 'undefined' && typeof fetch === 'undefined') return
  let payload: string
  try {
    payload = JSON.stringify({ e: event, m: method ?? '', h: host ?? '', r: ref ?? '' })
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

/** 看了哪个页面 */
export const trackPageView = (surface: 'home' | 'detail' | 'admin') => trackUsage('pageview', surface)

/** 从哪个位置打开某件标本（card 陈列卡 / index 目录行 / related 相邻标本 / footer 页脚清单） */
export const trackSpecimenOpen = (surface: 'card' | 'index' | 'related' | 'footer', id: string) =>
  trackUsage('specimen_open', surface, '', id)

/** 真的出站了（github / demo）：与 specimen_open 相除就是转化率 */
export const trackOutbound = (kind: 'github' | 'demo', id: string) =>
  trackUsage('outbound', kind, '', id)
