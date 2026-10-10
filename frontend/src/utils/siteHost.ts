// 前后台互跳的地址推导：管理端是主域的 `admin.` 兄弟域（admin.X ↔ X）。
// 纯函数、只吃 hostname/protocol/port，不碰 window —— 部署到任何域名都不必改代码，
// 也不必修完域名再跑一遍浏览器才知道跳转拼错了。

export const ADMIN_PREFIX = 'admin.'

export type HostParts = {
  protocol: string
  hostname: string
  port: string
}

/** 去掉末尾根点、统一小写：`EXAMPLE.COM.` 与 `example.com` 是同一台主机 */
function normalize(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, '')
}

/**
 * 这个主机是不是"一个可部署的站点"。
 * 不含点的（`localhost`、裸 `admin`）、IP 直连的、以及 Cloudflare 给的托管预览域
 * （`*.workers.dev` / `*.pages.dev`）都不算——它们没有可用的 `admin.` 兄弟域。
 */
export function isSiteHostname(hostname: string): boolean {
  const host = normalize(hostname)
  // 不含点的（`localhost`、裸 `admin`、内网单标签名）一并由这一条拦掉
  if (!host.includes('.')) return false
  if (host.endsWith('.localhost')) return false
  if (host.endsWith('.workers.dev') || host.endsWith('.pages.dev')) return false
  if (/^\d+(\.\d+)*$/.test(host)) return false
  return true
}

/**
 * 管理端子域 = `admin.` + 一个像站点主机的余下部分。
 * 余下部分必须本身像站点（含点），否则 `admin.com`、`admin.localhost` 这类
 * **站点自己的名字**会被误判成管理端，整站就只显示登录页了。
 */
export function isAdminHostname(hostname: string): boolean {
  const host = normalize(hostname)
  if (!host.startsWith(ADMIN_PREFIX)) return false
  return isSiteHostname(host.slice(ADMIN_PREFIX.length))
}

/** 公开主机能不能靠 `admin.<主域>` 找到管理端（本地、IP、托管预览域都不能） */
export function hasAdminSibling(hostname: string): boolean {
  return !isAdminHostname(hostname) && isSiteHostname(hostname)
}

function join(parts: HostParts, hostname: string): string {
  return `${parts.protocol}//${hostname}${parts.port ? `:${parts.port}` : ''}`
}

/** 公开站 origin：当前在 admin 子域时剥掉前缀，否则就是自己（拼不出主机时返回空串） */
export function publicSiteOrigin(parts: HostParts): string {
  const host = normalize(parts.hostname)
  const bare = isAdminHostname(host) ? host.slice(ADMIN_PREFIX.length) : host
  return bare ? join(parts, bare) : ''
}

/** 管理端子域 origin：已在 admin 子域时就是自己；没有兄弟域时返回空串（调用方据此不跳） */
export function adminSiteOrigin(parts: HostParts): string {
  const host = normalize(parts.hostname)
  if (!host) return ''
  if (isAdminHostname(host)) return join(parts, host)
  return hasAdminSibling(host) ? join(parts, `${ADMIN_PREFIX}${host}`) : ''
}
