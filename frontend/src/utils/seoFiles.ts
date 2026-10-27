// 搜索引擎文件的纯函数：sitemap、robots 的 Sitemap 行、详情页 head 文案。
// Worker 与 node 闸门共用同一份，避免"线上生成的格式"和"测试里写的格式"分叉。

export type SitemapEntry = { path: string; lastmod?: string }

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

export function escapeXml(value: string): string {
  return String(value).replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch] ?? ch)
}

function escapeHtmlText(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * SQLite `CURRENT_TIMESTAMP`（UTC）→ sitemap 能用的 W3C 时间。
 * 不认识就返回空串：宁可省略 lastmod，也不写一个假时间让 Google 反复空抓。
 */
export function toSitemapLastmod(value: string): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z?)?$/.exec(text)
  if (!match) return ''
  if (!match[4]) return `${match[1]}-${match[2]}-${match[3]}`
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`
}

/** 站内绝对路径的 sitemap；origin 由请求推导，不写死域名 */
export function buildSitemap(origin: string, entries: SitemapEntry[]): string {
  const base = String(origin).replace(/\/+$/, '')
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ]
  for (const entry of entries) {
    const raw = String(entry.path ?? '')
    const path = raw.startsWith('/') ? raw : `/${raw}`
    const lastmod = entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ''
    lines.push(`  <url><loc>${escapeXml(`${base}${path}`)}</loc>${lastmod}</url>`)
  }
  lines.push('</urlset>')
  return `${lines.join('\n')}\n`
}

/** 详情页摘要：优先英文，空则中文；压平换行，按整词截断，长度含结尾省略号 */
export function metaDescription(text: string, max = 158): string {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return ''
  if (clean.length <= max) return clean
  const budget = Math.max(0, max - 1)
  const cut = clean.slice(0, budget)
  const space = cut.lastIndexOf(' ')
  const body = space > budget * 0.6 ? cut.slice(0, space) : cut
  return `${body.trimEnd()}…`
}

export type ProjectSeoInput = {
  name: string
  cn: string
  descriptionEn: string
  descriptionZh: string
  repository: string
}

export type ProjectSeo = { title: string; description: string; noscript: string }

/** 站点名：站名里有点/破折号分隔时取前缀；否则退回设置里的字标，再退回 NestSpace */
export function brandFromTitle(title: string, fallback: string): string {
  const parts = String(title ?? '').split(/\s*[·—]\s*/)
  const first = parts[0]?.trim() ?? ''
  if (parts.length > 1 && first) return first
  return String(fallback ?? '').trim() || 'NestSpace'
}

export function buildProjectSeo(input: ProjectSeoInput, brand: string): ProjectSeo {
  const name = String(input.name ?? '').trim() || 'Project'
  const cnRaw = String(input.cn ?? '').trim()
  // 生产数据里有些项目的中文名与英文名完全相同（OmniNest / OmniNest），
  // 再套一层括号就变成 "OmniNest（OmniNest）"；同名时不重复。
  const cn = cnRaw.toLowerCase() === name.toLowerCase() ? '' : cnRaw
  const site = String(brand ?? '').trim() || 'NestSpace'
  const displayName = cn ? `${name}（${cn}）` : name
  const title = `${displayName} · ${site}`
  const description = metaDescription(
    String(input.descriptionEn ?? '').trim() || String(input.descriptionZh ?? '').trim(),
  )
  const repo = String(input.repository ?? '').trim()
  const repoLink = /^https?:\/\//i.test(repo)
    ? `<p><a href="${escapeHtmlText(repo)}" rel="noreferrer">GitHub</a></p>`
    : ''
  const noscript =
    `<noscript><main id="seo-fallback"><h1>${escapeHtmlText(displayName)}</h1>` +
    (description ? `<p>${escapeHtmlText(description)}</p>` : '') +
    repoLink +
    `<p><a href="/">${escapeHtmlText(site)}</a></p></main></noscript>`
  return { title, description, noscript }
}

export function buildHomeNoscript(title: string, description: string): string {
  const cleanTitle = String(title ?? '').trim() || 'NestSpace'
  const cleanDescription = String(description ?? '').trim()
  return (
    `<noscript><main id="seo-fallback"><h1>${escapeHtmlText(cleanTitle)}</h1>` +
    (cleanDescription ? `<p>${escapeHtmlText(cleanDescription)}</p>` : '') +
    `</main></noscript>`
  )
}

/** robots.txt 的 Sitemap 行按请求 origin 生成；先删旧行，保证重复执行不会堆叠 */
export function withSitemapDirective(robots: string, origin: string): string {
  const body = String(robots ?? '')
    .replace(/^[ \t]*Sitemap:[^\r\n]*(?:\r?\n|$)/gim, '')
    .trimEnd()
  const base = String(origin).replace(/\/+$/, '')
  return `${body ? `${body}\n\n` : ''}Sitemap: ${base}/sitemap.xml\n`
}
