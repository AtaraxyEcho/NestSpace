// 站点路由的唯一判据：App 用它决定渲染哪一屏，Worker 用它决定 canonical 指向哪条路径。
//
// 为什么抽出来：路由以前写在哈希里（`/#project/005`），服务端永远只看到首页那一条路径——
// 详情页因此无法单独收录，社交平台抓到的也永远是站点根。改成路径路由（`/project/005`）以后，
// "什么样的路径算哪一屏"成了**前后端都必须同意**的一条判据，各写一遍迟早分叉（比如前端认领了
// 一个 Worker 不认的地址，canonical 就会指向一个它不当回事的路径）。
//
// 纯函数、不碰 window：node 直跑的闸门能整张表地测（见 test/route_path.test.mjs）。

/** 标本编号的字符集，与 Worker 写侧的 id 校验同一套（`^[A-Za-z0-9._-]{1,32}$`） */
export const PROJECT_ID_RE = /^[A-Za-z0-9._-]{1,32}$/

/**
 * 合法编号 = 字符集之内、**且不是 `.` / `..`**。
 * 后者是路径规范化会吃掉的两段：编号写成 `..` 时 `/project/..` 解析出来是站点根，
 * 那件标本的详情页永远打不开（写侧也不该收这种 id，见 Worker 的 POST 校验）。
 */
export function isValidProjectId(id: string): boolean {
  return PROJECT_ID_RE.test(id) && id !== '.' && id !== '..'
}

const PROJECT_PATH_PREFIX = '/project/'
const PROJECT_ROUTE_PREFIX = 'project/'

export type SiteRoute = 'home' | 'admin' | `project/${string}`

/** 去掉末尾斜杠（根路径除外）：`/project/005/` 与 `/project/005` 是同一屏 */
function normalize(pathname: string): string {
  const path = (pathname || '/').trim()
  if (!path.startsWith('/')) return '/'
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * 路径 → 路由。**未知路径一律当首页**：静态资产层对未知路径做 SPA 兜底，
 * 它们都会回到同一份 HTML，前端再把它们渲染成首页（canonical 也照首页给，见 canonicalPathFor）。
 */
export function routeFromPath(pathname: string): SiteRoute {
  const path = normalize(pathname)
  if (path === '/') return 'home'
  if (path === '/admin') return 'admin'
  if (path.startsWith(PROJECT_PATH_PREFIX)) {
    const raw = path.slice(PROJECT_PATH_PREFIX.length)
    // 形如 `/project/a/b` 的：切出来的 raw 里带斜杠，下面的字符集校验会拦掉
    let id = raw
    try {
      id = decodeURIComponent(raw)
    } catch {
      return 'home'
    }
    return isValidProjectId(id) ? (`project/${id}` as SiteRoute) : 'home'
  }
  return 'home'
}

/** 路由 → 路径（与 routeFromPath 互逆，供 pushState / replaceState 用） */
export function pathForRoute(route: SiteRoute): string {
  if (route === 'home') return '/'
  if (route === 'admin') return '/admin'
  const id = route.slice(PROJECT_ROUTE_PREFIX.length)
  return isValidProjectId(id) ? `${PROJECT_PATH_PREFIX}${id}` : '/'
}

/**
 * 旧地址兼容：哈希路由时代分享出去的 `#project/<id>` 与 `#admin`。
 * 章节锚点（`#cabinet` 等）**不是**路由，返回 null —— 它们是首页里的滚动位置。
 */
export function legacyRouteFromHash(hash: string): SiteRoute | null {
  const clean = (hash || '').replace(/^#/, '').replace(/\/+$/, '')
  if (!clean) return null
  if (clean === 'admin') return 'admin'
  if (clean.startsWith('project/')) {
    const id = clean.slice(PROJECT_ROUTE_PREFIX.length)
    return isValidProjectId(id) ? (`project/${id}` as SiteRoute) : null
  }
  return null
}

/**
 * 这条请求路径的规范地址（Worker 注入 canonical / og:url 用）。
 * 只有真路由（`/project/<合法编号>`）才是它自己的规范地址，其余（含各种未知路径、尾部斜杠）
 * 一律回到站点根——否则一个拼错的地址会把"首页的内容"声明成自己的规范地址。
 */
export function canonicalPathFor(pathname: string): string {
  const route = routeFromPath(pathname)
  return route.startsWith('project/') ? pathForRoute(route) : '/'
}
