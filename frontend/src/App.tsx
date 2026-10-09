import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Language, Project, ProjectStatus } from "./types/project"
import { fallbackProjects as projects } from "./data/fallbackProjects"
import { DEFAULT_SITE_SETTINGS, DEFAULT_NAV_ITEMS } from "./data/defaultSiteSettings"
import { fetchPublicProjects, fetchSiteSettings, fetchPublicProjectById } from "./api/client"
import {
  verifyAndFetchAdminProjects,
  saveAdminProject,
  deleteAdminProject,
  getAdminToken,
  fetchAdminSiteSettings,
  saveAdminSiteSettings,
  syncGithubRepos,
  fetchGithubUserRepos,
  importGithubRepo,
  fetchPreviewImagesFromDir,
  type RemoteGithubRepo,
} from "./api/adminClient"
import type { SiteSettings, NavItemConfig } from "./types/siteSettings"
import { computeCatalogueStats, computeActivityTimeline } from "./utils/stats"
import { renderMarkdown } from "./utils/markdown"
import { frameLabel, hiddenFrameCount, previewFrames } from "./utils/previewFrames"
import { orderHomeSections } from "./utils/navOrder"
// 双语字段（挑战/方案）的读侧规则，与 Worker 投影同一份
import { asBilingual, pickBilingual, type BilingualText } from "./utils/bilingual"
// 相册判据与 Worker 写侧共用这一份（坏行即时点名与 400 点名必然是同一批）
import { PREVIEW_IMAGE_LIMIT, galleryRowIssues } from "./utils/previewRules"
import { changedColumns } from "./utils/projectDiff"
import { trackImageFailure, trackUsage } from "./utils/usage"


function SpecimenSvg({ shape }: { shape: Project["shape"] }) {
  if (shape === "aperture") {
    return (
      <svg viewBox="0 0 260 300" aria-hidden="true">
        <g className="specimen-ink" fill="none" strokeWidth="1.2">
          <path d="M132 273C115 220 117 158 130 34" />
          <path d="M130 108C86 89 58 61 48 24c46 1 79 20 82 84Z" />
          <path d="M126 147c46-27 80-26 103-8-28 33-62 43-103 8Z" />
          <path d="M123 191c-34-10-60-1-78 25 30 19 57 10 78-25Z" />
          <circle cx="130" cy="34" r="13" />
          <path d="m122 26 16 16m0-16-16 16" />
        </g>
        <g className="specimen-fill">
          <path
            d="M130 108C86 89 58 61 48 24c46 1 79 20 82 84Z"
            opacity=".55"
          />
          <path
            d="M126 147c46-27 80-26 103-8-28 33-62 43-103 8Z"
            opacity=".35"
          />
        </g>
      </svg>
    )
  }
  if (shape === "lumen") {
    return (
      <svg viewBox="0 0 260 300" aria-hidden="true">
        <g className="specimen-ink" fill="none" strokeWidth="1.2">
          <path d="M131 278V76M130 128C94 111 74 83 76 46c38 12 57 40 54 82Zm2 39c32-29 67-38 105-26-18 39-53 48-105 26Zm-1 46c-30-21-63-22-97-3 27 29 59 30 97 3Z" />
          <ellipse cx="131" cy="52" rx="26" ry="35" />
          <path d="M131 17v70M105 52h52m-44-24 36 48m0-48-36 48" />
        </g>
        <circle
          className="specimen-fill"
          cx="131"
          cy="52"
          r="12"
          opacity=".6"
        />
      </svg>
    )
  }
  if (shape === "fjord") {
    return (
      <svg viewBox="0 0 260 300" aria-hidden="true">
        <g className="specimen-ink" fill="none" strokeWidth="1.2">
          <path d="M131 280c-2-78-1-151 4-218M134 103c-35-8-61-29-78-62 44-2 70 19 78 62Zm0 31c27-30 60-42 99-36-11 42-44 54-99 36Zm-2 50c-36-21-71-21-105 1 28 31 63 31 105-1Zm0 43c31-15 61-12 90 9-29 24-59 21-90-9Z" />
          <path d="m135 62-15-30 17-22 17 22-19 30Z" />
        </g>
        <g className="specimen-fill" opacity=".4">
          <path d="M134 103c-35-8-61-29-78-62 44-2 70 19 78 62Z" />
          <path d="M132 184c-36-21-71-21-105 1 28 31 63 31 105-1Z" />
        </g>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 260 300" aria-hidden="true">
      <g className="specimen-ink" fill="none" strokeWidth="1.2">
        <path d="M131 278V32M131 88c-29-9-52-28-69-56 39-3 62 15 69 56Zm0 32c30-21 60-25 91-11-24 31-54 35-91 11Zm0 48c-35-15-68-10-98 15 34 25 67 20 98-15Zm0 45c26-20 55-25 88-14-20 31-49 36-88 14Z" />
        <circle cx="131" cy="31" r="18" />
        <circle cx="131" cy="31" r="8" />
        <path d="M131 13V2m0 47v11M113 31h-11m47 0h11" />
      </g>
      <path
        className="specimen-fill"
        d="M131 168c-35-15-68-10-98 15 34 25 67 20 98-15Z"
        opacity=".48"
      />
    </svg>
  )
}

function CropMarks() {
  return (
    <>
      <i className="crop crop-tl" />
      <i className="crop crop-tr" />
      <i className="crop crop-bl" />
      <i className="crop crop-br" />
    </>
  )
}

function SpecimenCard({
  project,
  language,
  onOpen,
}: {
  project: Project
  language: Language
  onOpen: (project: Project) => void
}) {
  const demoUrl = demoHref(project)
  return (
    <article className="specimen-card">
      <CropMarks />
      <header className="card-topline">
        <span>
          <b className="red-dot" /> SPEC—{project.id} / {project.date}
        </span>
        <span className="status">
          <b />
          {project.status}
        </span>
      </header>
      <div className="card-body">
        <div className="specimen-panel">
          <i className="tape tape-top" />
          <i className="tape tape-bottom" />
          <SpecimenSvg shape={project.shape} />
          <p className="hand-note">Habitat: {project.habitat}</p>
          <p className="microcopy">COLLECTED AT LOCAL BUILD PIPELINE</p>
        </div>
        <div className="project-copy">
          <p className="latin">{project.latin}</p>
          <h2>{project.name}</h2>
          <p className="cn-name">{project.cn}</p>
          {/* 卡片是提要位置：缺当前语言时回退另一种语言，但不加「原文」标注（那里是噪声） */}
          <p className="description">{pickBilingual(project.description, language).text}</p>
          <div className="attributes">
            <div>
              <span>CLASS</span>
              <strong>{project.type}</strong>
            </div>
            <div>
              <span>LANGUAGE</span>
              <strong>{project.language}</strong>
            </div>
            <div>
              <span>RELEASED</span>
              <strong>{project.year}</strong>
            </div>
            <div>
              <span>CITATIONS</span>
              <strong>{project.stars}</strong>
            </div>
          </div>
          <div className="card-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => onOpen(project)}
            >
              View specimen <span>↗</span>
            </button>
            {demoUrl ? (
              <a
                className="button secondary"
                href={demoUrl}
                target="_blank"
                rel="noreferrer"
              >
                Live demo <span>↗</span>
              </a>
            ) : null}
            <a
              href={formatRepositoryUrl(project.repository)}
              className="button secondary"
              target="_blank"
              rel="noreferrer"
            >
              GitHub <span>↗</span>
            </a>
          </div>
        </div>
      </div>
      <footer className="card-footer">
        <span className="hand-note">Collected by NestSpace</span>
        <span className="microcopy">MIT LICENSE / OPEN SOURCE</span>
      </footer>
    </article>
  )
}

/** 规范化仓库 URL，避免 https:// 重复拼接、缺冒号（如 https//）或缺失协议导致 DNS 解析异常 */
export function formatRepositoryUrl(repo: string | null | undefined): string {
  if (!repo) return "https://github.com"
  let trimmed = repo.trim()
  if (!trimmed) return "https://github.com"
  if (/^git@github\.com:/i.test(trimmed)) {
    return `https://github.com/${trimmed.replace(/^git@github\.com:/i, "").replace(/\.git$/i, "")}`
  }
  // 容错处理：清洗可能写错的协议头（如 https//、http//、https:/）
  trimmed = trimmed
    .replace(/^https?:\/\/?/i, "")
    .replace(/^https?\/\//i, "")
    .replace(/^\/+/, "")
  // 带点的主机名（gitlab.com/a/b、www.github.com/a/b）原样补协议，
  // 不要一律当成 owner/repo 拼到 github.com 上
  if (/^[^/\s]+\.[^/\s]+\//.test(trimmed)) {
    return `https://${trimmed}`
  }
  // 剩下的纯 owner/repo 形式才补 github.com
  if (!/^github\.com/i.test(trimmed) && /^[^/\s#?]+\/[^/\s#?]+/.test(trimmed)) {
    return `https://github.com/${trimmed}`
  }
  return `https://${trimmed}`
}

/**
 * 演示入口地址（全部副本的唯一判据）：开关开启、地址非空、协议为 http/https 三者同时成立才返回，
 * 否则 null。写入侧已在 Worker 规范化，这里再校验一次协议，防止绕过 Worker 直接写库的值直接落进 href。
 */
function demoHref(project: Project): string | null {
  if (!project.demoEnabled) return null
  const url = (project.demoUrl || "").trim()
  return /^https?:\/\//i.test(url) ? url : null
}

/**
 * 站点设置里的外链（githubUrl / icpUrl 等）只放行带主机名的 http(s) 绝对地址，其余一律 null。
 * mergeSiteSettings 只判空串，所以直接写进 D1 的 `javascript:` 会原样落进 href；这里再校验一次。
 */
function settingsHref(raw: string | null | undefined): string | null {
  const url = (raw ?? "").trim()
  if (!/^https?:\/\//i.test(url)) return null
  try {
    return new URL(url).hostname ? url : null
  } catch {
    return null
  }
}

// 图片宽度档位：观察台上同时出现的卡片不超过 4 张，一律按主图清晰度取，
// 这样翻到邻牌时不必再请求一次更大的尺寸（原图常是几百 KB 的 PNG）。
// 也别给侧牌/后牌单独设小档：后牌每次翻页换一张，相册里的每张图迟早都会当一次后牌，
// 分档会让同一张图产生两种转换变体（12 张全看完时 12 次 → 24 次），免费的第三方转换服务反而吃更多请求。
// thumb 是唯一的例外，而且它**只给索引条与管理端抽屉**用：那两个位置是"认出这是哪张图"，
// 不是"看清图里的字"。同一张图的缩略图在管理端与前台共用同一档，缓存因此也是同一份。
// zoom = 放大层，2000 就是 /api/img 的宽度上限（IMG_WIDTH_MAX），再大也会被服务端夹回来。
const IMAGE_WIDTH = { plate: 1600, thumb: 200, zoom: 2000 } as const

// 可经代理压缩的图源主机。**必须与 worker 的 IMG_ALLOWED_HOSTS 保持一致（只允许是其子集）**：
// Worker 对名单外的主机返回 404（不做开放重定向），所以这里名单外的地址直接原样使用，
// 不绕代理。若两边漂移，方向必须是"前端更窄"，否则图片会挂。
const IMAGE_PROXY_HOSTS = new Set([
  "raw.githubusercontent.com",
  "user-images.githubusercontent.com",
  "camo.githubusercontent.com",
  "objects.githubusercontent.com",
  "github.com",
  "cdn.jsdelivr.net",
])

/**
 * 白名单图源走同源代理（Worker 压成 webp + 边缘缓存）；其余直接用原地址。
 */
function proxiedImage(url: string, width: number): string {
  if (!/^https?:\/\//i.test(url)) return url
  let host = ""
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return url
  }
  if (!IMAGE_PROXY_HOSTS.has(host)) return url
  return `/api/img?w=${width}&src=${encodeURIComponent(url)}`
}

// 站内章节锚点：Cabinet → Catalogue → Curator → Index
const SECTION_ANCHORS = ["cabinet", "catalogue", "curator", "index", "colophon"]

// 详情页页签顺序：role=tab 的 aria-controls/id 与左右方向键导航都以此为准
const DETAIL_TABS = ["overview", "readme", "deployment"] as const

// 公开数据重读的最小间隔：管理端在独立子域，改动后切回公开页即可自动生效，又不至于每次聚焦都打接口
const PUBLIC_REFRESH_MIN_INTERVAL_MS = 20 * 1000

export function isAdminHost(): boolean {
  if (typeof window === "undefined") return false
  const host = window.location.hostname.toLowerCase()
  return host === "admin.nestspace.online" || host.startsWith("admin.")
}

function routeFromHash(hash: string) {
  if (isAdminHost()) return "admin"
  // 这里只做**纯解析**、不做跳转：本函数会在 useState 初始化（render 期间）被调用，
  // 在其中改 location 属于渲染期副作用。生产公开站点上的 #admin 跳到 admin 子域由路由 effect 负责；
  // 这里仍返回 home，免得登录页在公开域名上闪一下。
  const clean = hash.replace(/^#/, "")
  const isLocalHost =
    typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)
  if (clean === "admin" && !isAdminHost() && !isLocalHost) return "home"
  if (!clean || SECTION_ANCHORS.includes(clean)) return "home"
  // 只有 admin 与 project/<id> 是真路由；其余（比如导航里一个手工写进库的未知锚点）
  // 必须留在首页分支——否则首页虽然渲染，但进场动画与深链定位两个 effect 都因
  // `route !== "home"` 早退，`.reveal-section` 一类初始 opacity:0 的段落会整片看不见。
  if (!clean.startsWith("project/") && clean !== "admin") return "home"
  return clean
}

/**
 * 内置品牌标（深浅模式各一张），由 `python scripts/make-brand-logos.py` 从
 * `frontend/design/logo_*.png` 的完整组合标生成：mark = 只有徽章（标头用），
 * lockup = 徽章 + OmniNest + ATARRAYECHO 整标（想整标换上去时用，见管理端那条说明）。
 * 整标不直接进标头是因为图框只有 28px 高，里面的字会被压到读不出，还会和站点自己的
 * NESTSPACE 文字重复。public/ 下的文件按根路径引用，不能被 JS import（Vite 会报错）。
 */
const BRAND_LOGO = {
  // 文件名按**目标背景**命名（on-dark / on-light），不是按原件的底色——
  // 原件的底色会被脚本抠掉，留下的是"主体"，决定可读性的是主体与背景的明暗：
  // design/logo_light.png 是浅底 + 浅发主体 → 只能用在深色主题；logo_dark.png 反之。
  mark: { onDark: "/brand/logo-mark-on-dark.png", onLight: "/brand/logo-mark-on-light.png" },
  lockup: { onDark: "/brand/logo-lockup-on-dark.png", onLight: "/brand/logo-lockup-on-light.png" },
} as const

/**
 * 标头品牌内容（图 + 文字）。宿主自己决定外层是 <a> 还是 <button>：
 * 详情页的返回入口是 button，把 <a> 套进 <button> 是非法 HTML，所以这里只出内容。
 */
function LogoContent({ settings, dark }: { settings: SiteSettings; dark: boolean }) {
  const logoText = settings.logoText || "NESTSPACE"
  const logoSubtext = settings.logoSubtext || "ATARAXYECHO"
  const logoType = settings.logoType || "both"
  const logoImageUrl = (settings.logoImageUrl || "").trim()
  // 管理端填了地址 = 两个主题都用它（替换）；留空**或填了非法协议**才回到内置的两版。
  // 走 settingsHref 而不是直接用：库里的值可能不是 http(s)，那是把未校验的值塞进 <img src>。
  const customLogo = settingsHref(logoImageUrl)
  const builtIn = !customLogo
  const logoSrc = builtIn
    ? dark
      ? BRAND_LOGO.mark.onDark
      : BRAND_LOGO.mark.onLight
    : customLogo

  return (
    <>
      {logoType !== "text" ? (
        <img
          src={logoSrc}
          alt={logoText}
          className="wordmark-logo-img"
          // 内置 mark 是 128×128 的方形图：给出固有尺寸，浏览器能在解码前就留好盒子
          // （标头在首屏，缺宽高会抖一下）。自定义地址不知道比例，就不硬填。
          {...(builtIn ? { width: 128, height: 128 } : {})}
          fetchPriority="high"
          decoding="async"
        />
      ) : null}
      {logoType !== "image" ? (
        <>
          {logoText}
          {logoSubtext ? <span> — {logoSubtext}</span> : null}
        </>
      ) : null}
    </>
  )
}

/**
 * 双语字段的一对输入框（中文 / English）。
 * 值可能仍是旧单列的纯文本（0011 之前的数据），所以先 asBilingual 归一再渲染——
 * 否则抽屉一打开就是空的，管理员保存后反而把老内容抹掉。
 */
function BilingualField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: BilingualText | string
  onChange: (next: BilingualText) => void
}) {
  const pair = asBilingual(value)
  return (
    <div className="bilingual-field">
      <span className="bilingual-title">{label}</span>
      <div className="bilingual-pair">
        <label>
          <small>中文</small>
          <textarea value={pair.zh} onChange={(e) => onChange({ ...pair, zh: e.target.value })} />
        </label>
        <label>
          <small>English</small>
          <textarea value={pair.en} onChange={(e) => onChange({ ...pair, en: e.target.value })} />
        </label>
      </div>
      {hint ? <small className="bilingual-hint">{hint}</small> : null}
    </div>
  )
}

function LogoWordmark({ settings, dark }: { settings: SiteSettings; dark: boolean }) {
  return (
    <a
      className="wordmark"
      href="#cabinet"
      onClick={(e) => {
        e.preventDefault()
        window.scrollTo({ top: 0, behavior: "smooth" })
        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname)
        }
      }}
    >
      <LogoContent settings={settings} dark={dark} />
    </a>
  )
}

function Header({
  language,
  setLanguage,
  dark,
  setDark,
  settings,
}: {
  language: Language
  setLanguage: (value: Language) => void
  dark: boolean
  setDark: (value: boolean) => void
  settings: SiteSettings
}) {
  // navList 用 useMemo 固定引用：否则每次渲染都生成新数组，
  // 会让下面的 scroll-spy effect 反复解绑/重绑 scroll 监听
  const navSource =
    settings.navItems && settings.navItems.length > 0
      ? settings.navItems
      : DEFAULT_NAV_ITEMS
  const navList = useMemo(
    () => navSource.filter((item) => item.visible !== false),
    [navSource],
  )

  // 导航选中态：按当前滚动位置高亮对应章节（scroll-spy）
  const [activeSection, setActiveSection] = useState<string>("cabinet")

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      // 取"阈值线以下、最靠近阈值线"的章节
      const threshold = window.innerHeight * 0.45
      let current = "cabinet"
      let currentTop = -Infinity
      for (const item of navList) {
        const el = document.getElementById(item.id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        if (top <= threshold && top > currentTop) {
          current = item.id
          currentTop = top
        }
      }
      setActiveSection((prev) => (prev === current ? prev : current))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [navList])

  return (
    <header className="site-header">
      <LogoWordmark settings={settings} dark={dark} />
      <nav aria-label="Primary navigation">
        {navList.map((item) => {
          const label =
            language === "zh"
              ? item.labelZh || item.labelEn
              : item.labelEn || item.labelZh
          return (
            <a
              key={item.id}
              className={activeSection === item.id ? "active" : ""}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault()
                const el = document.getElementById(item.id)
                if (el) {
                  el.scrollIntoView({ behavior: "smooth" })
                  if (window.location.hash) {
                    window.history.replaceState(null, "", window.location.pathname)
                  }
                }
              }}
            >
              {label}
            </a>
          )
        })}
      </nav>
      <div className="header-tools">
        <span className="volume">VOL. 01 · {new Date().getFullYear()}</span>
        {settings.languageToggleEnabled !== false && (
          <button
            type="button"
            onClick={() => setLanguage(language === "en" ? "zh" : "en")}
            aria-label="Switch language"
          >
            {language === "en" ? "中" : "EN"}
          </button>
        )}
        {settings.themeToggleEnabled !== false && (
          <button
            type="button"
            onClick={() => setDark(!dark)}
            aria-label="Switch theme"
          >
            {dark ? "LIGHT" : "DARK"}
          </button>
        )}
      </div>
      <i className="page-progress" />
    </header>
  )
}

function SpiralGallery({
  language,
  items,
  settings,
  onOpen,
}: {
  language: Language
  items: Project[]
  settings: SiteSettings
  onOpen: (project: Project) => void
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const cardsRef = useRef<(HTMLDivElement | null)[]>([])
  const progressRef = useRef(0)
  const targetRef = useRef(0)
  const [active, setActive] = useState(0)

  useEffect(() => {
    let frame = 0
    let running = false
    let isInView = true
    const onScroll = () => {
      if (!sectionRef.current) return
      const rect = sectionRef.current.getBoundingClientRect()
      const range = sectionRef.current.offsetHeight - window.innerHeight
      targetRef.current = Math.max(0, Math.min(1, -rect.top / range))
    }
    const animate = () => {
      if (!running) return
      progressRef.current += (targetRef.current - progressRef.current) * 0.16
      const p = progressRef.current
      const step = Math.PI / 2
      const totalAngle = (items.length - 1) * step
      // 针对 2K / 4K 27寸超高清大屏（宽屏 >= 1800px / 2400px）动态扩展旋转半径与纵向高度，
      // 防止卡片聚集在屏幕中央过小而看不清内容
      const w = window.innerWidth
      const h = window.innerHeight
      const maxRadius = w >= 2400 ? 980 : w >= 1800 ? 820 : 640
      const radius = Math.min(
        maxRadius,
        w * (w < 900 ? 0.44 : w >= 2400 ? 0.36 : 0.42),
      )
      const height =
        h < 700 ? 430 : w < 900 ? 500 : w >= 2400 ? 840 : w >= 1800 ? 720 : 620

      // 与 .spiral-stage 的 perspective(2400px) 对应：把 Z 轴深度折算为等效的 2D
      // 位移与缩放（卡片恒为 rotateY(0)，投影几何完全一致），规避深层 translateZ
      // 在部分浏览器中的命中测试错位，保证卡片内按钮可点击。
      const PERSPECTIVE = 2400
      cardsRef.current.forEach((card, index) => {
        if (!card) return
        const relAngle = index * step - p * totalAngle
        const x = Math.sin(relAngle) * radius
        const y = (-relAngle / step) * height
        const z = -Math.cos(relAngle) * radius
        const facing = Math.cos(relAngle)
        const visibleFacing = Math.max(0, facing)
        const opacity = facing <= 0 ? 0 : Math.pow(visibleFacing, 0.7)
        // 模糊曲线收敛：正面卡片恒为 0，侧向最多 3px，保证文字始终可读
        const blur = facing <= 0 ? 10 : (1 - facing) * 3
        const scale = facing <= 0 ? 0.68 : 0.82 + facing * 0.18
        const project = PERSPECTIVE / (PERSPECTIVE - z)
        card.style.transform = `translate3d(${(x * project).toFixed(2)}px, ${(y * project).toFixed(2)}px, 0px) scale(${(scale * project).toFixed(4)})`
        card.style.opacity = opacity.toFixed(3)
        card.style.filter = blur <= 0.05 ? "none" : `blur(${blur.toFixed(2)}px)`
        card.style.pointerEvents = opacity > 0.8 ? "auto" : "none"
        card.style.zIndex = `${Math.round((facing + 1) * 100)}`
      })
      const nextActive = Math.min(
        items.length - 1,
        Math.max(0, Math.round(p * (items.length - 1))),
      )
      setActive((current) => (current === nextActive ? current : nextActive))
      frame = requestAnimationFrame(animate)
    }

    const start = () => {
      if (running || !sectionRef.current) return
      running = true
      frame = requestAnimationFrame(animate)
    }
    const stop = () => {
      running = false
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    }
    // 画廊滚出视口或标签页转入后台时停掉逐帧循环：
    // 否则它会一直为全部卡片写 transform/opacity/filter（标本越多开销越大）
    const observer = new IntersectionObserver(
      ([entry]) => {
        isInView = entry.isIntersecting
        if (isInView && !document.hidden) start()
        else stop()
      },
      { threshold: 0 },
    )
    if (sectionRef.current) observer.observe(sectionRef.current)
    const onVisibility = () => {
      if (document.hidden) stop()
      else if (isInView) start()
    }

    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    document.addEventListener("visibilitychange", onVisibility)
    start()
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      document.removeEventListener("visibilitychange", onVisibility)
      observer.disconnect()
      stop()
    }
  }, [items.length])

  const goToSpecimen = (index: number) => {
    if (!sectionRef.current) return
    const range = sectionRef.current.offsetHeight - window.innerHeight
    const top =
      sectionRef.current.offsetTop +
      (range * index) / Math.max(1, items.length - 1)
    window.scrollTo({ top, behavior: "smooth" })
  }

  return (
    <section className="spiral-scroll" id="cabinet" ref={sectionRef}>
      <div className="spiral-sticky">
        <div className="ambient-mark">
          <span>{language === "zh" ? settings.subtitleZh : settings.subtitleEn}</span>
          <strong>NestSpace</strong>
          <em>{language === "zh" ? settings.heroZh : settings.heroEn}</em>
          <small>CABINET NO. 01 · LIVING OPEN-SOURCE SPECIMENS</small>
        </div>
        <div className="perspective-grid" />
        <aside className="specimen-rail" aria-label="Specimen index">
          {items.map((project, index) => (
            <button
              type="button"
              className={index === active ? "active" : ""}
              onClick={() => goToSpecimen(index)}
              key={project.id}
            >
              <span>0{index + 1}</span>
              {project.name}
            </button>
          ))}
        </aside>
        <div className="spiral-stage">
          {items.map((project, index) => (
            <div
              className="spiral-card-wrap"
              id={`spec-${project.id}`}
              key={project.id}
              ref={(element) => {
                cardsRef.current[index] = element
              }}
            >
              <SpecimenCard
                project={project}
                language={language}
                onOpen={onOpen}
              />
            </div>
          ))}
        </div>
        <div className="gallery-footer">
          <span className="gallery-count">
            0{active + 1} <i /> 0{items.length}
          </span>
          <span className="scroll-cue">
            SCROLL TO TRAVERSE <b>↓</b>
          </span>
          <span>COLLECTED IN THE BROWSER</span>
        </div>
      </div>
    </section>
  )
}

function CatalogueStats({
  language,
  items,
  settings,
}: {
  language: Language
  items: Project[]
  settings: SiteSettings
}) {
  const computed = computeCatalogueStats(items, settings)
  const timelineData = computeActivityTimeline(items, settings)

  const stats = [
    [
      "SPECIMENS",
      computed.specimensCount,
      language === "zh" ? "件开源标本" : "Open-source works",
    ],
    [
      "CITATIONS",
      computed.citations,
      language === "zh"
        ? `分布于 ${computed.distinctHabitats} 个栖息地`
        : `Across ${computed.distinctHabitats} habitats`,
    ],
    [
      "RANGE",
      computed.distinctLanguages,
      language === "zh" ? "种技术语言" : "Languages observed",
    ],
    [
      "SINCE",
      computed.sinceYear,
      language === "zh" ? "悉心收藏至今" : "Collected with care",
    ],
  ]

  return (
    <section className="section stats-section reveal-section" id="catalogue">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CABINET RECORD / 02</span>
          <h2>
            Catalogue{" "}
            <em>/ {language === "zh" ? "馆藏统计" : "Collection record"}</em>
          </h2>
        </div>
        <span className="as-of">AS OF {computed.asOfDate}</span>
      </div>
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <article
            className="stat-card"
            key={stat[0]}
            style={{ "--delay": `${index * 80}ms` } as React.CSSProperties}
          >
            <span>{stat[0]}</span>
            <strong>{stat[1]}</strong>
            <p>{stat[2]}</p>
            <i>FIG. {index + 1}</i>
          </article>
        ))}
      </div>
      <div
        className="timeline"
        style={
          {
            "--timeline-cols": timelineData.length,
          } as React.CSSProperties
        }
      >
        <div className="timeline-copy">
          <span className="eyebrow">ACTIVITY LOG</span>
          <p>
            {language === "zh"
              ? "历年的生长轨迹，记录着标本室沉淀的年轮。"
              : "Each year marks another layer in the cabinet."}
          </p>
        </div>
        {timelineData.map((item, index) => (
          <div
            className="timeline-year"
            key={item.year}
            title={`${item.year}: ${item.count} 项动态 / 记录`}
          >
            <small>{item.count} items</small>
            <i
              style={
                {
                  "--bar-height": `${item.height}%`,
                  "--delay": `${index * 90}ms`,
                } as React.CSSProperties
              }
            />
            <span>{item.year}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Curator({ language, settings }: { language: Language; settings: SiteSettings }) {
  const copy = (en: string, zh: string) => (language === "zh" ? zh || en : en || zh)
  const githubHref = settingsHref(settings.githubUrl)
  const headlineLines = (settings.curatorHeadlineEn || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const headlineZh = (settings.curatorHeadlineZh || "").trim()

  return (
    <section className="section curator-section" id="curator">
      <div className="curator-visual">
        <div className="archive-sheet back-sheet">
          FIELD NOTE
          <br />
          NS—04
        </div>
        <div className="archive-sheet front-sheet">
          <CropMarks />
          <SpecimenSvg shape="meridian" />
        </div>
        <div className="round-stamp">
          NESTSPACE
          <br />
          OPEN SOURCE
          <br />
          SHOWCASE
        </div>
        <span className="floating-label">
          Observed in
          <br />
          natural habitat
        </span>
      </div>
      <div className="curator-copy">
        <span className="eyebrow">
          {copy(settings.curatorEyebrowEn, settings.curatorEyebrowZh)}
        </span>
        <h2>
          {headlineLines.map((line, index) => (
            <span key={`${line}-${index}`}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
          {headlineZh ? <em>/ {headlineZh}</em> : null}
        </h2>
        <blockquote>
          {copy(settings.curatorQuoteEn, settings.curatorQuoteZh)}
        </blockquote>
        <p>{copy(settings.aboutEn, settings.aboutZh)}</p>
        <dl>
          <div>
            <dt>HABITAT</dt>
            <dd>{settings.curatorHabitat || "—"}</dd>
          </div>
          <div>
            <dt>FIELD</dt>
            <dd>{settings.curatorField || "—"}</dd>
          </div>
          <div>
            <dt>GITHUB</dt>
            <dd>
              {githubHref ? (
                <a href={githubHref} target="_blank" rel="noreferrer">
                  {settings.githubUrl.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>CONTACT</dt>
            <dd>{settings.contactEmail}</dd>
          </div>
          <div>
            <dt>STATUS</dt>
            <dd>
              <b /> Accepting signals
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

function SpecimenIndex({
  items,
  onOpen,
}: {
  items: Project[]
  onOpen: (project: Project) => void
}) {
  return (
    <section className="section index-section" id="index">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            SYSTEMATIC REGISTER / {String(items.length).padStart(2, "0")}
          </span>
          <h2>
            Index of Specimens <em>/ 馆藏目录</em>
          </h2>
        </div>
        <span className="as-of">
          {String(items.length).padStart(2, "0")} ENTRIES
        </span>
      </div>
      <div className="index-list">
        {items.map((project, index) => (
          <button
            type="button"
            onClick={() => onOpen(project)}
            className="index-row"
            key={project.id}
            style={{ "--delay": `${index * 80}ms` } as React.CSSProperties}
          >
            <span className="index-id">SPEC—{project.id}</span>
            <span className="index-name">
              <strong>{project.name}</strong>
              <em>{project.cn}</em>
            </span>
            <span className="type-tag">{project.type}</span>
            <span className="index-meta">
              <i />
              {project.language} · {project.stars}
            </span>
            <span className="index-arrow">↗</span>
          </button>
        ))}
      </div>
    </section>
  )
}

// 页脚文案占位符：{name} 取 Logo 副标题署名，{since} 取馆藏起始年份，{year} 取当前年份
function fillFooterTemplate(text: string, vars: { name: string; since: string; year: number }) {
  // 用替换函数而不是替换串：站名里出现 $& / $' / $1 时，替换串会把它当成"引用匹配到的内容"改写坏
  return text
    .replace(/\{name\}/g, () => vars.name)
    .replace(/\{since\}/g, () => vars.since)
    .replace(/\{year\}/g, () => String(vars.year))
}

function SiteFooter({
  items,
  settings,
  language,
  onOpen,
}: {
  items: Project[]
  settings: SiteSettings
  language: Language
  onOpen: (project: Project) => void
}) {
  const copy = (en: string, zh: string) =>
    language === "zh" ? zh || en : en || zh
  const stats = computeCatalogueStats(items, settings)
  const templateVars = {
    name: settings.logoSubtext || "AtaraxyEcho",
    since: stats.sinceYear,
    year: new Date().getFullYear(),
  }
  const fill = (text: string) => fillFooterTemplate(text, templateVars)
  // 外链只渲染通过协议校验的地址；ICP 号非法时退回工信部官网（否则链接不可点）
  const githubHref = settingsHref(settings.githubUrl)
  const icpHref = settingsHref(settings.icpUrl) ?? "https://beian.miit.gov.cn/"
  // 邮箱只用于拼 mailto:：形态不对就不渲染链接（否则能把 ?body=/参数头塞进 mailto）
  const contactEmail = (settings.contactEmail || "").trim()
  const contactMailto = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(contactEmail)
    ? `mailto:${contactEmail}`
    : null

  // COLLECTION 列跟随「导航与标头」的顺序、名称与显示状态，末尾固定 Colophon 入口
  const navList =
    settings.navItems && settings.navItems.length > 0
      ? settings.navItems
      : DEFAULT_NAV_ITEMS
  const collectionLinks = navList
    .filter((item) => item.visible !== false)
    .map((item) => ({
      id: item.id,
      label:
        language === "zh"
          ? item.labelZh || item.labelEn
          : item.labelEn || item.labelZh,
    }))
    .concat([
      {
        id: "colophon",
        label: copy(settings.footerColophonLinkEn, settings.footerColophonLinkZh),
      },
    ])

  const goToSection = (id: string) => {
    // 顶栏 Logo 与 Cabinet 一致回到页面顶部
    if (id === "cabinet") {
      window.scrollTo({ top: 0, behavior: "smooth" })
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname)
      }
      return
    }
    const target = document.getElementById(id)
    if (target) {
      target.scrollIntoView({ behavior: "smooth" })
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname)
      }
      return
    }
    // 当前页面没有这个章节（例如站在标本详情页点页脚章节链接）：
    // 通过设置 hash 回到首页对应章节；旧实现会清掉 hash 却什么都不做，URL 与视图就此脱钩
    window.location.hash = id
  }

  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <span className="eyebrow">
            {copy(settings.footerKickerEn, settings.footerKickerZh)}
          </span>
          <strong>{settings.logoText || "NestSpace"}</strong>
          <em>{settings.logoSubtext || "ATARAXYECHO"}</em>
          <p>{fill(copy(settings.footerBlurbEn, settings.footerBlurbZh))}</p>
        </div>
        <div>
          <b>
            {copy(settings.footerColSpecimensEn, settings.footerColSpecimensZh)}
          </b>
          {items.map((project) => (
            <button
              type="button"
              key={project.id}
              onClick={() => onOpen(project)}
            >
              {project.name}
            </button>
          ))}
        </div>
        <div>
          <b>
            {copy(settings.footerColCollectionEn, settings.footerColCollectionZh)}
          </b>
          {collectionLinks.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={(e) => {
                e.preventDefault()
                goToSection(link.id)
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
        <div>
          <b>{copy(settings.footerColLinksEn, settings.footerColLinksZh)}</b>
          {githubHref ? (
            <a href={githubHref} target="_blank" rel="noreferrer">
              {copy(settings.footerGithubLabelEn, settings.footerGithubLabelZh)}
            </a>
          ) : null}
          {contactMailto ? (
            <a href={contactMailto}>
              {copy(settings.footerContactLabelEn, settings.footerContactLabelZh)}
            </a>
          ) : null}
        </div>
      </div>
      <div className="footer-bottom" id="colophon">
        <span>
          {fill(copy(settings.footerColophonLineEn, settings.footerColophonLineZh))}
        </span>
        {settings.icpEnabled && settings.icpNumber ? (
          <a
            href={icpHref}
            target="_blank"
            rel="noreferrer"
            style={{ font: '8px var(--font-mono)', letterSpacing: ".18em", color: "#b8ab98" }}
          >
            {settings.icpNumber}
          </a>
        ) : null}
        <small>{fill(copy(settings.footerCopyrightEn, settings.footerCopyrightZh))}</small>
      </div>
    </footer>
  )
}

function DetailPage({
  project,
  items,
  language,
  dark,
  settings,
  onBack,
  onLanguage,
  onTheme,
  onOpen,
}: {
  project: Project
  items: Project[]
  language: Language
  dark: boolean
  settings: SiteSettings
  onBack: () => void
  onLanguage: () => void
  onTheme: () => void
  onOpen: (project: Project) => void
}) {
  const related = items.filter((item) => item.id !== project.id).slice(0, 2)
  const demoUrl = demoHref(project)
  // 相册：优先多张；只有封面时退化为单张；都没有则不渲染预览区
  const previewImages =
    project.previewImages && project.previewImages.length > 0
      ? project.previewImages
      : project.previewImageUrl
        ? [project.previewImageUrl]
        : []
  // hero 右栏：有封面就显示封面（按图比例自适应相框），没有才退回占位标本图
  const coverSrc = project.previewImageUrl
    ? proxiedImage(project.previewImageUrl, IMAGE_WIDTH.plate)
    : ""
  const [plateRatio, setPlateRatio] = useState<number | null>(null)
  const [detailTab, setDetailTab] =
    useState<"overview" | "readme" | "deployment">("overview")

  // 投影缺字段时不让整页崩（这些列历史上曾落成 null）：一律退化成空数组
  const features = project.features ?? []
  const metrics = project.metrics ?? []
  const timeline = project.timeline ?? []

  // 复制反馈：成功/失败都给按钮一个 1.8s 的状态，否则点了没有任何反应（剪贴板不可用时也一样）
  const [copied, setCopied] = useState<{ key: string; ok: boolean } | null>(null)
  const copyToClipboard = (key: string, text: string) => {
    const report = (ok: boolean) => {
      setCopied({ key, ok })
      window.setTimeout(
        () => setCopied((prev) => (prev && prev.key === key ? null : prev)),
        1800,
      )
    }
    if (!navigator.clipboard?.writeText) {
      report(false)
      return
    }
    navigator.clipboard.writeText(text).then(() => report(true), () => report(false))
  }
  const copyLabel = (key: string) =>
    copied && copied.key === key ? (copied.ok ? "COPIED" : "COPY FAILED") : "COPY"

  // README：优先当前语言，缺失时回退另一种语言并给出提示
  const readmeZh = (project.readmeZh ?? "").trim()
  const readmeEn = (project.readmeEn ?? "").trim()
  const preferredReadme = language === "zh" ? readmeZh : readmeEn
  const fallbackReadme = language === "zh" ? readmeEn : readmeZh
  const readmeText = preferredReadme || fallbackReadme
  const readmeFromFallback = !preferredReadme && Boolean(fallbackReadme)

  // 挑战 / 方案：与 README 同一套规则——当前语言没有内容就回退另一种语言，并标出「原文」
  const challengeCopy = pickBilingual(project.challenge, language)
  const solutionCopy = pickBilingual(project.solution, language)
  const readmeDoc = useMemo(() => renderMarkdown(readmeText), [readmeText])

  const composeEntries = [
    {
      id: "compose-dev",
      label: "DEV / 本地编排",
      path: "deploy/dev/docker-compose.yml",
      content: (project.composeDev ?? "").trim(),
    },
    {
      id: "compose-prod",
      label: "PROD / 生产编排",
      path: "deploy/prod/docker-compose.yml",
      content: (project.composeProd ?? "").trim(),
    },
  ].filter((entry) => entry.content !== "")

  return (
    <main className="detail-page">
      <header className="detail-header">
        <button type="button" className="wordmark" onClick={onBack}>
          <LogoContent settings={settings} dark={dark} />
        </button>
        <span className="detail-location">CABINET / SPEC—{project.id}</span>
        <div className="header-tools">
          {settings.languageToggleEnabled !== false && (
            <button type="button" onClick={onLanguage} aria-label="Switch language">
              {language === "en" ? "中" : "EN"}
            </button>
          )}
          {settings.themeToggleEnabled !== false && (
            <button type="button" onClick={onTheme} aria-label="Switch theme">
              {dark ? "LIGHT" : "DARK"}
            </button>
          )}
        </div>
      </header>

      <section className="detail-hero">
        <button type="button" className="back-link" onClick={onBack}>
          ← RETURN TO CABINET
        </button>
        <div className="detail-hero-grid">
          <div className="detail-title">
            <span className="eyebrow">SPECIMEN RECORD / {project.date}</span>
            <p className="latin">{project.latin}</p>
            <h1>{project.name}</h1>
            <p className="detail-cn">{project.cn}</p>
            {(() => {
              // 简介与挑战/方案共用一套双语规则（utils/bilingual）：当前语言缺失时回退另一种
              // 语言并标注「原文」，而不是留一段空白，也不假装它是本语言文案
              const intro = pickBilingual(project.description, language)
              return intro.text ? (
                <p className="detail-intro">
                  {intro.text}
                  {intro.fallback ? (
                    <em className="lang-fallback">{language === "en" ? "中文原文" : "ENGLISH 原文"}</em>
                  ) : null}
                </p>
              ) : (
                <p className="detail-intro section-empty">
                  {language === "zh" ? "尚未填写简介" : "No summary yet"}
                </p>
              )
            })()}
            <div className="detail-actions">
              <a
                className="button primary"
                href={formatRepositoryUrl(project.repository)}
                target="_blank"
                rel="noreferrer"
              >
                VIEW SOURCE <span>↗</span>
              </a>
              {demoUrl ? (
                <a
                  className="button secondary"
                  href={demoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  LIVE DEMO <span>↗</span>
                </a>
              ) : null}
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  document
                    .getElementById("field-notes")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                READ FIELD NOTES <span>↓</span>
              </button>
            </div>
          </div>
          <div
            className={`detail-plate${coverSrc ? " has-cover" : ""}`}
            style={
              plateRatio
                ? ({ "--plate-ratio": String(plateRatio) } as React.CSSProperties)
                : undefined
            }
          >
            <CropMarks />
            <span className="plate-code">NS / {project.id}</span>
            {coverSrc ? (
              <img
                className="plate-cover"
                src={coverSrc}
                alt={`${project.name} 预览`}
                decoding="async"
                fetchPriority="high"
                onLoad={(event) => {
                  const el = event.currentTarget
                  if (el.naturalWidth && el.naturalHeight) {
                    // 相框跟随图片自身比例，但夹在 [0.8, 2.2] 内，避免极端长图把 hero 拉变形
                    setPlateRatio(
                      Math.min(2.2, Math.max(0.8, el.naturalWidth / el.naturalHeight)),
                    )
                  }
                }}
              />
            ) : (
              <SpecimenSvg shape={project.shape} />
            )}
            <p className="hand-note">Observed in {project.habitat}</p>
            <span className="plate-status">
              <b /> {project.status}
              {project.version ? ` · ${project.version}` : ""}
            </span>
          </div>
        </div>
        <dl className="detail-register">
          <div>
            <dt>CLASS</dt>
            <dd>{project.type}</dd>
          </div>
          <div>
            <dt>LANGUAGE</dt>
            <dd>{project.language}</dd>
          </div>
          <div>
            <dt>FIRST RELEASE</dt>
            <dd>{project.year}</dd>
          </div>
          <div>
            <dt>LAST OBSERVED</dt>
            <dd>{project.updated}</dd>
          </div>
          <div>
            <dt>CITATIONS</dt>
            <dd>{project.stars}</dd>
          </div>
        </dl>
        <nav
          className="detail-tabs"
          aria-label="Project documentation"
          role="tablist"
          onKeyDown={(event) => {
            // 符合 WAI-ARIA 的 tab 键盘约定：左右方向键在页签间移动并聚焦
            const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
            if (step === 0) return
            event.preventDefault()
            const current = DETAIL_TABS.indexOf(detailTab)
            const next = DETAIL_TABS[(current + step + DETAIL_TABS.length) % DETAIL_TABS.length]
            setDetailTab(next)
            document.getElementById(`detail-tab-${next}`)?.focus()
          }}
        >
          {DETAIL_TABS.map((tab) => (
            <button
              type="button"
              key={tab}
              id={`detail-tab-${tab}`}
              role="tab"
              aria-selected={detailTab === tab}
              aria-controls={`detail-panel-${tab}`}
              tabIndex={detailTab === tab ? 0 : -1}
              className={detailTab === tab ? "active" : ""}
              onClick={() => setDetailTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
      </section>

      <div
        id="detail-panel-overview"
        role="tabpanel"
        aria-labelledby="detail-tab-overview"
        tabIndex={0}
        className={detailTab === "overview" ? "" : "document-hidden"}
      >
        {/* 相册为空时组件自己返回 null，不渲染空的观察台区块 */}
        <PreviewGallery
          images={previewImages}
          name={project.name}
          language={language}
        />

        <section className="detail-section" id="field-notes">
          <div className="detail-section-label">
            <span className="eyebrow">FIELD NOTES / 02</span>
            <span>CONTEXT & RESPONSE</span>
          </div>
          <div className="detail-narrative">
            <article>
              <span>THE CONDITION</span>
              <h2>Why it needed to exist.</h2>
              {challengeCopy.text ? (
                <p>
                  {challengeCopy.text}
                  {challengeCopy.fallback ? (
                    <em className="lang-fallback">{language === "en" ? "中文原文" : "ENGLISH 原文"}</em>
                  ) : null}
                </p>
              ) : (
                <p className="section-empty">{language === "zh" ? "尚未记录" : "Not recorded"}</p>
              )}
            </article>
            <article>
              <span>THE RESPONSE</span>
              <h2>A narrow tool, carefully shaped.</h2>
              {solutionCopy.text ? (
                <p>
                  {solutionCopy.text}
                  {solutionCopy.fallback ? (
                    <em className="lang-fallback">{language === "en" ? "中文原文" : "ENGLISH 原文"}</em>
                  ) : null}
                </p>
              ) : (
                <p className="section-empty">{language === "zh" ? "尚未记录" : "Not recorded"}</p>
              )}
            </article>
          </div>
        </section>

        <section className="detail-section capability-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ANATOMY / 03</span>
              <h2>
                Core capabilities <em>/ 标本特征</em>
              </h2>
            </div>
            <span className="as-of">
              {String(features.length).padStart(2, "0")} TRAITS
            </span>
          </div>
          {features.length > 0 ? (
            <div className="capability-grid">
              {features.map((feature, index) => (
                <article key={feature}>
                  <span>0{index + 1}</span>
                  <h3>{feature}</h3>
                </article>
              ))}
            </div>
          ) : (
            <p className="section-empty">暂无特征标签</p>
          )}
          {metrics.length > 0 ? (
            <div className="metric-strip">
              {metrics.map((metric) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="section-empty">暂无指标</p>
          )}
        </section>

        <section className="detail-section evolution-section">
          <div className="detail-section-label">
            <span className="eyebrow">EVOLUTION / 04</span>
            <span>A LIVING SPECIMEN</span>
          </div>
          {timeline.length > 0 ? (
            <div className="evolution-list">
              {timeline.map((event, index) => (
                <article key={`${event.date}-${event.title}-${index}`}>
                  <span className="event-index">0{index + 1}</span>
                  <time>{event.date}</time>
                  <h3>{event.title}</h3>
                  <p>{event.note}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="section-empty">暂无时间线记录</p>
          )}
        </section>
      </div>

      {detailTab === "readme" && (
        <section
          className="detail-section document-section"
          id="detail-panel-readme"
          role="tabpanel"
          aria-labelledby="detail-tab-readme"
          tabIndex={0}
        >
          <aside>
            <span className="eyebrow">ON THIS PAGE</span>
            {readmeDoc.headings.length > 0 ? (
              readmeDoc.headings
                .filter((heading) => heading.level <= 3)
                .slice(0, 14)
                .map((heading) => (
                  <button
                    type="button"
                    key={heading.id}
                    className="doc-toc-item"
                    onClick={() =>
                      document
                        .getElementById(heading.id)
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    {heading.text}
                  </button>
                ))
            ) : (
              <span className="doc-toc-empty">暂无目录</span>
            )}
          </aside>
          <article className="markdown-body">
            {readmeText ? (
              <div className="readme-doc">
                <span className="eyebrow">
                  README.md /{" "}
                  {readmeFromFallback
                    ? language === "zh"
                      ? "ENGLISH 原文"
                      : "中文原文"
                    : language === "zh"
                      ? "中文"
                      : "ENGLISH"}
                  {project.docsSyncedAt ? ` · SYNCED ${project.docsSyncedAt}` : ""}
                </span>
                {readmeFromFallback ? (
                  <p className="doc-notice">
                    该标本暂无
                    {language === "zh" ? "中文" : "英文"} README，以下为另一种语言的原文。
                  </p>
                ) : null}
                {readmeDoc.nodes}
              </div>
            ) : (
              <div className="empty-state">
                <strong>该标本暂无 README 文档</strong>
                <span>
                  可在管理端「项目管理 → 编辑」粘贴 Markdown，或在「GitHub 同步」勾选
                  「同时抓取 README / Compose 文档」后同步。
                </span>
              </div>
            )}
          </article>
        </section>
      )}

      {detailTab === "deployment" && (
        <section
          className="detail-section document-section"
          id="detail-panel-deployment"
          role="tabpanel"
          aria-labelledby="detail-tab-deployment"
          tabIndex={0}
        >
          <aside>
            <span className="eyebrow">DEPLOYMENT</span>
            {composeEntries.length > 0 ? (
              composeEntries.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className="doc-toc-item"
                  onClick={() =>
                    document
                      .getElementById(entry.id)
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  {entry.label}
                </button>
              ))
            ) : (
              <span className="doc-toc-empty">暂无编排文件</span>
            )}
          </aside>
          <article className="markdown-body">
            <span className="eyebrow">
              COMPOSE / DOCKER
              {project.docsSyncedAt ? ` · SYNCED ${project.docsSyncedAt}` : ""}
            </span>
            {composeEntries.length === 0 ? (
              <div className="empty-state">
                <strong>该标本暂无 Docker Compose 编排</strong>
                <span>
                  仓库中未发现 deploy/dev/docker-compose.yml 或 deploy/prod/docker-compose.yml，
                  可在管理端手工粘贴。
                </span>
              </div>
            ) : (
              composeEntries.map((entry) => (
                <div className="compose-doc" id={entry.id} key={entry.id}>
                  <h3>{entry.label}</h3>
                  <div className="code-block">
                    <div className="code-block-head">
                      <span>{entry.path}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(entry.id, entry.content)}
                      >
                        {copyLabel(entry.id)}
                      </button>
                    </div>
                    <pre>
                      <code>{entry.content}</code>
                    </pre>
                  </div>
                </div>
              ))
            )}
            <h3 id="env-vars">环境变量</h3>
            <div className="code-block">
              <div className="code-block-head">
                <span>.ENV.PRODUCTION</span>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      "env-vars",
                      `PUBLIC_REPOSITORY=${project.repository}${
                        demoUrl
                          ? `\nPUBLIC_DEMO_URL=${demoUrl}`
                          : ""
                      }`,
                    )
                  }
                >
                  {copyLabel("env-vars")}
                </button>
              </div>
              <pre>
                <code>
                  PUBLIC_REPOSITORY={project.repository}
                  {demoUrl
                    ? `\nPUBLIC_DEMO_URL=${demoUrl}`
                    : ""}
                </code>
              </pre>
            </div>
          </article>
        </section>
      )}

      <section className="detail-section related-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">NEIGHBOURING SPECIMENS / 05</span>
            <h2>Continue observing</h2>
          </div>
        </div>
        <div className="related-grid">
          {related.map((item) => (
            <button type="button" key={item.id} onClick={() => onOpen(item)}>
              <span>
                SPEC—{item.id} · {item.type}
              </span>
              <strong>{item.name}</strong>
              <em>{item.cn}</em>
              <i>↗</i>
            </button>
          ))}
        </div>
      </section>
      <SiteFooter
        items={items}
        settings={settings}
        language={language}
        onOpen={onOpen}
      />
    </main>
  )
}

type AdminView = "overview" | "navigation" | "stats" | "content" | "footer" | "projects" | "sync" | "settings"

// 页脚文案的中英字段键（均以 En / Zh 结尾，值类型均为 string）
type FooterCopyEnKey = Extract<keyof SiteSettings, `${string}En`>
type FooterCopyZhKey = Extract<keyof SiteSettings, `${string}Zh`>

function FooterCopyField({
  label,
  hint,
  language,
  settings,
  enKey,
  zhKey,
  onChange,
  multiline,
}: {
  label: string
  hint?: string
  language: Language
  settings: SiteSettings
  enKey: FooterCopyEnKey
  zhKey: FooterCopyZhKey
  onChange: (
    enKey: FooterCopyEnKey,
    zhKey: FooterCopyZhKey,
    next: { en: string; zh: string },
  ) => void
  multiline?: boolean
}) {
  const isZh = language === "zh"
  const en = settings[enKey]
  const zh = settings[zhKey]
  const value = isZh ? zh : en
  // 另一侧语言的值作为占位符，便于知道切回另一种语言时显示什么
  const placeholder = isZh ? en : zh
  const commit = (text: string) =>
    onChange(enKey, zhKey, isZh ? { en, zh: text } : { en: text, zh })

  return (
    <label>
      {label}
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(event) => commit(event.target.value)}
        />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          onChange={(event) => commit(event.target.value)}
        />
      )}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

type GithubSyncResult = {
  id: string
  name: string
  status: string
  note?: string
  stars?: string
  version?: string
  updated?: string
  language?: string
  description?: string
}

function AdminFooterView({
  items,
  settings,
  contentLanguage,
  onLanguage,
  onPatch,
  onSave,
}: {
  items: Project[]
  settings: SiteSettings
  contentLanguage: Language
  onLanguage: (value: Language) => void
  onPatch: (
    enKey: FooterCopyEnKey,
    zhKey: FooterCopyZhKey,
    next: { en: string; zh: string },
  ) => void
  onSave: () => void
}) {
  const pick = (en: string, zh: string) =>
    contentLanguage === "zh" ? zh || en : en || zh
  const templateVars = {
    name: settings.logoSubtext || "AtaraxyEcho",
    since: computeCatalogueStats(items, settings).sinceYear,
    year: new Date().getFullYear(),
  }
  const fill = (text: string) => fillFooterTemplate(text, templateVars)

  // 预览与公开站点同源：COLLECTION 列取可见导航项 + 固定 Colophon 入口
  const navList =
    settings.navItems && settings.navItems.length > 0
      ? settings.navItems
      : DEFAULT_NAV_ITEMS
  const collectionLinks = navList
    .filter((item) => item.visible !== false)
    .map((item) => ({ id: item.id, label: pick(item.labelEn, item.labelZh) }))
    .concat([
      {
        id: "colophon",
        label: pick(settings.footerColophonLinkEn, settings.footerColophonLinkZh),
      },
    ])

  return (
    <div className="admin-content">
      <div className="admin-page-title compact">
        <div>
          <span className="eyebrow">FOOTER COPY / 08</span>
          <h1>底部栏文案</h1>
          <p>调整公开站点底部栏的品牌说明、栏目标题、链接文字与版权行，中英各一份，随访客语言切换。</p>
        </div>
        <button type="button" className="admin-primary" onClick={onSave}>
          保存并生效
        </button>
      </div>

      <div className="content-tabs" role="tablist" aria-label="页脚文案语言">
        <button
          type="button"
          className={contentLanguage === "zh" ? "active" : ""}
          onClick={() => onLanguage("zh")}
        >
          中文文案
        </button>
        <button
          type="button"
          className={contentLanguage === "en" ? "active" : ""}
          onClick={() => onLanguage("en")}
        >
          English
        </button>
      </div>

      <div className="settings-grid">
        <section className="settings-card">
          <span className="eyebrow">BRAND BLOCK / 品牌区</span>
          <h2>品牌上方小标与说明</h2>
          <FooterCopyField
            label="品牌区上方小标"
            hint="等宽小字号标签，位于 Logo 大字上方"
            language={contentLanguage}
            settings={settings}
            enKey="footerKickerEn"
            zhKey="footerKickerZh"
            onChange={onPatch}
          />
          <FooterCopyField
            label="品牌说明段落"
            hint="支持 {name} 占位符，取自「02 导航与标头」的副标题署名"
            language={contentLanguage}
            settings={settings}
            enKey="footerBlurbEn"
            zhKey="footerBlurbZh"
            onChange={onPatch}
            multiline
          />
        </section>

        <section className="settings-card">
          <span className="eyebrow">COLUMN HEADINGS / 栏目标题</span>
          <h2>三列标题与锚点文字</h2>
          <FooterCopyField
            label="标本列表列标题"
            hint="内容为全部公开标本名称，来自「05 项目管理」"
            language={contentLanguage}
            settings={settings}
            enKey="footerColSpecimensEn"
            zhKey="footerColSpecimensZh"
            onChange={onPatch}
          />
          <FooterCopyField
            label="章节导航列标题"
            hint="该列链接的顺序、名称与显示状态跟随「02 导航与标头」"
            language={contentLanguage}
            settings={settings}
            enKey="footerColCollectionEn"
            zhKey="footerColCollectionZh"
            onChange={onPatch}
          />
          <FooterCopyField
            label="外部链接列标题"
            hint="该列包含 GitHub 与联系邮箱两个链接"
            language={contentLanguage}
            settings={settings}
            enKey="footerColLinksEn"
            zhKey="footerColLinksZh"
            onChange={onPatch}
          />
          <FooterCopyField
            label="Colophon 链接文字"
            hint="章节导航列末尾固定项，点击滚动到底部版权行"
            language={contentLanguage}
            settings={settings}
            enKey="footerColophonLinkEn"
            zhKey="footerColophonLinkZh"
            onChange={onPatch}
          />
        </section>

        <section className="settings-card">
          <span className="eyebrow">LINK LABELS / 链接文字</span>
          <h2>外部链接显示文字</h2>
          <FooterCopyField
            label="GitHub 链接文字"
            hint="链接地址来自「04 内容管理」的 GitHub"
            language={contentLanguage}
            settings={settings}
            enKey="footerGithubLabelEn"
            zhKey="footerGithubLabelZh"
            onChange={onPatch}
          />
          <FooterCopyField
            label="联系链接文字"
            hint="链接指向 mailto:「04 内容管理」的联系邮箱"
            language={contentLanguage}
            settings={settings}
            enKey="footerContactLabelEn"
            zhKey="footerContactLabelZh"
            onChange={onPatch}
          />
        </section>

        <section className="settings-card">
          <span className="eyebrow">BASELINE / 底行</span>
          <h2>版权行</h2>
          <FooterCopyField
            label="底行左侧文案"
            hint="支持 {since} 占位符，取馆藏起始年份（可在「03 馆藏统计」指定）"
            language={contentLanguage}
            settings={settings}
            enKey="footerColophonLineEn"
            zhKey="footerColophonLineZh"
            onChange={onPatch}
          />
          <FooterCopyField
            label="底行右侧版权行"
            hint="支持 {year} 占位符，取当前年份；备案号在「07 站点设置」的备案信息卡片"
            language={contentLanguage}
            settings={settings}
            enKey="footerCopyrightEn"
            zhKey="footerCopyrightZh"
            onChange={onPatch}
          />
          <p className="settings-card-note">
            某项留空会回退到构建内置的默认文案（而非隐藏该行）；改动保存后即时生效，无需重新部署。
          </p>
        </section>
      </div>

      <div className="footer-preview">
        <span>
          FOOTER PREVIEW / 底部栏实时预览（{contentLanguage === "zh" ? "中文" : "English"}）
        </span>
        <div className="footer-preview-stage">
          <div className="footer-preview-brand">
            <span className="eyebrow">
              {pick(settings.footerKickerEn, settings.footerKickerZh)}
            </span>
            <strong>{settings.logoText || "NESTSPACE"}</strong>
            <em>{settings.logoSubtext || "ATARAXYECHO"}</em>
            <p>{fill(pick(settings.footerBlurbEn, settings.footerBlurbZh))}</p>
          </div>
          <div className="footer-preview-cols">
            <div>
              <b>
                {pick(settings.footerColSpecimensEn, settings.footerColSpecimensZh)}
              </b>
              {items.slice(0, 3).map((item) => (
                <span key={item.id}>{item.name}</span>
              ))}
            </div>
            <div>
              <b>
                {pick(settings.footerColCollectionEn, settings.footerColCollectionZh)}
              </b>
              {collectionLinks.map((link) => (
                <span key={link.id}>{link.label}</span>
              ))}
            </div>
            <div>
              <b>{pick(settings.footerColLinksEn, settings.footerColLinksZh)}</b>
              <span>
                {pick(settings.footerGithubLabelEn, settings.footerGithubLabelZh)}
              </span>
              <span>
                {pick(settings.footerContactLabelEn, settings.footerContactLabelZh)}
              </span>
            </div>
          </div>
          <div className="footer-preview-bottom">
            <span>
              {fill(pick(settings.footerColophonLineEn, settings.footerColophonLineZh))}
            </span>
            {settings.icpEnabled && settings.icpNumber ? (
              <i>{settings.icpNumber}</i>
            ) : null}
            <small>{fill(pick(settings.footerCopyrightEn, settings.footerCopyrightZh))}</small>
          </div>
        </div>
        <button type="button" className="admin-primary" onClick={onSave}>
          保存底部栏文案
        </button>
      </div>
    </div>
  )
}

function AdminGateway({
  items,
  onChange,
  onExit,
}: {
  items: Project[]
  onChange: (items: Project[]) => void
  onExit: () => void
}) {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState("")

  // 挂载时自动尝试校验：优先使用本地 token；
  // 无 token 时也发起一次探测——若浏览器已通过 Cloudflare Zero Trust
  // （持有 CF_Authorization Cookie，由后端校验其 JWT 签名），即可免口令进入。
  useEffect(() => {
    const existing = getAdminToken()
    setLoading(true)
    verifyAndFetchAdminProjects(existing || undefined).then((res) => {
      setLoading(false)
      if (res.success && res.data) {
        onChange(res.data)
        setAuthenticated(true)
      } else if (existing) {
        // 本地存过口令却失败（口令改了 / Cloudflare 授权变更）：说清楚为什么停在登录页，
        // 别让人对着空表单猜。没存过口令时停在登录页是正常路径，不显示错误。
        setAuthError(`${res.error || "本地保存的口令已失效"}，请重新输入口令`)
      }
    })
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setAuthError("")
    if (!password.trim()) {
      setAuthError("请输入馆长口令")
      return
    }

    setLoading(true)
    const result = await verifyAndFetchAdminProjects(password.trim())
    setLoading(false)

    if (result.success && result.data) {
      onChange(result.data)
      setAuthenticated(true)
    } else {
      setAuthError(result.error || "认证失败：口令无效或已被边缘阻断")
    }
  }

  if (authenticated) {
    return <AdminPage items={items} onChange={onChange} onExit={onExit} />
  }

  return (
    <main className="admin-login">
      <button type="button" className="back-link" onClick={onExit}>
        ← 返回公开站点
      </button>
      <form onSubmit={handleSubmit}>
        <CropMarks />
        <span className="eyebrow">EDGE PROTECTED / CLOUDFLARE ZERO TRUST</span>
        <strong>NestSpace</strong>
        <em>馆长控制台</em>
        <p>请输入管理员安全口令（ADMIN_SECRET_KEY）以进入边缘管理后台。</p>
        <label>
          CURATOR KEY / 密钥口令
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入管理员安全密钥"
            autoFocus
            disabled={loading}
          />
        </label>
        {authError && (
          <div style={{ color: "#ef4444", fontSize: "13px", marginTop: "8px", fontFamily: "monospace" }}>
            [!] {authError}
          </div>
        )}
        <button type="submit" className="admin-primary" disabled={loading} style={{ marginTop: "16px" }}>
          {loading ? "正在验证身份..." : "安全进入管理端 →"}
        </button>
        <small>PROTECTED BY CLOUDFLARE EDGE & D1 PERSISTENCE</small>
      </form>
    </main>
  )
}


// 抽屉里的数组字段用逐行文本编辑，避免为 4 个数组各造一套结构化控件。
// 约定：features 每行一条；metrics 每行「标签 | 数值」；timeline 每行「日期 | 标题 | 说明」。
function textToFeatures(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

// 指标/时间线文本框的逐行解析：坏行**不能静默丢弃**，否则 draft 会退化成与基线相同，
// 表现为"没有检测到任何改动"而用户刚敲的那行凭空消失（相册用 galleryRowIssues 挡住的就是这一类）。
// 行号对的是文本框里真实的行（含空行），用户能直接数。
type RowIssue = { row: number; reason: string }

function parseMetricsText(text: string): { rows: Project["metrics"]; issues: RowIssue[] } {
  const rows: Project["metrics"] = []
  const issues: RowIssue[] = []
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim()
    if (!line) return
    const parts = line.split("|")
    if (parts.length < 2) {
      issues.push({ row: index + 1, reason: "格式应为「标签 | 数值」" })
      return
    }
    const label = (parts[0] ?? "").trim()
    if (!label) {
      issues.push({ row: index + 1, reason: "标签不能为空" })
      return
    }
    rows.push({ label, value: parts.slice(1).join("|").trim() })
  })
  return { rows, issues }
}

function parseTimelineText(text: string): { rows: Project["timeline"]; issues: RowIssue[] } {
  const rows: Project["timeline"] = []
  const issues: RowIssue[] = []
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim()
    if (!line) return
    const parts = line.split("|")
    if (parts.length < 2) {
      issues.push({ row: index + 1, reason: "格式应为「日期 | 标题 | 说明」" })
      return
    }
    const date = (parts[0] ?? "").trim()
    if (!date) {
      issues.push({ row: index + 1, reason: "日期不能为空" })
      return
    }
    rows.push({ date, title: (parts[1] ?? "").trim(), note: parts.slice(2).join("|").trim() })
  })
  return { rows, issues }
}

function textToMetrics(text: string): Project["metrics"] {
  return parseMetricsText(text).rows
}

function textToTimeline(text: string): Project["timeline"] {
  return parseTimelineText(text).rows
}

// 相册列存的是 JSON 字符串（管理端原值）；坏数据一律退化为空数组，避免编辑时抛错
function parsePreviewImagesJson(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((url): url is string => typeof url === "string" && url.trim() !== "")
      : []
  } catch {
    return []
  }
}

// 抽屉里相册用逐行 URL 编辑。**不**在项目图片非空时把它当成相册第一行：
// 那样任何一次"只改别的字段"的保存都会把项目图片固化成相册（并让 has_preview_images 变 1，
// 此后同步再也不会为该项目的相册自动补图）。对外展示的退化交给读侧 publicGallery。
function galleryToText(project: Project): string {
  return parsePreviewImagesJson(project.preview_images_json).join("\n")
}

function AdminPage({
  items,
  onChange,
  onExit,
}: {
  items: Project[]
  onChange: (items: Project[]) => void
  onExit: () => void
}) {
  const [view, setView] = useState<AdminView>("overview")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"ALL" | Project["status"]>(
    "ALL",
  )
  const [editing, setEditing] = useState<Project | null>(null)
  // 三个数组字段在抽屉里以原始文本暂存：保存时才解析，避免边输入边被重新格式化导致光标跳动
  const [featuresText, setFeaturesText] = useState("")
  const [metricsText, setMetricsText] = useState("")
  const [timelineText, setTimelineText] = useState("")
  // 相册同理：逐行 URL 暂存，保存时序列化回 JSON 字符串
  const [previewImagesText, setPreviewImagesText] = useState("")
  // 「按目录批量导入」的草稿输入与在途标记（结果只并入文本框，点保存才写库）
  const [previewDirText, setPreviewDirText] = useState("")
  const [dirImporting, setDirImporting] = useState(false)
  // 上一次目录读取的失败原因（非空时按钮变成「重试」，输入内容原样保留）
  const [dirImportError, setDirImportError] = useState("")
  // 上一次目录读取的结果统计，就近显示在触发控件旁（顶部通知条会被后续操作冲掉）
  const [dirImportNote, setDirImportNote] = useState("")
  // 默认追加；勾上则整体替换相册内容（满 12 张时"只能追加"等于导入无效）
  const [replaceGallery, setReplaceGallery] = useState(false)
  // 新建项目的空白模板快照：作为"未保存改动"的比对基线（列表里还没有这一行）
  const [newDraftBase, setNewDraftBase] = useState<Project | null>(null)
  // 保存/删除等在途操作的互斥锁：按钮禁用 + 处理函数入口重入判断，避免双击发两次写请求
  const [savingProject, setSavingProject] = useState(false)
  // 关闭抽屉时如果有未保存改动，这里存改动列数（>0 表示确认条展开）
  const [confirmClose, setConfirmClose] = useState(0)
  // 后台只有一条通知位（.admin-notice）。三种状态各有归宿：
  //   info —— 结果性提示，6 秒后自动让位（否则一条旧消息会常驻到下次操作，失败提示会被冲掉）；
  //   error —— 常驻，带关闭按钮，直到用户确认它被看过；
  //   busy —— 在途提示，不自动消失（GitHub 抓取可能超过 10 秒，自动消失会让人以为没反应）。
  const [notice, setNoticeText] = useState("")
  const [noticeKind, setNoticeKind] = useState<"info" | "error" | "busy">("info")
  const setNotice = (message: string) => {
    setNoticeText(message)
    setNoticeKind("info")
  }
  const setNoticeError = (message: string) => {
    setNoticeText(message)
    setNoticeKind("error")
  }
  const setNoticeBusy = (message: string) => {
    setNoticeText(message)
    setNoticeKind("busy")
  }
  useEffect(() => {
    if (noticeKind !== "info" || !notice) return
    const timer = setTimeout(() => setNoticeText(""), 6000)
    return () => clearTimeout(timer)
  }, [notice, noticeKind])
  const [contentLanguage, setContentLanguage] = useState<Language>("zh")
  // 站点文案与合规设置：初始为内置默认值，挂载后从 D1 拉取覆盖
  const [siteContent, setSiteContent] = useState<SiteSettings>({
    ...DEFAULT_SITE_SETTINGS,
  })
  const [syncing, setSyncing] = useState(false)
  // 是否在同步指标的同时抓取 README / Compose 文档
  const [syncDocs, setSyncDocs] = useState(false)
  // 同步范围：null = 没做过选择（= 全部，老语义）；数组 = 显式勾选的编号。
  // 以前这个接口只有"全表同步"一个按钮，GitHub 配额常为 0 时想只刷两个仓库都做不到。
  const [syncScopeIds, setSyncScopeIds] = useState<string[] | null>(null)
  // 站点文案是否已成功从 D1 载入；未载入时禁止保存，防止默认文案覆盖线上配置
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settingsLoadError, setSettingsLoadError] = useState("")
  const [syncResults, setSyncResults] = useState<GithubSyncResult[] | null>(null)
  const [githubUser, setGithubUser] = useState("AtaraxyEcho")
  const [githubToken, setGithubToken] = useState(() => sessionStorage.getItem("nestspace_gh_token") || "")
  const [scanningRepos, setScanningRepos] = useState(false)
  const [discoveredRepos, setDiscoveredRepos] = useState<RemoteGithubRepo[] | null>(null)
  const [importingRepo, setImportingRepo] = useState<string | null>(null)

  const viewNames: Record<AdminView, string> = {
    overview: "馆藏总览",
    navigation: "导航与标头",
    stats: "馆藏统计",
    content: "内容管理",
    footer: "底部栏文案",
    projects: "项目管理",
    sync: "GitHub 同步",
    settings: "站点设置",
  }
  // 从 D1 拉取站点文案设置。未加载成功前一律禁止保存：
  // 否则初值（内置默认文案）会被整份写回，抹掉线上已配置的文案。
  const loadSiteSettings = async () => {
    setSettingsLoadError("")
    const res = await fetchAdminSiteSettings()
    if (!res.success || !res.data) {
      setSettingsLoaded(false)
      setSettingsLoadError(res.error || "未知错误")
      return
    }
    setSiteContent(res.data)
    setSettingsLoaded(true)
    if (res.data.githubUrl) {
      const match = /github\.com\/([^/\s#?]+)/i.exec(res.data.githubUrl)
      if (match) setGithubUser(match[1])
    }
  }

  useEffect(() => {
    loadSiteSettings()
  }, [])

  const saveSettings = async () => {
    if (!settingsLoaded) {
      setNoticeError("站点文案尚未从线上库加载成功，已阻止保存以避免覆盖线上配置。请先点上方「重新加载」。")
      return
    }
    setNoticeBusy("正在保存站点设置到线上库...")
    const res = await saveAdminSiteSettings(siteContent)
    // 成功/失败分两条通道：成功会 6 秒淡出，失败常驻到用户关掉——混在一个三元里就没法区分
    if (res.success) {
      setNotice("站点设置已保存，刷新公开站点即可生效。")
    } else {
      setNoticeError(`保存失败: ${res.error || "请检查网络或口令权限"}`)
    }
  }

  const patchFooterPair = (
    enKey: FooterCopyEnKey,
    zhKey: FooterCopyZhKey,
    next: { en: string; zh: string },
  ) => {
    setSiteContent({
      ...siteContent,
      [enKey]: next.en,
      [zhKey]: next.zh,
    } as SiteSettings)
  }

  const handleScanRepos = async () => {
    if (!githubUser.trim()) {
      setNoticeError("请输入 GitHub 用户名")
      return
    }
    setScanningRepos(true)
    setNoticeBusy(`正在扫描 GitHub 用户 @${githubUser.trim()} 的所有公开仓库…`)
    const res = await fetchGithubUserRepos(githubUser.trim(), githubToken.trim() || undefined)
    setScanningRepos(false)
    if (!res.success || !res.repos) {
      setNoticeError(`扫描失败: ${res.error || "请检查网络或用户名"}`)
      return
    }
    setDiscoveredRepos(res.repos)
    setNotice(
      (res.truncated
        ? `扫描完成：仓库数量超过上限，仅列出最近更新的 ${res.repos.length} 个（最多 3 页 300 个）。`
        : `扫描完成：发现 ${res.repos.length} 个公开仓库。`) +
        (typeof res.rateLimitRemaining === "number"
          ? ` GitHub 剩余额度 ${res.rateLimitRemaining}。`
          : ""),
    )
  }

  const handleImportRepo = async (repoFullName: string) => {
    setImportingRepo(repoFullName)
    setNoticeBusy(`正在将 ${repoFullName} 导入为馆藏标本…`)
    const res = await importGithubRepo(repoFullName, githubToken.trim() || undefined)
    setImportingRepo(null)
    if (!res.success) {
      setNoticeError(`导入失败: ${res.error}`)
      return
    }
    setNotice(`✓ ${res.message || "导入成功"}`)
    verifyAndFetchAdminProjects().then((refresh) => {
      if (refresh.success && refresh.data) onChange(refresh.data)
    })
    setDiscoveredRepos((prev) =>
      prev
        ? prev.map((r) =>
            r.full_name.toLowerCase() === repoFullName.toLowerCase()
              ? { ...r, already_imported: true, specimen_id: res.id || null }
              : r,
          )
        : null,
    )
  }

  // 当前勾选的编号：始终与现存列表取交集（删过标本后残留的旧勾选不该被发出去）
  const syncSelected =
    syncScopeIds === null
      ? items.map((item) => item.id)
      : syncScopeIds.filter((id) => items.some((item) => item.id === id))

  const toggleSyncId = (id: string) => {
    const next = new Set(syncSelected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSyncScopeIds(items.map((item) => item.id).filter((item) => next.has(item)))
  }

  const invertSyncScope = () => {
    const picked = new Set(syncSelected)
    setSyncScopeIds(items.map((item) => item.id).filter((id) => !picked.has(id)))
  }

  const runGithubSync = async () => {
    if (syncSelected.length === 0) {
      setNoticeError("没有勾选要同步的标本：至少选一个，或点「全选」。")
      return
    }
    setSyncing(true)
    setNoticeBusy(
      syncDocs
        ? `正在从 GitHub 采集 ${syncSelected.length} 个标本的指标并抓取文档…`
        : `正在从 GitHub 采集 ${syncSelected.length} 个标本的最新指标…`,
    )
    const res = await syncGithubRepos(
      githubToken.trim() || undefined,
      syncDocs,
      syncSelected,
    )
    setSyncing(false)
    if (!res.success || !res.results) {
      setNoticeError(`同步失败: ${res.error || "未知错误"}`)
      return
    }
    const results = res.results as GithubSyncResult[]
    setSyncResults(results)
    const synced = results.filter((r) => r.status === "synced").length
    setNotice(
      `同步完成：${synced}/${results.length} 个标本指标已更新。` +
        (typeof res.rateLimitRemaining === "number"
          ? ` GitHub 剩余额度 ${res.rateLimitRemaining}。`
          : ""),
    )
    // 刷新项目列表以反映 stars / 版本 / 更新时间的变化
    verifyAndFetchAdminProjects().then((refresh) => {
      if (refresh.success && refresh.data) onChange(refresh.data)
    })
  }

  // 展示顺序直接采用接口返回的数组顺序（接口已按 sort_order ASC, date DESC 排好）。
  // 不能在这里重排：sort_order 并列时 SQLite 的兜底顺序与 JS 稳定排序可能不同，
  // 会让"上移/下移"作用的邻居错位，出现"改了顺序首页却没变"的假象。
  const orderedItems = items

  const canMove = (id: string, direction: -1 | 1) => {
    const index = orderedItems.findIndex((item) => item.id === id)
    const target = index + direction
    return index >= 0 && target >= 0 && target < orderedItems.length
  }

  /** 上/下移一格：按当前展示顺序重排 sort_order，只写真正变化的行 */
  const moveProject = async (id: string, direction: -1 | 1) => {
    const index = orderedItems.findIndex((item) => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= orderedItems.length) return
    const reordered = [...orderedItems]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]

    setNoticeBusy("正在保存新的展示顺序...")
    const changed = reordered
      .map((item, position) => ({ item, position }))
      .filter(({ item, position }) => (item.sort_order ?? 0) !== position)
    for (const { item, position } of changed) {
      // 只提交 sort_order：整行回写会把这一行打开期间被同步刷新的字段一起盖回旧值
      const res = await saveAdminProject(
        { id: item.id, sort_order: position } as unknown as Project,
        false,
      )
      if (!res.success) {
        setNoticeError(`顺序保存失败: ${res.error || "请检查网络或口令权限"}`)
        return
      }
    }
    const refresh = await verifyAndFetchAdminProjects()
    if (refresh.success && refresh.data) onChange(refresh.data)
    setNotice(`展示顺序已更新（${changed.length} 个项目）。`)
  }

  const filtered = items.filter((item) => {
    const matchesQuery = `${item.name} ${item.cn} ${item.type} ${item.language}`
      .toLowerCase()
      .includes(query.toLowerCase())
    return (
      matchesQuery && (statusFilter === "ALL" || item.status === statusFilter)
    )
  })

  // 抽屉里的当前内容：把逐行文本解析回结构化字段。
  // **保存与「有没有未保存改动」必须共用这一份**，否则会出现"关闭时说没改动、保存却写进去"的分裂。
  const buildDraft = (base: Project): Project => ({
    ...base,
    features: textToFeatures(featuresText),
    metrics: textToMetrics(metricsText),
    timeline: textToTimeline(timelineText),
    // 项目图片（preview_image_url）走它自己的输入框，不再由相册第一张推导
    preview_images_json: JSON.stringify(textToFeatures(previewImagesText)),
  })

  // 相册即时校验：判据与 Worker 写侧同一份（src/utils/previewRules），
  // 于是"填的时候说的坏行"与"点保存后 400 点名的坏行"必然是同一批。服务端仍是最终裁决。
  const galleryLines = textToFeatures(previewImagesText)
  const galleryIssues = galleryRowIssues(galleryLines)

  // 指标/时间线同样即时点名坏行：这些行不会被写库，所以必须在点保存前就说清楚，
  // 不能让它们"静默消失 + 提示没有改动"
  const metricsIssues = parseMetricsText(metricsText).issues
  const timelineIssues = parseTimelineText(timelineText).issues

  // 比对基线：已保存的项目用列表里那一行（管理端投影，保存后以库为准刷新过）；
  // 新建项目用 createProject 生成的空白模板——否则一份没动过的新草稿关闭时也会弹确认。
  const draftBaseline = (base: Project): Project | undefined =>
    items.find((item) => item.id === base.id) ?? newDraftBase ?? undefined

  const dirtyColumnCount = () => {
    if (!editing) return 0
    // 格式错误的行不会被写库，但确实是用户敲进去的内容：关闭前也要提示，避免静默丢失
    const issueCount = (metricsIssues.length ? 1 : 0) + (timelineIssues.length ? 1 : 0)
    const baseline = draftBaseline(editing)
    if (!baseline) return 1 + issueCount
    return (
      Object.keys(
        changedColumns(
          baseline as unknown as Record<string, unknown>,
          buildDraft(editing) as unknown as Record<string, unknown>,
        ),
      ).length + issueCount
    )
  }

  // 关闭抽屉（四条路径都走这里：Esc / 点遮罩 / 右上 × / 底部取消）
  const closeDrawer = () => {
    setConfirmClose(0)
    setEditing(null)
    setPreviewDirText("")
    setDirImportError("")
    setDirImportNote("")
    setReplaceGallery(false)
  }

  // 打开某个已保存项目的抽屉：清掉新建模板基线（否则 items 里查不到这一行时会拿错基线）
  const openProject = (item: Project) => {
    setNewDraftBase(null)
    setConfirmClose(0)
    setEditing(item)
  }

  const requestClose = () => {
    if (!editing) return
    const count = dirtyColumnCount()
    if (count === 0) {
      closeDrawer()
      return
    }
    // 不直接丢：先让用户在「继续编辑 / 放弃并关闭」之间选一次
    setConfirmClose(count)
  }

  // 抽屉打开时支持 Esc 关闭（键盘可达性；抽屉本身已是 role=dialog + aria-modal）。
  // 确认条展开时 Esc 只收起确认条——此时用户刚点过关闭，不该再叠加一次动作。
  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (confirmClose > 0) {
        setConfirmClose(0)
        return
      }
      requestClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [editing, confirmClose, featuresText, metricsText, timelineText, previewImagesText, items])

  // 每次打开抽屉（切换项目或新建）时，把数组字段摊平成可编辑文本
  useEffect(() => {
    if (!editing) return
    setFeaturesText((editing.features ?? []).join("\n"))
    setMetricsText(
      (editing.metrics ?? []).map((metric) => `${metric.label} | ${metric.value}`).join("\n"),
    )
    setTimelineText(
      (editing.timeline ?? [])
        .map((event) => `${event.date} | ${event.title} | ${event.note}`)
        .join("\n"),
    )
    setPreviewImagesText(galleryToText(editing))
  }, [editing?.id])

  const saveProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing || savingProject) return
    // 指标/时间线有坏行时拒绝保存：这些行解析不进结构化字段，静默丢弃再报"没改动"是假状态
    if (metricsIssues.length || timelineIssues.length) {
      setNoticeError("指标或时间线有格式不正确的行（已在对应输入框下逐行标出），修正后再保存。")
      return
    }
    const draft = buildDraft(editing)
    const isNew = !items.some((item) => item.id === draft.id)
    // PUT 只提交**改动过的列**。整行全量回写会把抽屉打开期间后台同步/导入刚写进库的字段
    // （stars、version、README、时间线…）用陈旧值悄悄盖回去——那是另一种"显示成功但库里被改坏"。
    // POST 新建仍提交全量（要落所有列的默认值）。
    // 判据与「未保存改动」提示共用 changedColumns，所以两边不会互相打脸。
    let payload: Project = draft
    if (!isNew) {
      const baseline = items.find((item) => item.id === draft.id)
      if (baseline) {
        const changed = changedColumns(
          baseline as unknown as Record<string, unknown>,
          draft as unknown as Record<string, unknown>,
        )
        if (Object.keys(changed).length === 0) {
          setNotice("没有检测到任何改动，未提交保存。")
          return
        }
        payload = { id: draft.id, ...changed } as unknown as Project
      }
    }
    setSavingProject(true)
    try {
      setNoticeBusy("正在保存到线上库...")
      const res = await saveAdminProject(payload, isNew)
      if (!res.success) {
        setNoticeError(`保存失败: ${res.error || "请检查网络或口令权限"}`)
        return
      }
      // 写入成功 ≠ 列表就是对的：保存后重取管理端列表，以库里的行做回显，
      // 而不是把本地 payload 拼回列表——后者让服务端的规范化结果（演示地址、相册校验）看不见，
      // 于是出现"保存后与刷新后不一样"。同一文件里的「保存展示顺序」已经是这个模式。
      const refresh = await verifyAndFetchAdminProjects()
      if (refresh.success && refresh.data) {
        onChange(refresh.data)
        setNewDraftBase(null)
        closeDrawer()
        setNotice(`「${draft.name}」已保存到线上库。`)
        return
      }
      // 库已写入但回读失败（口令失效/网络抖动）：退化为本地合成，并把状态说清楚，不假装对齐了库。
      // 必须**并入**原有行：payload 是"只含改动列"的部分对象，整行替换会把没提交的列一起抹掉，
      // 于是下一次保存的基线就是残缺的（表现为"改了 A 却把 B 也提交了一遍"）。
      onChange(
        items.some((item) => item.id === payload.id)
          ? items.map((item) => (item.id === payload.id ? { ...item, ...payload } : item))
          : [payload, ...items],
      )
      closeDrawer()
      setNoticeError(
        "资料已写入线上库，但列表回读失败（口令失效或网络抖动）。当前显示的是本次提交的内容，刷新页面可与库对齐。",
      )
    } finally {
      setSavingProject(false)
    }
  }

  // 相册上限来自 src/utils/previewRules.ts —— 与 Worker 写侧、400 文案同一份判据（不是本地再抄一个 12）

  // 详情页大图（preview_image_url）与相册是两个字段，不再自动跟随相册第一张；
  // 这里只给一个"手动带入"的捷径，带过之后两者互不影响
  const useFirstImageAsProjectImage = () => {
    if (!editing) return
    const first = textToFeatures(previewImagesText)[0] ?? ""
    if (!first) {
      setNoticeError("相册里还没有地址：先填相册（或用下面的「按目录导入」），再回来填入。")
      return
    }
    setEditing({ ...editing, preview_image_url: first })
    setNotice("已把相册第一张填入「详情页大图」。之后调整相册顺序不会影响这里。")
  }

  const importPreviewDir = async () => {
    if (!editing) return
    const dir = previewDirText.trim()
    if (!dir) {
      setNoticeError("请先填写预览图所在目录地址。")
      return
    }
    setDirImporting(true)
    setDirImportError("")
    setDirImportNote("")
    setNoticeBusy("正在读取目录...")
    // 带上同步栏里填过的 GitHub 令牌：没有它就只能吃匿名 60 次/小时（多人共享出口会很快 429）
    const res = await fetchPreviewImagesFromDir(dir, githubToken.trim() || undefined)
    setDirImporting(false)
    if (!res.success || !res.images) {
      // 失败原因留在抽屉里（按钮变「重试」、输入不清空），撞配额时额外说明令牌的用处
      const reason = res.error || "没有读到该目录"
      const limited = /频率限制/.test(reason)
      setDirImportError(reason)
      setNoticeError(
        limited
          ? `目录读取失败：${reason} 稍后点「重试」即可；在「GitHub 同步」里填令牌可绕开匿名限额。`
          : `目录读取失败：${reason}`,
      )
      trackUsage(
        "dirimport",
        limited
          ? "ratelimited"
          : /没有找到|无法识别|不是合法/.test(reason)
            ? "notfound"
            : "error",
      )
      return
    }
    // 追加 or 整体替换：满 12 张时"只能追加"等于导入无效，所以给一个显式替换开关
    const merged = replaceGallery ? [] : textToFeatures(previewImagesText)
    let added = 0
    let duplicates = 0
    for (const url of res.images) {
      if (merged.length >= PREVIEW_IMAGE_LIMIT) break
      if (merged.includes(url)) {
        duplicates += 1
        continue
      }
      merged.push(url)
      added += 1
    }
    setPreviewImagesText(merged.join("\n"))
    const notes = [`${replaceGallery ? "替换为" : "新增"} ${added} 张`]
    if (duplicates) notes.push(`跳过重复 ${duplicates} 张`)
    if (res.skippedNonBitmap) notes.push(`过滤非位图 ${res.skippedNonBitmap} 个`)
    if (res.skippedBadge) notes.push(`过滤徽章 ${res.skippedBadge} 个`)
    if (res.subDirectories) notes.push(`子目录 ${res.subDirectories} 个未递归`)
    // 两个不同的"没填入"要分开算：本次返回但被相册上限挤掉的，以及目录里根本没返回的
    const returned = res.images.length
    const droppedByCap = Math.max(0, returned - added - duplicates)
    const neverReturned = Math.max(0, (res.found ?? returned) - returned)
    if (droppedByCap || neverReturned) {
      notes.push(
        `相册上限 ${PREVIEW_IMAGE_LIMIT} 张：${droppedByCap ? `${droppedByCap} 张本次未填` : ""}${droppedByCap && neverReturned ? "，" : ""}${neverReturned ? `目录里还有 ${neverReturned} 张未取回` : ""}`,
      )
    }
    if (!added && !duplicates) notes.push("没有可加入的新地址")
    trackUsage("dirimport", "ok")
    setDirImportNote(`${notes.join("，")}（点「保存项目」才会写入线上库）`)
    setNotice(
      `从 ${res.dir} 读到 ${res.images.length} 张：${notes.join("，")}。确认后点「保存项目」才会写入线上库。`,
    )
  }

  const createProject = () => {
    // 只用纯数字 id 参与推算：列表里一旦出现非数字 id，
    // 原来的 Math.max(...Number) 会算出 "NaN" 并导致保存主键异常
    const numericIds = items
      .map((item) => Number(item.id))
      .filter((value) => Number.isFinite(value))
    let nextNumber = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1
    let id = String(nextNumber).padStart(3, "0")
    while (items.some((item) => item.id === id)) {
      nextNumber += 1
      id = String(nextNumber).padStart(3, "0")
    }
    // 新建项目用空白模板起步：此前是直接展开 projects[0]，
    // 会把标本 001 的简介/挑战/方案/特性/指标/时间线整套复制过来，容易误存成重复内容
    const template: Project = {
      id,
      date: new Date().toISOString().slice(0, 7).replace("-", "."),
      status: "BETA",
      name: "Untitled specimen",
      cn: "未命名标本",
      latin: "Specimen Novum",
      habitat: "Standard",
      type: "App",
      language: "TypeScript",
      stars: "0",
      year: new Date().getFullYear().toString(),
      shape: "aperture",
      version: "v1.0.0",
      updated: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
      repository: "",
      challenge: { en: "", zh: "" },
      solution: { en: "", zh: "" },
      description: { en: "", zh: "" },
      features: [],
      metrics: [],
      timeline: [],
      demoUrl: "",
      demoEnabled: false,
      preview_image_url: "",
      preview_images_json: "[]",
    }
    // 空白模板同时是"未保存改动"的比对基线：新建后一个字没改就直接关，不该弹确认
    setNewDraftBase(template)
    setEditing(template)
  }

  const toggleStatus = async (id: string) => {
    const target = items.find((item) => item.id === id)
    if (!target) return
    const nextStatus: ProjectStatus = target.status === "LIVE" ? "BETA" : "LIVE"
    // DRAFT / ARCHIVED 目前对公众不可见，一键"公开"前必须确认，避免草稿被误发布
    if (target.status === "DRAFT" || target.status === "ARCHIVED") {
      const confirmed = window.confirm(
        `「${target.name}」当前为 ${target.status}（前台不可见），切换后将变为 ${nextStatus} 并立即出现在公开站点。确定继续吗？`,
      )
      if (!confirmed) return
    }
    setNoticeBusy("正在更新状态...")
    // 只提交要改的那一列（PUT 是部分更新）：整行回写会把陈旧字段一起写回库
    const res = await saveAdminProject(
      { id, status: nextStatus } as unknown as Project,
      false,
    )
    if (res.success) {
      onChange(items.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)))
      setNotice(`标本状态已更新为 ${nextStatus}。`)
    } else {
      setNoticeError(`更新状态失败: ${res.error}`)
    }
  }

  const removeProject = async (id: string) => {
    if (items.length <= 1) {
      setNoticeError("馆藏至少需要保留一个项目。")
      return
    }
    if (!window.confirm("确定要从馆藏数据库中永久移除这个标本吗？")) return
    setNoticeBusy("正在从线上库删除...")
    const res = await deleteAdminProject(id)
    if (res.success) {
      onChange(items.filter((item) => item.id !== id))
      setNotice("项目已从线上库移除。")
    } else {
      setNoticeError(`删除失败: ${res.error}`)
    }
  }


  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <button type="button" className="admin-brand" onClick={onExit}>
          <strong>NESTSPACE</strong>
          <span>CURATOR CONSOLE</span>
        </button>
        <nav aria-label="Admin navigation">
          <button
            type="button"
            className={view === "overview" ? "active" : ""}
            onClick={() => setView("overview")}
          >
            <span>01</span> 总览
          </button>
          <button
            type="button"
            className={view === "navigation" ? "active" : ""}
            onClick={() => setView("navigation")}
          >
            <span>02</span> 导航与标头
          </button>
          <button
            type="button"
            className={view === "stats" ? "active" : ""}
            onClick={() => setView("stats")}
          >
            <span>03</span> 馆藏统计
          </button>
          <button
            type="button"
            className={view === "content" ? "active" : ""}
            onClick={() => setView("content")}
          >
            <span>04</span> 内容管理
          </button>
          <button
            type="button"
            className={view === "projects" ? "active" : ""}
            onClick={() => setView("projects")}
          >
            <span>05</span> 项目管理
          </button>
          <button
            type="button"
            className={view === "sync" ? "active" : ""}
            onClick={() => setView("sync")}
          >
            <span>06</span> GitHub 同步
          </button>
          <button
            type="button"
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <span>07</span> 站点设置
          </button>
          <button
            type="button"
            className={view === "footer" ? "active" : ""}
            onClick={() => setView("footer")}
          >
            <span>08</span> 底部栏
          </button>
        </nav>
        <div className="admin-sidebar-foot">
          <span>
            <b /> SYSTEM ONLINE
          </span>
          <button type="button" onClick={onExit}>
            ← 返回公开站点
          </button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="eyebrow">PRIVATE CABINET</span>
            <strong>{viewNames[view]}</strong>
          </div>
          <div className="admin-user">
            <span>NS</span>
            <div>
              <strong>Curator</strong>
              <small>Administrator</small>
            </div>
          </div>
        </header>

        {settingsLoadError && !settingsLoaded && (
          <div className="admin-banner" role="alert">
            <span>
              站点文案未能从线上库载入（{settingsLoadError}）。为避免用内置默认值覆盖线上配置，
              所有保存操作已禁用。
            </span>
            <button type="button" onClick={loadSiteSettings}>
              重新加载
            </button>
          </div>
        )}

        {notice && (
          <div
            className={`admin-notice${noticeKind === "error" ? " is-error" : ""}`}
            // 失败提示用 alert + assertive：它常驻，也该被读屏立刻念出来；
            // 在途/结果类走 status + polite，不打断当前朗读
            role={noticeKind === "error" ? "alert" : "status"}
            aria-live={noticeKind === "error" ? "assertive" : "polite"}
          >
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")}>
              CLOSE
            </button>
          </div>
        )}

        {view === "overview" && (
          <div className="admin-content">
            <div className="admin-page-title">
              <div>
                <span className="eyebrow">CABINET STATUS / 01</span>
                <h1>早上好，Curator</h1>
                <p>这里是当前数字馆藏的生长概况。</p>
              </div>
              <button
                type="button"
                className="admin-primary"
                onClick={() => {
                  setView("projects")
                  createProject()
                }}
              >
                ＋ 新建项目
              </button>
            </div>
            <div className="admin-stats">
              <article>
                <span>项目总数</span>
                <strong>{String(items.length).padStart(2, "0")}</strong>
                <small>馆藏标本</small>
              </article>
              <article>
                <span>已发布</span>
                <strong>
                  {items.filter((item) => item.status === "LIVE").length}
                </strong>
                <small>公开可见</small>
              </article>
              <article>
                <span>总引用 Stars</span>
                <strong>{computeCatalogueStats(items, siteContent).citations}</strong>
                <small>实时计算累加</small>
              </article>
              <article>
                <span>技术语言跨度</span>
                <strong className="status-word">
                  {computeCatalogueStats(items, siteContent).distinctLanguages} 种
                </strong>
                <small>涵盖 {computeCatalogueStats(items, siteContent).distinctHabitats} 个栖息地</small>
              </article>
            </div>
            <div className="admin-overview-grid">
              <article className="admin-panel">
                <header>
                  <div>
                    <span className="eyebrow">ACTIVITY</span>
                    <h2>最近更新</h2>
                  </div>
                  <button type="button" onClick={() => setView("projects")}>
                    查看全部 →
                  </button>
                </header>
                <div className="activity-list">
                  {items.slice(0, 4).map((item, index) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => openProject(item)}
                    >
                      <span className="activity-mark">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>{item.name}</strong>
                        <small>
                          {item.updated}
                          {item.version ? ` · ${item.version}` : ""}
                        </small>
                      </div>
                      <em>{item.status}</em>
                    </button>
                  ))}
                </div>
              </article>
              <article className="admin-panel distribution-panel">
                <header>
                  <div>
                    <span className="eyebrow">DISTRIBUTION</span>
                    <h2>馆藏状态</h2>
                  </div>
                </header>
                <div
                  className="distribution-ring"
                  style={
                    {
                      "--live-share": `${(items.filter((item) => item.status === "LIVE").length / Math.max(items.length, 1)) * 100}%`,
                    } as React.CSSProperties
                  }
                >
                  <div>
                    <strong>{items.length}</strong>
                    <span>TOTAL</span>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>
                      <i /> 已发布
                    </dt>
                    <dd>
                      {items.filter((item) => item.status === "LIVE").length}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <i /> 测试中
                    </dt>
                    <dd>
                      {items.filter((item) => item.status === "BETA").length}
                    </dd>
                  </div>
                </dl>
              </article>
            </div>
          </div>
        )}

        {view === "navigation" && (
          <div className="admin-content">
            <div className="admin-page-title compact">
              <div>
                <span className="eyebrow">HEADER & LOGO / 02</span>
                <h1>导航与标头控制</h1>
                <p>自定义顶部栏导航项顺序、中英名称、展示状态及网站品牌 Logo。</p>
              </div>
              <button
                type="button"
                className="admin-primary"
                onClick={saveSettings}
              >
                保存并生效
              </button>
            </div>

            <div className="settings-grid">
              <section className="settings-card">
                <span className="eyebrow">NAVIGATION ORDER & LABELS</span>
                <h2>导航项控制</h2>
                <p style={{ fontSize: "12px", color: "#64685f", marginTop: "-16px", marginBottom: "16px" }}>
                  通过 ▲ / ▼ 调整顺序——这一份顺序**同时决定顶部栏导航与首页内容段落的排列**（标本陈列 /
                  馆藏统计 / 馆长手记 / 馆藏目录）。「显示」开关只影响导航条里那个链接在不在，
                  不会把对应段落从页面上删掉；段落显隐在「站点设置 → 展示偏好」里单独控制。
                </p>

                <div className="nav-config-list">
                  {(siteContent.navItems && siteContent.navItems.length > 0
                    ? siteContent.navItems
                    : DEFAULT_NAV_ITEMS
                  ).map((item, index) => (
                    <div className="nav-config-item" key={item.id}>
                      <div className="nav-order-btns">
                        <button
                          type="button"
                          title="上移"
                          disabled={index === 0}
                          onClick={() => {
                            const currentList = [
                              ...(siteContent.navItems && siteContent.navItems.length > 0
                                ? siteContent.navItems
                                : DEFAULT_NAV_ITEMS),
                            ]
                            const temp = currentList[index - 1]
                            currentList[index - 1] = currentList[index]
                            currentList[index] = temp
                            setSiteContent({ ...siteContent, navItems: currentList })
                          }}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          title="下移"
                          disabled={
                            index ===
                            (siteContent.navItems && siteContent.navItems.length > 0
                              ? siteContent.navItems.length
                              : DEFAULT_NAV_ITEMS.length) -
                              1
                          }
                          onClick={() => {
                            const currentList = [
                              ...(siteContent.navItems && siteContent.navItems.length > 0
                                ? siteContent.navItems
                                : DEFAULT_NAV_ITEMS),
                            ]
                            const temp = currentList[index + 1]
                            currentList[index + 1] = currentList[index]
                            currentList[index] = temp
                            setSiteContent({ ...siteContent, navItems: currentList })
                          }}
                        >
                          ▼
                        </button>
                      </div>
                      <div>
                        <small style={{ display: "block", fontSize: "9px", color: "#85887f" }}>英文显示</small>
                        <input
                          value={item.labelEn}
                          onChange={(e) => {
                            const currentList = [
                              ...(siteContent.navItems && siteContent.navItems.length > 0
                                ? siteContent.navItems
                                : DEFAULT_NAV_ITEMS),
                            ]
                            const copy = currentList.map((n) =>
                              n.id === item.id ? { ...n, labelEn: e.target.value } : n,
                            )
                            setSiteContent({ ...siteContent, navItems: copy })
                          }}
                          placeholder="英文名称"
                        />
                      </div>
                      <div>
                        <small style={{ display: "block", fontSize: "9px", color: "#85887f" }}>中文显示</small>
                        <input
                          value={item.labelZh}
                          onChange={(e) => {
                            const currentList = [
                              ...(siteContent.navItems && siteContent.navItems.length > 0
                                ? siteContent.navItems
                                : DEFAULT_NAV_ITEMS),
                            ]
                            const copy = currentList.map((n) =>
                              n.id === item.id ? { ...n, labelZh: e.target.value } : n,
                            )
                            setSiteContent({ ...siteContent, navItems: copy })
                          }}
                          placeholder="中文名称"
                        />
                      </div>
                      <label className="visible-toggle">
                        <input
                          type="checkbox"
                          checked={item.visible !== false}
                          onChange={(e) => {
                            const currentList = [
                              ...(siteContent.navItems && siteContent.navItems.length > 0
                                ? siteContent.navItems
                                : DEFAULT_NAV_ITEMS),
                            ]
                            const copy = currentList.map((n) =>
                              n.id === item.id ? { ...n, visible: e.target.checked } : n,
                            )
                            setSiteContent({ ...siteContent, navItems: copy })
                          }}
                        />
                        <span>显示</span>
                      </label>
                      <span className="nav-id-tag">#{item.id}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                  <button
                    type="button"
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #c5c6bf",
                      background: "transparent",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      // 必须与 DEFAULT_NAV_ITEMS 完全一致：mergeSiteSettings 会把 catalogue 补回列表，
                      // 少写它会让「重置」在下次加载后又变成 4 项，看起来像没生效
                      setSiteContent({
                        ...siteContent,
                        navItems: DEFAULT_NAV_ITEMS.map((item) => ({ ...item })),
                      })
                    }}
                  >
                    重置为推荐顺序 (Cabinet → Catalogue → Curator → Index)
                  </button>
                </div>
              </section>

              <section className="settings-card">
                <span className="eyebrow">IDENTITY & BRAND</span>
                <h2>网站 Logo 设置</h2>

                <label>
                  Logo 展示模式
                  <select
                    value={siteContent.logoType || "text"}
                    onChange={(e) =>
                      setSiteContent({
                        ...siteContent,
                        logoType: e.target.value as SiteSettings["logoType"],
                      })
                    }
                  >
                    <option value="text">仅文字 (Text)</option>
                    <option value="image">仅图片/图标 (Image)</option>
                    <option value="both">图文结合 (Both)</option>
                  </select>
                </label>

                <label>
                  Logo 品牌主名称
                  <input
                    value={siteContent.logoText || ""}
                    onChange={(e) =>
                      setSiteContent({ ...siteContent, logoText: e.target.value })
                    }
                    placeholder="NESTSPACE"
                  />
                  <small>在顶部栏左侧突出展示的品牌文本</small>
                </label>

                <label>
                  副标题 / 署名
                  <input
                    value={siteContent.logoSubtext || ""}
                    onChange={(e) =>
                      setSiteContent({ ...siteContent, logoSubtext: e.target.value })
                    }
                    placeholder="ATARAXYECHO"
                  />
                  <small>品牌名称后以破折号连接的辅助署名</small>
                </label>

                <label>
                  Logo 图片地址（留空则用内置品牌标）
                  <input
                    value={siteContent.logoImageUrl || ""}
                    onChange={(e) =>
                      setSiteContent({ ...siteContent, logoImageUrl: e.target.value })
                    }
                    placeholder="留空 = 用内置的深浅两版徽章；填了 = 两个主题都用它"
                  />
                  <small>
                    留空时按主题各用内置的一张（深色主题 <code>/brand/logo-mark-on-dark.png</code> ·{" "}
                    浅色主题 <code>/brand/logo-mark-on-light.png</code>，由{" "}
                    <code>scripts/make-brand-logos.py</code> 从{" "}
                    <code>frontend/design/</code> 的原件生成，后缀指"用在哪种背景上"）。
                    填了地址就两个主题共用它。
                    想用含文字的完整组合标，填 <code>/brand/logo-lockup-on-dark.png</code>（或 on-light）并把显示模式改成「仅图片」
                    （整标在标头图框里读不出字，所以默认用不带字的徽章）。
                    <br />
                    浏览器图标 <code>/brand/favicon.ico</code> 与 <code>/brand/apple-touch-icon.png</code> 由同一个脚本生成，
                    改标时一起更新。
                  </small>
                </label>

                <div className="logo-preview-box">
                  <span>HEADER LOGO PREVIEW / 标头实时预览</span>
                  {/* 两版并排：管理端本身只有一套配色，跟着控制台主题走就永远看不到另一版的实际效果 */}
                  <div className="logo-preview-pair">
                    <div className="logo-preview-cell is-dark">
                      <span className="logo-preview-tag">DARK / 深色</span>
                      <a className="wordmark" href="#cabinet" onClick={(e) => e.preventDefault()}>
                        <LogoContent settings={siteContent} dark />
                      </a>
                    </div>
                    <div className="logo-preview-cell is-light">
                      <span className="logo-preview-tag">LIGHT / 浅色</span>
                      <a className="wordmark" href="#cabinet" onClick={(e) => e.preventDefault()}>
                        <LogoContent settings={siteContent} dark={false} />
                      </a>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="admin-primary"
                  style={{ marginTop: "24px" }}
                  onClick={saveSettings}
                >
                  保存标头与 Logo 设置
                </button>
              </section>
            </div>
          </div>
        )}

        {view === "stats" && (
          <div className="admin-content">
            <div className="admin-page-title compact">
              <div>
                <span className="eyebrow">RECORD & TIMELINE / 03</span>
                <h1>馆藏统计与动态</h1>
                <p>修复与维护前台 Catalogue 统计数据及 ACTIVITY LOG 活跃度时间线。</p>
              </div>
              <button
                type="button"
                className="admin-primary"
                onClick={saveSettings}
              >
                保存统计设置
              </button>
            </div>

            <div className="settings-grid">
              <section className="settings-card">
                <span className="eyebrow">CATALOGUE STATS / 馆藏概览</span>
                <h2>基础指标控制</h2>

                <div
                  style={{
                    padding: "14px",
                    background: "#e8e7e0",
                    border: "1px solid #c8c7bf",
                    marginBottom: "20px",
                    fontSize: "12px",
                    lineHeight: "1.7",
                  }}
                >
                  <div><strong>当前实时计算值：</strong></div>
                  <div>标本总数 (Specimens)：{items.length} 件</div>
                  <div>
                    累计引用 (Citations)：{computeCatalogueStats(items).citations} (基于各项目 stars)
                  </div>
                  <div>涵盖语言 (Range)：{computeCatalogueStats(items).distinctLanguages} 种</div>
                  <div>最早年份 (Since)：{computeCatalogueStats(items).sinceYear}</div>
                  <div>最新更新 (As of)：{computeCatalogueStats(items).asOfDate}</div>
                </div>

                <label>
                  自定义引用量 (CITATIONS)
                  <input
                    value={siteContent.customCitations || ""}
                    onChange={(e) =>
                      setSiteContent({ ...siteContent, customCitations: e.target.value })
                    }
                    placeholder={`留空自动根据项目累加 (${computeCatalogueStats(items).citations})`}
                  />
                  <small>留空时自动计算所有项目的 Stars 之和；填写时以此自定义值为准（如 8.4k、10k）</small>
                </label>

                <label>
                  收录起始年份 (SINCE)
                  <input
                    value={siteContent.statsSinceYear || ""}
                    onChange={(e) =>
                      setSiteContent({ ...siteContent, statsSinceYear: e.target.value })
                    }
                    placeholder={`留空自动取最早年份 (${computeCatalogueStats(items).sinceYear})`}
                  />
                  <small>留空时自动推算项目中最早年份（如 2021）；填写时固定展示该年份</small>
                </label>

                <label>
                  统计截止日期 (AS OF)
                  <input
                    value={siteContent.statsAsOfDate || ""}
                    onChange={(e) =>
                      setSiteContent({ ...siteContent, statsAsOfDate: e.target.value })
                    }
                    placeholder={`留空自动取最新项目更新月 (${computeCatalogueStats(items).asOfDate})`}
                  />
                  <small>如：2024.10 或当前年月</small>
                </label>

                <button
                  type="button"
                  className="admin-primary"
                  onClick={saveSettings}
                >
                  保存馆藏指标设置
                </button>
              </section>

              <section className="settings-card">
                <span className="eyebrow">ACTIVITY LOG / 活跃度年鉴</span>
                <h2>活跃度时间线</h2>

                <label>
                  时间线生成模式
                  <select
                    value={siteContent.activityLogMode || "auto"}
                    onChange={(e) =>
                      setSiteContent({
                        ...siteContent,
                        activityLogMode: e.target.value as "auto" | "custom",
                      })
                    }
                  >
                    <option value="auto">自动根据项目与历程聚合 (推荐)</option>
                    <option value="custom">手动自定义年份与记录数</option>
                  </select>
                  <small>
                    {siteContent.activityLogMode === "auto"
                      ? "自动分析所有项目的发布年份、更新时间与时间线里程碑，动态生成连贯年鉴。"
                      : "手动指定每一年的记录数与权重比例。"}
                  </small>
                </label>

                <div style={{ marginTop: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", fontWeight: "600" }}>时间线年份列表</span>
                    {siteContent.activityLogMode === "custom" && (
                      <button
                        type="button"
                        style={{
                          padding: "4px 10px",
                          fontSize: "11px",
                          cursor: "pointer",
                          border: "1px solid #c5c6bf",
                          background: "#f4f3ee",
                        }}
                        onClick={() => {
                          const current = computeActivityTimeline(items, siteContent)
                          setSiteContent({
                            ...siteContent,
                            activityLogMode: "custom",
                            customActivityLog: current,
                          })
                        }}
                      >
                        从自动数据复制初始化
                      </button>
                    )}
                  </div>

                  <table className="stats-config-table">
                    <thead>
                      <tr>
                        <th>年份</th>
                        <th>动态项数 (权重)</th>
                        <th>高度比例</th>
                        {siteContent.activityLogMode === "custom" && <th>操作</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {computeActivityTimeline(items, siteContent).map((logItem, idx) => (
                        <tr key={logItem.year}>
                          <td><strong>{logItem.year}</strong></td>
                          <td>
                            {siteContent.activityLogMode === "custom" ? (
                              <input
                                type="number"
                                value={logItem.count}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10) || 0
                                  const cur =
                                    siteContent.customActivityLog && siteContent.customActivityLog.length > 0
                                      ? [...siteContent.customActivityLog]
                                      : computeActivityTimeline(items, siteContent)
                                  cur[idx] = { ...cur[idx], count: val }
                                  setSiteContent({ ...siteContent, customActivityLog: cur })
                                }}
                              />
                            ) : (
                              <span>{logItem.count} 项动态</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ width: "60px", height: "8px", background: "#c8c7bf", position: "relative" }}>
                                <div style={{ width: `${logItem.height}%`, height: "100%", background: "#60765c" }} />
                              </div>
                              <span style={{ fontSize: "10px", color: "#777b70" }}>{logItem.height}%</span>
                            </div>
                          </td>
                          {siteContent.activityLogMode === "custom" && (
                            <td>
                              <div className="stats-config-actions">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const copy = [...siteContent.customActivityLog]
                                    copy.splice(idx, 1)
                                    setSiteContent({ ...siteContent, customActivityLog: copy })
                                  }}
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {siteContent.activityLogMode === "custom" && (
                    <button
                      type="button"
                      style={{
                        marginTop: "12px",
                        padding: "6px 14px",
                        border: "1px solid #c5c6bf",
                        background: "#f4f3ee",
                        fontSize: "11px",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        const cur =
                          siteContent.customActivityLog && siteContent.customActivityLog.length > 0
                            ? [...siteContent.customActivityLog]
                            : computeActivityTimeline(items, siteContent)
                        const lastYear = cur.length > 0 ? cur[cur.length - 1].year + 1 : new Date().getFullYear()
                        setSiteContent({
                          ...siteContent,
                          customActivityLog: [...cur, { year: lastYear, count: 2, height: 60 }],
                        })
                      }}
                    >
                      ＋ 新增年份
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="admin-primary"
                  style={{ marginTop: "24px" }}
                  onClick={saveSettings}
                >
                  保存活跃度设置
                </button>
              </section>
            </div>
          </div>
        )}

        {view === "content" && (
          <div className="admin-content">
            <div className="admin-page-title compact">
              <div>
                <span className="eyebrow">EDITORIAL CONTENT / 02</span>
                <h1>内容管理</h1>
                <p>统一维护首页 Hero、馆长手记与公开联系方式。</p>
              </div>
              <button
                type="button"
                className="admin-primary"
                onClick={saveSettings}
              >
                保存并发布
              </button>
            </div>
            <div className="content-tabs" role="tablist" aria-label="内容语言">
              <button
                type="button"
                className={contentLanguage === "zh" ? "active" : ""}
                onClick={() => setContentLanguage("zh")}
              >
                中文内容
              </button>
              <button
                type="button"
                className={contentLanguage === "en" ? "active" : ""}
                onClick={() => setContentLanguage("en")}
              >
                English
              </button>
            </div>
            <div className="content-editor-grid">
              <section className="settings-card">
                <span className="eyebrow">HERO / 首屏</span>
                <h2>首屏叙事</h2>
                <label>
                  主标题
                  <input
                    value={
                      contentLanguage === "zh"
                        ? siteContent.heroZh
                        : siteContent.heroEn
                    }
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        [contentLanguage === "zh" ? "heroZh" : "heroEn"]:
                          event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  副标题
                  <textarea
                    value={
                      contentLanguage === "zh"
                        ? siteContent.subtitleZh
                        : siteContent.subtitleEn
                    }
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        [contentLanguage === "zh"
                          ? "subtitleZh"
                          : "subtitleEn"]: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="content-preview">
                  <span>LIVE PREVIEW</span>
                  <strong>
                    {contentLanguage === "zh"
                      ? siteContent.heroZh
                      : siteContent.heroEn}
                  </strong>
                  <p>
                    {contentLanguage === "zh"
                      ? siteContent.subtitleZh
                      : siteContent.subtitleEn}
                  </p>
                </div>
              </section>
              <section className="settings-card">
                <span className="eyebrow">CURATOR / 馆长手记</span>
                <h2>关于与联系</h2>
                <label>
                  关于我
                  <textarea
                    value={
                      contentLanguage === "zh"
                        ? siteContent.aboutZh
                        : siteContent.aboutEn
                    }
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        [contentLanguage === "zh" ? "aboutZh" : "aboutEn"]:
                          event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  GitHub
                  <input
                    value={siteContent.githubUrl}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        githubUrl: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  联系邮箱
                  <input
                    type="email"
                    value={siteContent.contactEmail}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        contactEmail: event.target.value,
                      })
                    }
                  />
                </label>
              </section>
              <section className="settings-card">
                <span className="eyebrow">CURATOR COPY / 栏目文案</span>
                <h2>手记栏目文案</h2>
                <label>
                  栏目标签（{contentLanguage === "zh" ? "中文" : "English"}）
                  <input
                    value={
                      contentLanguage === "zh"
                        ? siteContent.curatorEyebrowZh
                        : siteContent.curatorEyebrowEn
                    }
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        [contentLanguage === "zh"
                          ? "curatorEyebrowZh"
                          : "curatorEyebrowEn"]: event.target.value,
                      })
                    }
                    placeholder={
                      contentLanguage === "zh" ? "如：馆长手记" : "如：CURATOR'S NOTE"
                    }
                  />
                  <small>显示在栏目标题上方的等宽小字；中英各一份，随访客语言切换</small>
                </label>
                <label>
                  引言（{contentLanguage === "zh" ? "中文" : "English"}）
                  <textarea
                    value={
                      contentLanguage === "zh"
                        ? siteContent.curatorQuoteZh
                        : siteContent.curatorQuoteEn
                    }
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        [contentLanguage === "zh"
                          ? "curatorQuoteZh"
                          : "curatorQuoteEn"]: event.target.value,
                      })
                    }
                  />
                  <small>斜体引言段落，随访客语言切换</small>
                </label>
                <label>
                  主标题（每行一句，前台逐行显示）
                  <textarea
                    value={siteContent.curatorHeadlineEn}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        curatorHeadlineEn: event.target.value,
                      })
                    }
                  />
                  <small>两种语言模式下都会显示；下方中文尾注以斜体接在末尾</small>
                </label>
                <label>
                  主标题 · 中文尾注
                  <input
                    value={siteContent.curatorHeadlineZh}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        curatorHeadlineZh: event.target.value,
                      })
                    }
                  />
                  <small>留空则不显示尾注</small>
                </label>
                <div className="field-row">
                  <label>
                    HABITAT 值
                    <input
                      value={siteContent.curatorHabitat}
                      onChange={(event) =>
                        setSiteContent({
                          ...siteContent,
                          curatorHabitat: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    FIELD 值
                    <input
                      value={siteContent.curatorField}
                      onChange={(event) =>
                        setSiteContent({
                          ...siteContent,
                          curatorField: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="admin-primary"
                  onClick={saveSettings}
                >
                  保存栏目文案
                </button>
              </section>
            </div>
          </div>
        )}

        {view === "footer" && (
          <AdminFooterView
            items={items}
            settings={siteContent}
            contentLanguage={contentLanguage}
            onLanguage={setContentLanguage}
            onPatch={patchFooterPair}
            onSave={saveSettings}
          />
        )}

        {view === "projects" && (
          <div className="admin-content">
            <div className="admin-page-title compact">
              <div>
                <span className="eyebrow">SPECIMEN REGISTER / 02</span>
                <h1>项目管理</h1>
                <p>维护公开馆藏中的项目资料与发布状态。</p>
              </div>
              <button
                type="button"
                className="admin-primary"
                onClick={createProject}
              >
                ＋ 新建项目
              </button>
            </div>
            <div className="project-toolbar">
              <label className="search-field">
                <span>⌕</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索项目、类型或语言"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as typeof statusFilter)
                }
                aria-label="筛选状态"
              >
                <option value="ALL">全部状态</option>
                <option value="LIVE">已发布</option>
                <option value="BETA">测试中</option>
                <option value="DRAFT">私密草稿</option>
                <option value="ARCHIVED">归档下线</option>
              </select>
              <span>{filtered.length} 个结果</span>
            </div>
            <div className="project-table-wrap">
              <table className="project-table">
                <thead>
                  <tr>
                    <th>项目</th>
                    <th>分类</th>
                    <th>技术</th>
                    <th>版本</th>
                    <th>状态</th>
                    <th>最后更新</th>
                    <th>顺序</th>
                    <th>
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="table-id">SPEC—{item.id}</span>
                        <strong>{item.name}</strong>
                        <small>{item.cn}</small>
                      </td>
                      <td>
                        <span className="table-tag">{item.type}</span>
                      </td>
                      <td>{item.language}</td>
                      <td>{item.version || "—"}</td>
                      <td>
                        <button
                          type="button"
                          className={`table-status ${item.status.toLowerCase()}`}
                          onClick={() => toggleStatus(item.id)}
                        >
                          <i /> {item.status}
                        </button>
                      </td>
                      <td>{item.updated}</td>
                      <td>
                        <div className="nav-order-btns">
                          <button
                            type="button"
                            title="上移"
                            disabled={!canMove(item.id, -1)}
                            onClick={() => moveProject(item.id, -1)}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            title="下移"
                            disabled={!canMove(item.id, 1)}
                            onClick={() => moveProject(item.id, 1)}
                          >
                            ▼
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            onClick={() => openProject(item)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => removeProject(item.id)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <div className="empty-state">
                  <strong>没有找到匹配的项目</strong>
                  <span>尝试更换关键词或筛选条件。</span>
                </div>
              )}
            </div>
          </div>
        )}

        {view === "sync" && (
          <div className="admin-content">
            <div className="admin-page-title compact">
              <div>
                <span className="eyebrow">REMOTE COLLECTION / 06</span>
                <h1>GitHub 同步与仓库发现</h1>
                <p>扫描 GitHub 账号的公开仓库、一键导入为馆藏标本，并实时同步各项目的 Stars、Release 版本与更新时间。</p>
              </div>
            </div>

            {/* 配置与触发控制栏 */}
            <div className="sync-toolbar-card">
              <div className="sync-toolbar-grid">
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "600", color: "#555950", display: "block", marginBottom: "6px" }}>
                    GITHUB 账号 / 组织
                  </label>
                  <input
                    type="text"
                    value={githubUser}
                    onChange={(e) => setGithubUser(e.target.value)}
                    placeholder="如 AtaraxyEcho"
                    style={{ width: "100%", padding: "8px 11px", border: "1px solid #c5c6bf", background: "#fdfdfc", fontFamily: "inherit", fontSize: "12px" }}
                  />
                  <small style={{ color: "#777b70", fontSize: "11px", marginTop: "5px", display: "block" }}>
                    默认按「站点设置」中 GitHub 地址自动推导
                  </small>
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "600", color: "#555950", display: "block", marginBottom: "6px" }}>
                    GITHUB TOKEN (可选)
                  </label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => {
                      setGithubToken(e.target.value)
                      if (e.target.value) sessionStorage.setItem("nestspace_gh_token", e.target.value)
                      else sessionStorage.removeItem("nestspace_gh_token")
                    }}
                    placeholder="ghp_xxx (提升 API 限制至 5000 次/时)"
                    style={{ width: "100%", padding: "8px 11px", border: "1px solid #c5c6bf", background: "#fdfdfc", fontFamily: "inherit", fontSize: "12px" }}
                  />
                  <small style={{ color: "#777b70", fontSize: "11px", marginTop: "5px", display: "block" }}>
                    仅保存在本地当前浏览器会话中，防公共 IP 频次超限
                  </small>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", paddingTop: "23px" }}>
                  <button
                    type="button"
                    className="admin-primary"
                    disabled={scanningRepos}
                    onClick={handleScanRepos}
                  >
                    {scanningRepos ? "正在扫描…" : "🔍 扫描 GitHub 仓库"}
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: "8px 16px",
                      border: "1px solid #20241f",
                      background: "transparent",
                      color: "#20241f",
                      cursor: syncing || syncSelected.length === 0 ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      fontFamily: "inherit",
                      fontWeight: "500",
                    }}
                    disabled={syncing || syncSelected.length === 0}
                    onClick={runGithubSync}
                  >
                    {syncing
                      ? "正在采集…"
                      : `⚡ 同步选中标本指标 (${syncSelected.length})`}
                  </button>
                </div>
                <label className="toggle-row" style={{ marginTop: "14px" }}>
                  <span>
                    <strong>同时抓取 README / Compose 文档</strong>
                    <small>
                      按仓库 README.md（含 README.en.md / README.zh*.md）与
                      deploy/dev|prod/docker-compose.yml 抓取；只填充空白字段，不覆盖手工整理的内容
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={syncDocs}
                    onChange={(event) => setSyncDocs(event.target.checked)}
                  />
                </label>
              </div>
            </div>

            {/* 同步范围：以前只有"全表同步"一个按钮，GitHub 匿名配额经常是 0，
                想只刷刚改过的那一两个仓库都做不到（每次都要等整轮跑完或干脆不跑） */}
            <section className="settings-card sync-scope-card" style={{ marginTop: "20px" }}>
              <div className="sync-scope-head">
                <div>
                  <span className="eyebrow">SYNC SCOPE</span>
                  <h2>
                    同步范围 · 已选 {syncSelected.length} / {items.length}
                  </h2>
                </div>
                <div className="sync-scope-quick">
                  <button type="button" onClick={() => setSyncScopeIds(null)}>
                    全选
                  </button>
                  <button type="button" onClick={invertSyncScope}>
                    反选
                  </button>
                  <button type="button" onClick={() => setSyncScopeIds([])}>
                    清空
                  </button>
                </div>
              </div>
              <div className="sync-scope-list" role="group" aria-label="要同步的标本">
                {items.map((item) => (
                  <label key={item.id} className="sync-scope-item">
                    <input
                      type="checkbox"
                      checked={syncSelected.includes(item.id)}
                      onChange={() => toggleSyncId(item.id)}
                    />
                    <span className="sync-scope-id">SPEC—{item.id}</span>
                    <strong>{item.name}</strong>
                    <small>{item.repository || "未填仓库地址 · 同步会标为跳过"}</small>
                  </label>
                ))}
              </div>
            </section>

            {/* 远程仓库扫描发现列表 */}
            <section className="settings-card" style={{ marginTop: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span className="eyebrow">DISCOVERED REPOSITORIES</span>
                  <h2 style={{ margin: "4px 0 0" }}>
                    {githubUser ? `@${githubUser} 的公开仓库` : "代码仓库列表"}
                  </h2>
                </div>
                {discoveredRepos && (
                  <span style={{ fontSize: "12px", color: "#64685f", fontFamily: "monospace" }}>
                    共发现 {discoveredRepos.length} 个仓库 · {discoveredRepos.filter((r) => r.already_imported).length} 件已入馆
                  </span>
                )}
              </div>

              {discoveredRepos === null ? (
                <div className="empty-state" style={{ minHeight: "160px" }}>
                  <strong>尚未扫描 GitHub 仓库</strong>
                  <span>点击上方“🔍 扫描 GitHub 仓库”即可列出 @{githubUser || "当前用户"} 的所有公开仓库并一键导入。</span>
                </div>
              ) : discoveredRepos.length === 0 ? (
                <div className="empty-state" style={{ minHeight: "160px" }}>
                  <strong>未找到公开仓库</strong>
                  <span>该账号下暂无可展示的公开仓库，或请求受到限额阻断。</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto", marginTop: "14px" }}>
                  <table className="sync-discovered-table">
                    <thead>
                      <tr>
                        <th style={{ width: "26%" }}>仓库名称 / 地址</th>
                        <th>简介说明</th>
                        <th style={{ width: "12%" }}>主要语言</th>
                        <th style={{ width: "8%" }}>STARS</th>
                        <th style={{ width: "12%" }}>最近推送</th>
                        <th style={{ width: "18%", textAlign: "right" }}>馆藏状态 / 操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discoveredRepos.map((repo) => (
                        <tr key={repo.id}>
                          <td>
                            <strong style={{ display: "block", fontSize: "13px" }}>{repo.name}</strong>
                            <a
                              href={repo.html_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#777b70", fontSize: "11px", textDecoration: "none" }}
                            >
                              {repo.full_name} ↗
                            </a>
                          </td>
                          <td style={{ color: "#555950", fontSize: "12px", lineHeight: "1.5" }}>
                            {repo.description || "（暂无仓库简介）"}
                          </td>
                          <td>
                            <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#444" }}>
                              {repo.language || "Markdown"}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: "600" }}>
                              ★ {repo.stars}
                            </span>
                          </td>
                          <td style={{ fontSize: "11px", color: "#777b70", fontFamily: "monospace" }}>
                            {repo.updated_at}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {repo.already_imported ? (
                              <span className="sync-badge-imported">
                                已收录 {repo.specimen_id ? `(SPEC—${repo.specimen_id})` : ""}
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="sync-import-btn"
                                disabled={importingRepo === repo.full_name}
                                onClick={() => handleImportRepo(repo.full_name)}
                              >
                                {importingRepo === repo.full_name ? "正在导入…" : "＋ 收录为标本"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 同步原理与最近同步日志 */}
            <div className="sync-layout" style={{ marginTop: "20px" }}>
              <section className="settings-card">
                <span className="eyebrow">HOW IT WORKS</span>
                <h2>同步原理与规范</h2>
                <label>
                  仓库地址兼容
                  <small>
                    支持任意格式：<code>https://github.com/owner/repo</code>、<code>github.com/owner/repo</code> 或 <code>git@github.com:owner/repo.git</code>，系统会自动清洗标准化。
                  </small>
                </label>
                <label>
                  指标自动落库
                  <small>
                    同步成功后，仓库的 Stars 计数、最近 Push 日期（更新 AS OF）和最新 Release Tag（版本号）将自动写入 D1 数据库，前台主页即时更新。
                  </small>
                </label>
              </section>
              <section className="settings-card sync-log">
                <span className="eyebrow">SYNC LOG</span>
                <h2>已有标本同步记录</h2>
                {syncResults === null && (
                  <div className="empty-state">
                    <strong>尚未执行指标同步</strong>
                    <span>在上方「同步范围」里勾选标本，再点“⚡ 同步选中标本指标”刷新它们的远程数据。</span>
                  </div>
                )}
                {syncResults?.map((result, index) => (
                  <div key={result.id}>
                    <span className="activity-mark">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p>
                      <strong>{result.name}</strong>
                      <small>
                        {result.status === "synced"
                          ? `★ ${result.stars} · ${result.version || "无 Release"} · ${result.updated}${result.language ? ` · ${result.language}` : ""}${result.note ? ` · ${result.note}` : ""}`
                          : result.note || result.status}
                      </small>
                    </p>
                    <time>
                      {result.status === "synced" ? "已落库" : result.status === "skipped" ? "已跳过" : "失败"}
                    </time>
                  </div>
                ))}
              </section>
            </div>
          </div>
        )}

        {view === "settings" && (
          <div className="admin-content">
            <div className="admin-page-title compact">
              <div>
                <span className="eyebrow">SITE CONFIGURATION / 03</span>
                <h1>站点设置</h1>
                <p>管理公开站点的基础信息与展示偏好。</p>
              </div>
            </div>
            <div className="settings-grid">
              <section className="settings-card">
                <span className="eyebrow">IDENTITY</span>
                <h2>站点信息</h2>
                <label>
                  站点名称
                  <input
                    value={siteContent.seoTitle}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        seoTitle: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  联系邮箱
                  <input
                    type="email"
                    value={siteContent.contactEmail}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        contactEmail: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  站点简介
                  <textarea
                    value={siteContent.seoDescription}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        seoDescription: event.target.value,
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="admin-primary"
                  onClick={saveSettings}
                >
                  保存更改
                </button>
              </section>
              <section className="settings-card">
                <span className="eyebrow">PREFERENCES</span>
                <h2>展示偏好</h2>
                <label>
                  默认语言
                  <select
                    value={siteContent.defaultLanguage || "auto"}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        defaultLanguage: event.target
                          .value as SiteSettings["defaultLanguage"],
                      })
                    }
                  >
                    <option value="auto">跟随浏览器</option>
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                  <small>决定访客首次进入时的初始语言，之后以访客自己的切换为准</small>
                </label>
                <label>
                  默认主题
                  <select
                    value={siteContent.defaultTheme || "auto"}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        defaultTheme: event.target
                          .value as SiteSettings["defaultTheme"],
                      })
                    }
                  >
                    <option value="auto">跟随系统</option>
                    <option value="light">白日标本室</option>
                    <option value="dark">夜间标本室</option>
                  </select>
                  <small>决定访客首次进入时的深浅色，之后以访客自己的切换为准</small>
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>公开项目统计</strong>
                    <small>
                      关闭后首页隐藏 Catalogue 统计区块，并同步移除导航中的「馆藏统计」
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={siteContent.homeStatsVisible !== false}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        homeStatsVisible: event.target.checked,
                      })
                    }
                  />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>深色模式切换</strong>
                    <small>关闭后前台隐藏深浅色按钮，访客只能使用默认主题</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={siteContent.themeToggleEnabled !== false}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        themeToggleEnabled: event.target.checked,
                      })
                    }
                  />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>中英双语切换</strong>
                    <small>关闭后前台隐藏语言按钮，只按默认语言展示</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={siteContent.languageToggleEnabled !== false}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        languageToggleEnabled: event.target.checked,
                      })
                    }
                  />
                </label>
                <button type="button" className="admin-primary" onClick={saveSettings}>
                  保存展示偏好
                </button>
              </section>
              <section className="settings-card">
                <span className="eyebrow">SEO & SHARING</span>
                <h2>搜索与分享</h2>
                <label>
                  页面标题
                  <input
                    value={siteContent.seoTitle}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        seoTitle: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Meta 描述
                  <textarea
                    value={siteContent.seoDescription}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        seoDescription: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="settings-card-note">
                  社交分享图：当前未配置（站点没有 og:image）。要添加：把图片放进 frontend/public/，
                  并在 .figma/make/site.json 里声明 openGraph.image，重新构建部署后生效。
                </div>
                <p className="settings-card-note">
                  标题与 Meta 描述保存后即时生效：浏览器内直接改写文档标题，同时由边缘 Worker 注入到首页
                  HTML（缓存 60 秒），因此不执行 JS 的爬虫与社交平台也能读到最新值。
                </p>
              </section>
              <section className="settings-card">
                <span className="eyebrow">COMPLIANCE / 合规</span>
                <h2>备案信息 (ICP)</h2>
                <label className="toggle-row">
                  <span>
                    <strong>在页脚展示备案号</strong>
                    <small>默认关闭；开启前请先填写备案号</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={siteContent.icpEnabled}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        icpEnabled: event.target.checked,
                      })
                    }
                  />
                </label>
                <label>
                  备案号
                  <input
                    value={siteContent.icpNumber}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        icpNumber: event.target.value,
                      })
                    }
                    placeholder="如：京ICP备2024000000号-1"
                  />
                </label>
                <label>
                  备案链接
                  <input
                    value={siteContent.icpUrl}
                    onChange={(event) =>
                      setSiteContent({
                        ...siteContent,
                        icpUrl: event.target.value,
                      })
                    }
                    placeholder="https://beian.miit.gov.cn/"
                  />
                </label>
                <button
                  type="button"
                  className="admin-primary"
                  onClick={saveSettings}
                >
                  保存备案设置
                </button>
              </section>
              <section className="settings-card">
                <span className="eyebrow">DOMAIN & DEPLOYMENT</span>
                <h2>域名与部署（只读）</h2>
                <p className="settings-card-note" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
                  主域名、DNS 记录与管理端子域由 Cloudflare 部署配置和代码中的跳转规则决定，
                  后台不提供修改，避免与真实部署状态不一致。
                </p>
                <label>
                  当前访问域名
                  <input
                    readOnly
                    value={typeof window === "undefined" ? "" : window.location.hostname}
                  />
                </label>
                <label>
                  公开站点入口
                  <input
                    readOnly
                    value={
                      isAdminHost() || typeof window === "undefined"
                        ? "https://nestspace.online"
                        : window.location.origin
                    }
                  />
                </label>
                <div className="settings-card-note">
                  发布形态：Worker 静态资产（dist）+ D1；文案与展示偏好保存后即时生效，
                  只有改动代码或新增迁移才需要重新部署。
                </div>
              </section>
            </div>
          </div>
        )}
      </section>

      {editing && (
        <div
          className="editor-backdrop"
          role="presentation"
          onMouseDown={(event) =>
            // 确认条展开时空白处点击不算"再关一次"，只收起确认条
            event.target === event.currentTarget &&
            (confirmClose > 0 ? setConfirmClose(0) : requestClose())
          }
        >
          <form
            className="editor-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-drawer-title"
            onSubmit={saveProject}
          >
            <header>
              <div>
                <span className="eyebrow">SPECIMEN EDITOR</span>
                <h2 id="editor-drawer-title">
                  {items.some((item) => item.id === editing.id)
                    ? "编辑项目"
                    : "新建项目"}
                </h2>
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label="关闭"
              >
                ×
              </button>
            </header>
            <div className="editor-fields">
              <div className="field-row">
                <label>
                  英文名称
                  <input
                    required
                    autoFocus
                    value={editing.name}
                    onChange={(event) =>
                      setEditing({ ...editing, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  中文名称
                  <input
                    required
                    value={editing.cn}
                    onChange={(event) =>
                      setEditing({ ...editing, cn: event.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                拉丁学名
                <input
                  value={editing.latin}
                  onChange={(event) =>
                    setEditing({ ...editing, latin: event.target.value })
                  }
                />
              </label>
              <div className="field-row">
                <label>
                  分类
                  <input
                    value={editing.type}
                    onChange={(event) =>
                      setEditing({ ...editing, type: event.target.value })
                    }
                  />
                </label>
                <label>
                  技术语言
                  <input
                    value={editing.language}
                    onChange={(event) =>
                      setEditing({ ...editing, language: event.target.value })
                    }
                  />
                  <small>由 GitHub 同步覆盖：会被仓库主语言重写（多语言可写进「特性列表」）</small>
                </label>
              </div>
              <div className="field-row">
                <label>
                  版本
                  <input
                    value={editing.version}
                    onChange={(event) =>
                      setEditing({ ...editing, version: event.target.value })
                    }
                  />
                  <small>由 GitHub 同步覆盖：有 Release 时会被最新 tag 重写</small>
                </label>
                <label>
                  状态
                  <select
                    value={editing.status}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        status: event.target.value as Project["status"],
                      })
                    }
                  >
                    <option value="LIVE">LIVE · 正式公开</option>
                    <option value="BETA">BETA · 公开展示</option>
                    <option value="DRAFT">DRAFT · 私密草稿（前台不可见）</option>
                    <option value="ARCHIVED">ARCHIVED · 归档下线（前台不可见）</option>
                  </select>
                  <small>仅 LIVE / BETA 会出现在公开站点；DRAFT 与 ARCHIVED 仅后台可见</small>
                </label>
              </div>
              <div className="field-row">
                <label>
                  栖息地
                  <input
                    value={editing.habitat}
                    onChange={(event) =>
                      setEditing({ ...editing, habitat: event.target.value })
                    }
                  />
                </label>
                <label>
                  几何形态
                  <select
                    value={editing.shape}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        shape: event.target.value as Project["shape"],
                      })
                    }
                  >
                    <option value="aperture">aperture</option>
                    <option value="lumen">lumen</option>
                    <option value="fjord">fjord</option>
                    <option value="meridian">meridian</option>
                  </select>
                </label>
              </div>
              <div className="field-row">
                <label>
                  Stars 展示值
                  <input
                    value={editing.stars}
                    onChange={(event) =>
                      setEditing({ ...editing, stars: event.target.value })
                    }
                  />
                  <small>由 GitHub 同步覆盖：每次同步都会用仓库真实星数重写</small>
                </label>
                <label>
                  年份
                  <input
                    value={editing.year}
                    onChange={(event) =>
                      setEditing({ ...editing, year: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  采集月份
                  <input
                    value={editing.date}
                    onChange={(event) =>
                      setEditing({ ...editing, date: event.target.value })
                    }
                    placeholder="2026.05"
                  />
                </label>
                <label>
                  最近更新
                  <input
                    value={editing.updated}
                    onChange={(event) =>
                      setEditing({ ...editing, updated: event.target.value })
                    }
                    placeholder="2026.05.18"
                  />
                </label>
              </div>
              <label>
                仓库地址
                <input
                  value={editing.repository}
                  onChange={(event) =>
                    setEditing({ ...editing, repository: event.target.value })
                  }
                />
              </label>
              <label>
                演示地址
                <input
                  value={editing.demoUrl}
                  onChange={(event) =>
                    setEditing({ ...editing, demoUrl: event.target.value })
                  }
                  placeholder="https://demo.example.com（可省略协议）"
                />
                <small style={{ display: "block", marginTop: "5px", color: "#7c8076", fontSize: "10px" }}>
                  仅支持 http/https；选「已上线」前必须先填地址。演示机未配 HTTPS 时，浏览器会提示不安全。
                </small>
              </label>
              <label>
                演示入口
                <select
                  value={editing.demoEnabled ? "1" : "0"}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      demoEnabled: event.target.value === "1",
                    })
                  }
                >
                  <option value="0">未上线 · 前台不显示入口</option>
                  <option value="1">已上线 · 前台显示入口</option>
                </select>
              </label>
              <BilingualField
                label="挑战 / 背景"
                hint="前台按语言各取一栏；只填中文时，英文站显示中文并标注「中文原文」"
                value={editing.challenge}
                onChange={(next) => setEditing({ ...editing, challenge: next })}
              />
              <BilingualField
                label="解决方案"
                hint="同上。两栏都空则前台显示「尚未记录」"
                value={editing.solution}
                onChange={(next) => setEditing({ ...editing, solution: next })}
              />
              <label>
                特性列表
                <textarea
                  value={featuresText}
                  onChange={(event) => setFeaturesText(event.target.value)}
                />
                <small>每行一条；仓库有 topics 时会被同步覆盖，无 topics 则保留此处内容</small>
              </label>
              <label>
                指标
                <textarea
                  className={metricsIssues.length ? "is-invalid" : undefined}
                  value={metricsText}
                  onChange={(event) => setMetricsText(event.target.value)}
                  aria-invalid={metricsIssues.length > 0}
                />
                {metricsIssues.length > 0 ? (
                  <ul className="row-issues" role="list">
                    {metricsIssues.map((issue) => (
                      <li key={`metric-${issue.row}`}>
                        第 {issue.row} 行：{issue.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <small>
                  每行一条，格式「标签 | 数值」；STARS / FORKS / OPEN ISSUES 会被同步覆盖。
                  格式不对的行会被逐行标出并拒绝保存（不会偷偷丢掉那一行还提示成功）。
                  标签/数值里不要再用半角竖线——它就是分隔符，用了往返时会被切开
                </small>
              </label>
              <label>
                时间线
                <textarea
                  className={timelineIssues.length ? "is-invalid" : undefined}
                  value={timelineText}
                  onChange={(event) => setTimelineText(event.target.value)}
                  aria-invalid={timelineIssues.length > 0}
                />
                {timelineIssues.length > 0 ? (
                  <ul className="row-issues" role="list">
                    {timelineIssues.map((issue) => (
                      <li key={`timeline-${issue.row}`}>
                        第 {issue.row} 行：{issue.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <small>
                  每行一条，格式「日期 | 标题 | 说明」；勾选 GitHub 同步时会被按仓库事实
                  （建档 / Release / 最近推送）重新生成，手工补充的内容会被覆盖。
                  格式不对的行会被逐行标出并拒绝保存。日期/标题里别用半角竖线——它就是分隔符
                </small>
              </label>
              <div className="field-row">
                <label>
                  排序权重
                  <input
                    type="number"
                    value={editing.sort_order ?? 0}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        sort_order: Number(event.target.value) || 0,
                      })
                    }
                  />
                  <small>数值越小越靠前</small>
                </label>
              </div>
              <label>
                详情页大图（项目图片）
                <input
                  type="text"
                  value={editing.preview_image_url ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, preview_image_url: event.target.value })
                  }
                  placeholder="https://…/cover.png"
                />
                <span className="preview-image-actions">
                  <button type="button" className="button" onClick={useFirstImageAsProjectImage}>
                    用相册第一张填入
                  </button>
                </span>
                <small>
                  这个名字就是它的作用范围：只用于**详情页 hero 的那张大图**。
                  首页卡片仍用占位标本图，分享图(og:image)仍是构建期静态文件，两者都不读这里。
                  它不自动等于相册第一张——留空时对外读取会退化到相册首张，但库里保持为空，
                  只有 README 同步在库里为空时才补；调整相册顺序不会影响这里。
                </small>
              </label>
              <label>
                预览图（相册，每行一个 URL）
                <textarea
                  className={`doc-editor${galleryIssues.length ? " is-invalid" : ""}`}
                  value={previewImagesText}
                  onChange={(event) => setPreviewImagesText(event.target.value)}
                  aria-invalid={galleryIssues.length > 0}
                  placeholder={"https://…/shot-1.png\nhttps://…/shot-2.png"}
                />
                {/* 坏行在点保存之前就点名（判据与 Worker 同一份）；服务端仍然会拒绝，这里只是不让管理员
                    填完十几行 URL 才知道第 7 行缺协议 */}
                {galleryIssues.length > 0 ? (
                  <ul className="row-issues" role="list">
                    {galleryIssues.map((issue) => (
                      <li key={`${issue.row}-${issue.code}`}>
                        第 {issue.row} 行：{issue.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <small>
                  详情页「PREVIEW / 01」观察台的相册；每行必须是可以直接访问的 http/https 绝对地址。
                  任一行非法、重复或超过 {PREVIEW_IMAGE_LIMIT} 张都会拒绝保存并指出第几行
                  （不会偷偷丢掉坏行还提示成功）。全部留空则下次同步从 README 自动提取。
                </small>
              </label>
              <label>
                按目录批量导入预览图
                <span className="preview-dir-row">
                  <input
                    type="text"
                    value={previewDirText}
                    onChange={(event) => setPreviewDirText(event.target.value)}
                    placeholder="raw.githubusercontent.com/owner/repo/main/imgs/desktop"
                  />
                  <button
                    type="button"
                    className="button"
                    onClick={importPreviewDir}
                    disabled={dirImporting}
                  >
                    {dirImporting ? "读取中..." : dirImportError ? "重试" : "读取目录"}
                  </button>
                </span>
                {/* 结果与失败原因都钉在触发它的控件下面：顶部的通知条只有一条，
                    被下一次操作冲掉之后，管理员应当还能在这里看到刚才发生了什么 */}
                {dirImportError ? (
                  <p className="dir-import-line is-error">上次读取失败：{dirImportError}</p>
                ) : null}
                {dirImportNote ? <p className="dir-import-line">{dirImportNote}</p> : null}
                <label className="preview-dir-mode">
                  <input
                    type="checkbox"
                    checked={replaceGallery}
                    onChange={(event) => setReplaceGallery(event.target.checked)}
                  />
                  <span>整体替换现有相册（不勾就是追加）</span>
                </label>
                <small>
                  地址怎么来：在 GitHub 打开图片所在的那个文件夹，**直接复制浏览器地址栏**即可
                  （raw.githubusercontent.com/owner/repo/分支/路径 与 github.com/owner/repo/tree/分支/路径都认）。
                  只列该目录一层：取其中的位图（png/jpg/jpeg/webp/gif/avif/bmp），按文件名排序，跳过徽章与子目录，
                  读到的地址先并入上面的相册文本框（去重、上限 {PREVIEW_IMAGE_LIMIT} 张），
                  **点「保存项目」才会写入线上库**。
                  GitHub 匿名接口配额有限（60 次/小时，共享出口很快用完）；撞限后填好令牌再点「重试」，不必重填地址。
                </small>
              </label>
              {galleryLines.length > 0 ? (
                <div className="preview-thumbs preview-thumbs-admin">
                  {galleryLines.slice(0, PREVIEW_IMAGE_LIMIT).map((url, i) => (
                    <span
                      key={`${url}-${i}`}
                      className={`preview-thumb-admin${
                        galleryIssues.some((issue) => issue.row === i + 1) ? " is-bad" : ""
                      }`}
                      title={url}
                    >
                      {/* 与详情页同一通道：白名单图源走 /api/img 的缩略图档（webp + 边缘缓存），
                          名单外原样直连。以前这里是直连原图——抽屉里 12 张几百 KB 的 PNG，
                          既比公开页慢，看到的又不是访客那一份字节。 */}
                      <img
                        src={proxiedImage(url, IMAGE_WIDTH.thumb)}
                        alt=""
                        loading="lazy"
                        onError={trackImageFailure.bind(null, url)}
                      />
                      <i>{String(i + 1).padStart(2, "0")}</i>
                      {url === (editing.preview_image_url || "").trim() ? <em>详情页大图</em> : null}
                    </span>
                  ))}
                </div>
              ) : null}
              <label>
                内部笔记
                <textarea
                  value={editing.internal_notes ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, internal_notes: event.target.value })
                  }
                />
                <small>仅后台可见，公开接口一律不返回</small>
              </label>
              <label>
                README · 中文 Markdown
                <textarea
                  className="doc-editor"
                  value={editing.readme_zh ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, readme_zh: event.target.value })
                  }
                />
                <small>前台「README」tab 的中文原文；留空则回退到英文 README</small>
              </label>
              <label>
                README · English Markdown
                <textarea
                  className="doc-editor"
                  value={editing.readme_en ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, readme_en: event.target.value })
                  }
                />
                <small>前台「README」tab 的英文原文</small>
              </label>
              <label>
                Compose · dev 编排（deploy/dev/docker-compose.yml）
                <textarea
                  className="doc-editor"
                  value={editing.compose_dev ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, compose_dev: event.target.value })
                  }
                />
              </label>
              <label>
                Compose · prod 编排（deploy/prod/docker-compose.yml）
                <textarea
                  className="doc-editor"
                  value={editing.compose_prod ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, compose_prod: event.target.value })
                  }
                />
              </label>
              <p className="settings-card-note">
                文档最近抓取：{editing.docs_synced_at || "未记录"}。GitHub 同步只填充空白字段，
                不会覆盖这里手工整理的内容；单份文档超过 100000 字符会被截断。
              </p>
              {/* 简介两个语言框都不再 required：同步/导入现在只填"猜得出的那一种语言"
                  （见 pairFromSingleText），另一种留空是正常状态——读侧会回退并标注「原文」。
                  留着 required 等于让管理员必须编一段翻译才能保存。 */}
              <label>
                中文简介
                <textarea
                  value={asBilingual(editing.description).zh}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      description: {
                        ...asBilingual(editing.description),
                        zh: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                英文简介
                <textarea
                  value={asBilingual(editing.description).en}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      description: {
                        ...asBilingual(editing.description),
                        en: event.target.value,
                      },
                    })
                  }
                />
                <small>
                  两种语言至少填一种即可；只填一种时，另一种语言的站点会显示这段并标注「原文」。
                </small>
              </label>
            </div>
            {confirmClose > 0 && (
              <div className="drawer-confirm" role="alertdialog" aria-labelledby="drawer-confirm-text">
                <span id="drawer-confirm-text">
                  有 {confirmClose} 处改动还没保存，关闭就会丢掉（下次打开显示的是库里的内容）。
                </span>
                <span>
                  <button type="button" autoFocus onClick={() => setConfirmClose(0)}>
                    继续编辑
                  </button>
                  <button type="button" className="is-danger" onClick={closeDrawer}>
                    放弃并关闭
                  </button>
                </span>
              </div>
            )}
            <footer>
              <button type="button" onClick={requestClose}>
                取消
              </button>
              <button type="submit" className="admin-primary" disabled={savingProject}>
                {savingProject ? "保存中..." : "保存项目"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </main>
  )
}

// 展示偏好兜底：defaultLanguage/defaultTheme 为 'auto' 时跟随浏览器语言与系统深浅色
function detectBrowserLanguage(): Language {
  if (typeof navigator === "undefined") return "en"
  const candidates = [navigator.language, ...(navigator.languages ?? [])]
  return candidates.some((code) => code?.toLowerCase().startsWith("zh")) ? "zh" : "en"
}

function detectSystemTheme(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

// 与 CSS 的 ≤760 断点是同一个值：JS 侧要知道"侧牌本来就不显示"，好连请求都不发。
// 断点只在这里与 index.css 各写一次数字，改动时两处一起看（组件里没有别的 760 依赖）。
function useNarrowScreen() {
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 760px)").matches,
  )
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(max-width: 760px)")
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return narrow
}

// 详情页预览：左文案栏 + 右「观察台」3D 封面流。
// 只渲染当前张、左右邻张，以及一张代表「后面还有 N 张」的后牌，避免一次解码十几张原图；
// 后牌是纯版面，做成不可聚焦的 div，读屏只走下面的编号条。
// 画框方向跟随当前图：竖图不该被塞进横框里裁掉，所以整台观察台按主图比例换尺寸。
// 动效按站内约定收口：过渡 ≤280ms、后牌不加 blur；
// prefers-reduced-motion 由 CSS 把主牌变换写回静态（JS 写的倾斜变量因此不再生效），
// 但保留 3D 排布——那是版面不是动画，抹掉后侧牌就完全看不见了。
function PreviewGallery({
  images,
  name,
  language,
}: {
  images: string[]
  name: string
  language: Language
}) {
  const [active, setActive] = useState(0)
  const [ratios, setRatios] = useState<Record<number, number>>({})
  // 主牌定妆（load 或 error 都算定妆）之后才去取侧牌/后牌：
  // 冷缓存时首屏只有 1 张 1600 走在前面，而不是 4 张一起抢两跳带宽。
  // 不做尺寸降档 —— 降档会让同一张图产生两种转换变体，免费的第三方转换服务反而吃更多请求。
  const [heroReady, setHeroReady] = useState(false)
  // 放大看图层（存的是要看的那张的下标，null = 未打开）
  const [zoom, setZoom] = useState<number | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<HTMLDivElement>(null)
  // 打开放大层的那个元素：必须在这里（打开时）记，不能等 effect 里读 document.activeElement
  // ——放大层里的关闭按钮带 autoFocus，effect 跑到时焦点已经不在调用方身上了。
  const zoomOpenerRef = useRef<HTMLElement | null>(null)
  const dragX = useRef<number | null>(null)
  const dragged = useRef(false)

  // 依赖必须是相册内容而不是数组引用：标签页醒来会重拉公开数据（App 里的 refreshPublicData），
  // project 对象换了引用 → images 引用也换，用引用当依赖会把访客正在看的那一张硬打回第一张。
  // 相册真的变了（换标本 / 后台改图）才复位，并一起丢掉上一本相册的宽高比。
  // 用 JSON 而不是 join("|")：join 会把 ["a|b"] 和 ["a","b"] 压成同一个键（地址里带竖线时误判为"同一本相册"）
  const albumKey = JSON.stringify(images)
  useEffect(() => {
    setActive(0)
    // 上一本相册的宽高比对新一本没有意义，但空对象就别再生成一个新空对象（省一轮无谓重渲染）
    setRatios((prev) => (Object.keys(prev).length === 0 ? prev : {}))
    setZoom(null)
    setHeroReady(false)
  }, [albumKey])

  // 「看清截图」是这台观察台的存在理由，所以先给它一次曝光计数：
  // deck view = 有人真的看到了相册；之后的翻页带方式（thumb/arrow/drag/key/zoom），
  // 用来回答"缩略图索引有没有让人多看几张"。imgfail 以它为分母算失败率。
  useEffect(() => {
    if (!albumKey) return
    trackUsage("deck", "view")
  }, [albumKey])

  // 放大层打开时锁住页面滚动（关掉要还原），并把键盘操作接管过来：
  // Esc 关闭、←/→ 在同一本相册里继续翻（读图时最常做的两件事）
  useEffect(() => {
    if (zoom === null) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setZoom(null)
        return
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        const delta = event.key === "ArrowLeft" ? -1 : 1
        const count = images.length
        setZoom((value) => (value === null ? value : (value + delta + count) % count))
        trackUsage("deck", "key")
        return
      }
      if (event.key === "Tab") {
        // aria-modal 只是声明；不把焦点环起来，Tab 会走到被遮住的页面后面去
        const root = zoomRef.current
        if (!root) return
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const current = document.activeElement as HTMLElement | null
        const inside = current ? root.contains(current) : false
        if (event.shiftKey && (!inside || current === first)) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (!inside || current === last)) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener("keydown", onKeyDown)
      // 关闭后把焦点还给打开它的那张牌（键盘用户不会掉回页面顶部）
      zoomOpenerRef.current?.focus?.()
    }
  }, [zoom, albumKey])

  // 每张牌的可访问名与图注都要用文件名/目录；相册有 12 张时这是每帧十几次 new URL()，
  // 按相册内容缓存一次。依赖同样是 albumKey 而不是数组引用（理由同上）
  const labels = useMemo(
    () => images.map((url) => frameLabel(url, name)),
    [albumKey, name],
  )

  const total = images.length
  if (total === 0) return null

  const isZh = language === "zh"
  const safeActive = Math.min(active, total - 1)
  const portrait = (ratios[safeActive] ?? 1.6) < 1

  const rememberRatio = (index: number, el: HTMLImageElement) => {
    if (!el.naturalWidth || !el.naturalHeight) return
    const ratio = el.naturalWidth / el.naturalHeight
    setRatios((prev) => (prev[index] === ratio ? prev : { ...prev, [index]: ratio }))
  }

  // 主牌定妆：load 与 error 都算，失败也必须放行侧牌，否则一次坏图会把整台观察台冻住
  const settleHero = (position: string) => {
    if (position === "active") setHeroReady(true)
  }

  const goTo = (index: number, method: "thumb" | "plate") => {
    setActive(index)
    if (method === "thumb") trackUsage("deck", "thumb")
  }

  const step = (delta: number, method: "arrow" | "drag" | "key") => {
    if (total <= 1) return
    trackUsage("deck", method)
    setActive((value) => (value + delta + total) % total)
  }

  // 哪几张牌、站在哪个位置、往后藏了几张，都在 previewFrames() 里（纯函数，已接进 npm test）
  // 窄屏（≤760）只留主牌：CSS 里侧牌是 display:none，但**隐藏不等于不请求**——
  // display:none 的 <img> 照样会发请求，那样"首屏只让一张图抢带宽"就白做了，所以这里直接不渲染。
  const narrow = useNarrowScreen()
  const frames = previewFrames(total, safeActive)
  const visibleFrames = narrow ? frames.filter((frame) => frame.position === "active") : frames
  const hidden = hiddenFrameCount(total, safeActive)

  const resetTilt = () => {
    stageRef.current?.style.setProperty("--tilt-x", "0deg")
    stageRef.current?.style.setProperty("--tilt-y", "0deg")
    dragX.current = null
    dragged.current = false
  }

  const openZoom = () => {
    if (zoom === null) trackUsage("deck", "zoom")
    zoomOpenerRef.current = document.activeElement as HTMLElement | null
    setZoom(safeActive)
  }

  const hint =
    total > 1
      ? isZh
        ? `${total} 张实机截图。拖一拖可以连续翻看，点下面的缩略图直接跳到某一张，点「放大」看清爽度里的字。`
        : `${total} recorded screenshots. Drag to flip through, pick a thumbnail to jump, or hit Enlarge to read the UI.`
      : isZh
        ? "1 张实机截图，可点「放大」看清细节。"
        : "One recorded screenshot — hit Enlarge to read the details."

  return (
    <section className="detail-section preview-section" aria-labelledby="preview-heading">
      <div className="preview-copy">
        <span className="eyebrow">PREVIEW / 01</span>
        <h2 id="preview-heading">
          Inside the specimen <em>/ 项目预览</em>
        </h2>
        <p>{hint}</p>
        <div className="preview-pagination" aria-live="polite">
          <strong>{String(safeActive + 1).padStart(2, "0")}</strong>
          <i
            aria-hidden="true"
            style={
              {
                "--preview-progress": `${Math.round(((safeActive + 1) / total) * 100)}%`,
              } as React.CSSProperties
            }
          />
          <span>{String(total).padStart(2, "0")}</span>
        </div>
      </div>

      <div className="preview-gallery">
        <div
          className={`preview-stage${portrait ? " is-portrait" : ""}`}
          ref={stageRef}
          role="group"
          tabIndex={total > 1 ? 0 : -1}
          aria-label={
            total > 1
              ? isZh
                ? `${name} 预览图，共 ${total} 张，当前第 ${safeActive + 1} 张`
                : `${name} previews, ${total} in total, ${safeActive + 1} shown`
              : `${name} preview`
          }
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault()
              step(-1, "key")
            } else if (event.key === "ArrowRight") {
              event.preventDefault()
              step(1, "key")
            } else if (event.key === "Enter" || event.key === " ") {
              // 舞台本身可聚焦（role=group + tabIndex），回车/空格就该做最想做的事：放大
              event.preventDefault()
              openZoom()
            }
          }}
          onPointerDown={(event) => {
            dragX.current = event.clientX
            dragged.current = false
          }}
          onPointerMove={(event) => {
            // 真的拖动起来才接管指针：没接管成功就完全落回按钮自己的 click，
            // 否则 pointerup 的翻页与 click 的选张会在同一次手势里各改一次
            if (dragX.current !== null && !dragged.current && Math.abs(event.clientX - dragX.current) > 8) {
              try {
                event.currentTarget.setPointerCapture(event.pointerId)
                dragged.current = true
              } catch {
                // 指针可能已在两次事件之间结束：放弃这次拖拽，让它退化成一次普通点击
                dragX.current = null
              }
            }
            if (dragged.current || event.pointerType !== "mouse") return
            const bounds = event.currentTarget.getBoundingClientRect()
            const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
            const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
            stageRef.current?.style.setProperty("--tilt-x", `${(-y * 3.5).toFixed(2)}deg`)
            stageRef.current?.style.setProperty("--tilt-y", `${(x * 5).toFixed(2)}deg`)
          }}
          onPointerUp={(event) => {
            const startX = dragX.current
            const wasDrag = dragged.current
            dragX.current = null
            dragged.current = false
            if (startX === null || !wasDrag) return
            const distance = event.clientX - startX
            if (Math.abs(distance) > 45) step(distance > 0 ? -1 : 1, "drag")
          }}
          onPointerCancel={resetTilt}
          onPointerLeave={resetTilt}
        >
          <div className="preview-orbit" aria-hidden="true" />
          {visibleFrames.map(({ index, position }) => {
            const url = images[index]
            const label = labels[index]
            const frameTag = `FRAME / ${String(index + 1).padStart(2, "0")}`
            const inner = (
              <>
                <span className="frame-index">
                  {frameTag}
                  {position === "back" && hidden > 0 ? ` +${hidden}` : ""}
                </span>
                {/* 侧牌/后牌要等主牌定妆后才发起请求：冷缓存时首屏只让一张 1600 走在前面，
                    而不是四张同时抢两跳（Worker→转换服务）的带宽。命中边缘缓存时这一步几乎瞬时，
                    访客看不出差别。占位 span 保持同样的盒尺寸，免得定妆前后版面跳动。 */}
                {position === "active" || heroReady ? (
                  <img
                    className="frame-shot"
                    src={proxiedImage(url, IMAGE_WIDTH.plate)}
                    // 命中缓存时 load 事件可能早于监听器挂载，complete 分支保证首帧就量对方向
                    ref={(el) => {
                      if (el?.complete) {
                        rememberRatio(index, el)
                        settleHero(position)
                      }
                    }}
                    alt={
                      position === "active"
                        ? isZh
                          ? `${name} 预览图 ${index + 1}`
                          : `${name} preview ${index + 1}`
                        : ""
                    }
                    // 台上最多 4 张、全都在视口内，所以不写 loading="lazy"：
                    // 侧牌先以 lazy 挂载、被选中时才改成 eager，属性翻转不一定重新触发加载，
                    // 会出现「当前张空白 + 量不到方向」；交给浏览器自己按可见性加载
                    decoding="async"
                    fetchPriority={position === "active" ? "high" : "auto"}
                    onLoad={(event) => {
                      rememberRatio(index, event.currentTarget)
                      settleHero(position)
                    }}
                    onError={() => {
                      trackImageFailure(url)
                      settleHero(position)
                    }}
                  />
                ) : (
                  <span className="frame-shot is-pending" aria-hidden="true" />
                )}
                <span className="frame-caption">
                  <strong title={label.title}>{label.title}</strong>
                  {/* 目录只是补充线索：没有目录时 frameLabel 已退回项目名，与页头重复，整行不渲染；
                      读屏走按钮名（编号 + 文件名），不必听完整条 URL 路径 */}
                  {label.path !== name ? (
                    <small aria-hidden="true" title={label.path}>
                      {label.path}
                    </small>
                  ) : null}
                </span>
              </>
            )
            if (position === "back") {
              return (
                <div
                  className="preview-frame"
                  data-position="back"
                  aria-hidden="true"
                  key={`${index}-${url}`}
                >
                  {inner}
                </div>
              )
            }
            return (
              <button
                type="button"
                className="preview-frame"
                data-position={position}
                aria-current={position === "active" ? "true" : undefined}
                // 名字以可见文字「FRAME / 0N」开头再补文件名：既满足 WCAG 2.5.3（名称含可见标签），
                // 又不把整条 URL 目录塞给读屏（目录那行已 aria-hidden）
                aria-label={
                  position === "active"
                    ? isZh
                      ? `${frameTag} ${label.title}（放大查看）`
                      : `${frameTag} ${label.title} (enlarge)`
                    : `${frameTag} ${label.title}`
                }
                tabIndex={-1}
                // 侧牌=选它；主牌=放大看清爽度里的字。拖拽翻页时指针被舞台接管，click 不会落到牌上，
                // 所以"拖一下"不会被误判成"点开放大"
                onClick={() =>
                  position === "active" ? openZoom() : goTo(index, "plate")
                }
                key={`${index}-${url}`}
              >
                {inner}
              </button>
            )
          })}
        </div>

        {/* 索引条：编号 + 微缩略图。纯编号（上一版）无法预告"第 7 张是什么"，
            十几张时只能逐张盲翻；管理端抽屉早就在用同一批 URL 渲染缩略图，前台没理由更弱。
            缩略图走 /api/img 的小档，与管理端共用同一份边缘缓存。 */}
        <div className="preview-controls">
          {total > 1 ? (
            <>
              <button
                type="button"
                className="preview-arrow is-prev"
                onClick={() => step(-1, "arrow")}
                aria-label={isZh ? "上一张预览图" : "Previous preview"}
              >
                ←
              </button>
              <div
                className="preview-index"
                role="group"
                aria-label={isZh ? "预览图选择" : "Preview picker"}
              >
                {images.map((url, index) => {
                  const num = String(index + 1).padStart(2, "0")
                  return (
                    <button
                      type="button"
                      key={`${index}-${url}`}
                      className={index === safeActive ? "active" : ""}
                      aria-current={index === safeActive ? "true" : undefined}
                      // 以可见的编号开头（WCAG 2.5.3），再补文件名；title 留给鼠标
                      aria-label={`${num} ${labels[index].title}`}
                      title={labels[index].title}
                      onClick={() => goTo(index, "thumb")}
                    >
                      <img
                        src={proxiedImage(url, IMAGE_WIDTH.thumb)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={() => trackImageFailure(url)}
                      />
                      <i aria-hidden="true">{num}</i>
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                className="preview-arrow is-next"
                onClick={() => step(1, "arrow")}
                aria-label={isZh ? "下一张预览图" : "Next preview"}
              >
                →
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="preview-enlarge"
            onClick={openZoom}
            aria-label={isZh ? "放大当前预览图" : "Enlarge current preview"}
          >
            {isZh ? "放大" : "Enlarge"}
          </button>
        </div>
      </div>

      {zoom !== null && images[zoom] ? (
        <div
          ref={zoomRef}
          className="preview-zoom"
          role="dialog"
          aria-modal="true"
          aria-label={isZh ? `${name} 预览图放大` : `${name} preview enlarged`}
          onClick={(event) => event.target === event.currentTarget && setZoom(null)}
        >
          <div className="preview-zoom-bar">
            <span>{labels[zoom].title}</span>
            <span className="preview-zoom-count">
              {String(zoom + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
            {total > 1 ? (
              <span className="preview-zoom-nav">
                <button
                  type="button"
                  onClick={() => {
                    setZoom((zoom + total - 1) % total)
                    trackUsage("deck", "arrow")
                  }}
                  aria-label={isZh ? "上一张" : "Previous"}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom((zoom + 1) % total)
                    trackUsage("deck", "arrow")
                  }}
                  aria-label={isZh ? "下一张" : "Next"}
                >
                  →
                </button>
              </span>
            ) : null}
            {/* 原图直链：代理是为了省流量，但访客有权要未经转换的那一份 */}
            <a href={images[zoom]} target="_blank" rel="noopener noreferrer">
              {isZh ? "原图" : "Original"}
            </a>
            <button type="button" autoFocus onClick={() => setZoom(null)} aria-label={isZh ? "关闭放大" : "Close zoom"}>
              ×
            </button>
          </div>
          <img
            className="preview-zoom-shot"
            src={proxiedImage(images[zoom], IMAGE_WIDTH.zoom)}
            alt={isZh ? `${name} 预览图 ${zoom + 1}` : `${name} preview ${zoom + 1}`}
            onError={() => trackImageFailure(images[zoom])}
          />
        </div>
      ) : null}
    </section>
  )
}

function DetailLoading({
  settings,
  onBack,
}: {
  settings: SiteSettings
  onBack: () => void
}) {
  return (
    <main className="detail-page">
      <header className="detail-header">
        <button type="button" className="wordmark" onClick={onBack}>
          {settings.logoText || "NESTSPACE"}{" "}
          <span>— {settings.logoSubtext || "ATARAXYECHO"}</span>
        </button>
        <span className="detail-location">CABINET / RETRIEVING</span>
      </header>
      <section className="detail-hero">
        <div className="detail-placeholder" role="status" aria-live="polite">
          <span className="eyebrow">RETRIEVING SPECIMEN</span>
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
          <p>正在从边缘数据库调取该标本的完整记录…</p>
        </div>
      </section>
    </main>
  )
}

function ProjectNotFound({ id, onBack }: { id: string; onBack: () => void }) {
  return (
    <main className="detail-page">
      <section className="detail-hero">
        <div className="detail-placeholder">
          <span className="eyebrow">SPECIMEN NOT FOUND</span>
          <h1>未找到标本 SPEC—{id}</h1>
          <p>该标本可能尚未公开、已归档，或编号有误。</p>
          <button type="button" className="button primary" onClick={onBack}>
            ← 返回馆藏
          </button>
        </div>
      </section>
    </main>
  )
}

// 详情路由：按 id 拉取完整记录（含 README / Compose），
// 深链或刷新时先显示骨架而不是闪回首页；查不到则给出明确的未找到页面
function ProjectRoute({
  id,
  listed,
  items,
  language,
  dark,
  settings,
  onBack,
  onLanguage,
  onTheme,
  onOpen,
}: {
  id: string
  listed?: Project
  items: Project[]
  language: Language
  dark: boolean
  settings: SiteSettings
  onBack: () => void
  onLanguage: () => void
  onTheme: () => void
  onOpen: (project: Project) => void
}) {
  const [detail, setDetail] = useState<Project | null>(listed ?? null)
  const [state, setState] = useState<"loading" | "ready" | "missing">(
    listed ? "ready" : "loading",
  )

  // 列表里已有该标本时先用列表数据渲染，再补详情（含 README/Compose）；
  // 依赖里带上 listed：避免"详情请求失败 + 列表稍后才到"时错误地停在未找到页且不自愈
  useEffect(() => {
    let alive = true
    if (listed) {
      setDetail(listed)
      setState("ready")
    } else {
      setState("loading")
    }
    fetchPublicProjectById(id)
      .then((data) => {
        if (!alive) return
        if (data) {
          setDetail(data)
          setState("ready")
        } else if (!listed) {
          setState("missing")
        }
      })
      .catch(() => {
        if (!alive) return
        if (!listed) setState("missing")
      })
    return () => {
      alive = false
    }
  }, [id, listed])

  if (state === "loading") return <DetailLoading settings={settings} onBack={onBack} />
  if (state === "missing" || !detail) return <ProjectNotFound id={id} onBack={onBack} />

  return (
    <DetailPage
      project={detail}
      items={items}
      language={language}
      dark={dark}
      settings={settings}
      onBack={onBack}
      onLanguage={onLanguage}
      onTheme={onTheme}
      onOpen={onOpen}
    />
  )
}

export default function App() {
  const [language, setLanguage] = useState<Language>(detectBrowserLanguage)
  const [dark, setDark] = useState(detectSystemTheme)
  const [route, setRoute] = useState(routeFromHash(window.location.hash))
  // 内置演示标本：首屏立即有内容（不等接口），接口不可达时也仍有东西可看。
  // 注意它只是**占位/兜底**，不是「接口返回空就当非空」——成功响应（含空数组）一律采纳，见 refreshPublicData。
  const [items, setItems] = useState<Project[]>(projects)
  // 管理端单独一份行数据：**不能与公开站共用 items**。
  // /api/projects 是对外投影（camel、不含 readme_zh / compose_* / internal_notes / sort_order /
  // preview_images_json 这些抽屉要绑的原始列名），而 refreshPublicData 会在标签页重新聚焦时覆盖 items。
  // 两者共用时，人在后台切出去复制一个 URL 再回来，编辑抽屉就会整片空掉（只有刷新页面才恢复）。
  const [adminItems, setAdminItems] = useState<Project[]>([])
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS)
  // 站点设置是否已从接口返回（无论成功失败），用于决定何时套用展示偏好
  const [settingsResolved, setSettingsResolved] = useState(false)
  // 展示偏好只套用一次，之后不覆盖访客手动切换的语言与主题
  const preferenceApplied = useRef(false)
  // 最近一次公开数据重读时间（节流用）
  const lastRefreshRef = useRef(0)

  // 从边缘 API 同步公开项目数据与站点文案。
  // 管理端跑在独立子域（admin.*），改完顺序/文案后公开页不会自动感知，
  // 因此标签页重新可见或窗口重新获得焦点时重读一次（最短间隔 20s）。
  const refreshPublicData = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastRefreshRef.current < PUBLIC_REFRESH_MIN_INTERVAL_MS) {
      return
    }
    lastRefreshRef.current = now
    try {
      const [projects, settings] = await Promise.all([
        fetchPublicProjects(),
        fetchSiteSettings(),
      ])
      // 成功即采用（**包括空数组**）：空是"没有已发布标本"这个合法事实，
      // 不能因为 length===0 就留着上一批/示例数据。失败时才保持当前内容不动。
      if (Array.isArray(projects)) setItems(projects)
      setSiteSettings(settings)
    } catch (err) {
      console.warn("Public API fetch failed; keeping the last known collection:", err)
    } finally {
      setSettingsResolved(true)
    }
  }, [])

  useEffect(() => {
    refreshPublicData(true)
    const onWake = () => {
      if (document.visibilityState === "visible") refreshPublicData()
    }
    window.addEventListener("focus", onWake)
    document.addEventListener("visibilitychange", onWake)
    return () => {
      window.removeEventListener("focus", onWake)
      document.removeEventListener("visibilitychange", onWake)
    }
  }, [refreshPublicData])

  // 顶部进度条 = 整页滚动进度。以前它由 cabinet（螺旋段）自己的滚动比例写入，
  // 而栏目顺序现在可配置：cabinet 一旦被拖到后面，前几段全程读 0，进度条看着是坏的。
  useEffect(() => {
    const root = document.documentElement
    const update = () => {
      const scrollable = root.scrollHeight - window.innerHeight
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 0
      root.style.setProperty("--page-progress", Math.min(1, Math.max(0, ratio)).toFixed(4))
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [route, items.length, siteSettings])

  // 从后台回到公开站时重读一次公开数据：后台期间的改动要在前台立刻可见。
  // 挂在路由变化上而不是"退出按钮"上——直接改 hash、浏览器前进后退同样会离开后台。
  const wasOnAdminRoute = useRef(route === "admin")
  useEffect(() => {
    const onAdmin = route === "admin"
    if (wasOnAdminRoute.current && !onAdmin) refreshPublicData(true)
    wasOnAdminRoute.current = onAdmin
  }, [route, refreshPublicData])

  // 套用管理端配置的展示偏好（仅一次）：显式指定语言/主题时覆盖初始值
  useEffect(() => {
    if (!settingsResolved || preferenceApplied.current) return
    preferenceApplied.current = true
    if (siteSettings.defaultLanguage === "zh" || siteSettings.defaultLanguage === "en") {
      setLanguage(siteSettings.defaultLanguage)
    }
    if (siteSettings.defaultTheme === "light" || siteSettings.defaultTheme === "dark") {
      setDark(siteSettings.defaultTheme === "dark")
    }
  }, [settingsResolved, siteSettings.defaultLanguage, siteSettings.defaultTheme])

  // 关闭首页统计时同时摘掉对应导航项，避免留下点不到的入口（顶栏与页脚都读 navItems）
  const effectiveSettings = useMemo(() => {
    if (siteSettings.homeStatsVisible !== false) return siteSettings
    const list = siteSettings.navItems?.length ? siteSettings.navItems : DEFAULT_NAV_ITEMS
    return {
      ...siteSettings,
      navItems: list.filter((item) => item.id !== "catalogue"),
    }
  }, [siteSettings])

  // 管理端修改 SEO 标题/描述后即时应用到文档（初始值仍来自构建产物）
  useEffect(() => {
    if (siteSettings.seoTitle) {
      document.title = siteSettings.seoTitle
    }
    if (siteSettings.seoDescription) {
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", siteSettings.seoDescription)
    }
  }, [siteSettings.seoTitle, siteSettings.seoDescription])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light"
  }, [dark])

  // 语言切换同步到 <html lang>：读屏软件与搜索引擎按此判定页面语言。
  // 构建产物里的初始 lang 来自 .figma/make/site.json，这里负责运行时跟随切换。
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en"
  }, [language])

  // useLayoutEffect 而不是 useEffect：这个跳转必须在**首次绘制之前**发生，
  // 否则生产站点访问 #admin 会先闪一下公开首页再跳走（routeFromHash 如今只做纯解析、不再在渲染期跳转）。
  useLayoutEffect(() => {
    // 生产环境中，若在公开主站通过 #admin 访问后台，平滑跳转到受 Zero Trust 保护的专属子域名
    const checkRedirect = () => {
      if (
        typeof window !== "undefined" &&
        window.location.hash === "#admin" &&
        !isAdminHost() &&
        !["localhost", "127.0.0.1"].includes(window.location.hostname)
      ) {
        window.location.href = "https://admin.nestspace.online"
        return true
      }
      return false
    }

    if (checkRedirect()) return

    const onHashChange = () => {
      if (checkRedirect()) return
      const clean = window.location.hash.replace(/^#/, "")
      setRoute(routeFromHash(window.location.hash))
      // 章节锚点交由浏览器原生滚动定位；其余路由（详情页/管理端/返回）回到顶部
      if (!clean || !SECTION_ANCHORS.includes(clean)) {
        window.scrollTo({ top: 0 })
      }
    }
    window.addEventListener("hashchange", onHashChange)
    window.addEventListener("popstate", onHashChange)
    return () => {
      window.removeEventListener("hashchange", onHashChange)
      window.removeEventListener("popstate", onHashChange)
    }
  }, [])


  useEffect(() => {
    if (route !== "home") return
    const id = window.location.hash.replace(/^#/, "")
    if (!SECTION_ANCHORS.includes(id) || id === "cabinet") return
    // 从详情页页脚章节链接、或直接带 #index 之类的 URL 进入时，等首页渲染完再定位
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
    })
    return () => cancelAnimationFrame(frame)
  }, [route])

  useEffect(() => {
    if (route !== "home") return
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible")
          } else {
            // 当元素离开视口时移除 is-visible 类，使反向/往回滚动时能够重新触发入场动画
            entry.target.classList.remove("is-visible")
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    )
    document
      .querySelectorAll(".section, .site-footer")
      .forEach((element) => observer.observe(element))
    return () => observer.disconnect()
    // 依赖不能只有 route：段落顺序可配置、馆藏统计可被隐藏后再打开（homeStatsVisible），
    // 那些**之后**才挂载的 .section 若不在这里重新 observe，就永远拿不到 .is-visible，
    // 里面的 .stat-card 一类初始 opacity:0 的内容会整片看不见。
  }, [route, items.length, siteSettings, effectiveSettings.navItems])

  const navigate = (next: string) => {
    if (next === "home") {
      if (window.location.hash) {
        window.history.pushState(null, "", window.location.pathname)
      }
      setRoute("home")
      window.scrollTo({ top: 0 })
    } else {
      window.location.hash = next
    }
  }

  const openProject = (project: Project) => navigate(`project/${project.id}`)

  if (route === "admin") {
    return (
      <AdminGateway
        items={adminItems}
        onChange={setAdminItems}
        onExit={() => {
          if (isAdminHost()) {
            window.location.href = "https://nestspace.online"
          } else {
            // 回前台后的公开数据重读由路由变化那条 effect 负责（覆盖前进/后退与直接改 hash）
            navigate("home")
          }
        }}
      />
    )
  }

  // 详情路由由 ProjectRoute 自行按 id 拉取完整记录：
  // 深链/刷新时不再因列表尚未返回而渲染首页，同时拿到 README / Compose 文档
  if (route.startsWith("project/")) {
    const projectId = route.split("/")[1]
    return (
      <ProjectRoute
        key={projectId}
        id={projectId}
        listed={items.find((item) => item.id === projectId)}
        items={items}
        language={language}
        dark={dark}
        settings={effectiveSettings}
        onBack={() => navigate("home")}
        onLanguage={() => setLanguage(language === "en" ? "zh" : "en")}
        onTheme={() => setDark(!dark)}
        onOpen={openProject}
      />
    )
  }

  const homeSections = orderHomeSections(effectiveSettings.navItems)
  // 接口**明确回报空馆藏**时（后台把项目全下架）不再拿内置示例顶着说"有数据"：
  // 只留下不依赖数据的「馆长手记」，并给一句明确的空状态说明。
  // 接口失败时 items 保持不动（首屏的内置示例继续显示），所以空状态只代表"服务端说空"。
  const collectionEmpty = settingsResolved && items.length === 0
  const shownSections = collectionEmpty
    ? homeSections.filter((id) => id === "curator")
    : homeSections

  return (
    <main>
      <Header
        language={language}
        setLanguage={setLanguage}
        dark={dark}
        setDark={setDark}
        settings={effectiveSettings}
      />
      {collectionEmpty ? (
        <section className="section" id="empty-collection">
          <p className="section-empty">
            {language === "zh"
              ? "馆藏尚未公开任何标本——请在管理端把项目状态设为 LIVE 或 BETA。"
              : "No specimens are published yet — set a project to LIVE or BETA in the admin console."}
          </p>
        </section>
      ) : null}
      {/* 段落顺序跟着管理端的导航顺序走（orderHomeSections 是纯函数、有闸门测试）。
          以前这四段写死在 JSX 里，导航条却可拖序——同一个设置只管到一半。
          馆藏统计的显隐仍由「展示偏好」的 homeStatsVisible 决定：导航项的 visible 只管导航条，
          两件事刻意不合并（合并后"隐藏一个链接"会顺手把整段内容从页面上弄丢）。 */}
      {shownSections.map((id) => {
        switch (id) {
          case "cabinet":
            return (
              <SpiralGallery
                key={id}
                language={language}
                items={items}
                settings={effectiveSettings}
                onOpen={openProject}
              />
            )
          case "catalogue":
            return siteSettings.homeStatsVisible !== false ? (
              <CatalogueStats
                key={id}
                language={language}
                items={items}
                settings={effectiveSettings}
              />
            ) : null
          case "curator":
            return <Curator key={id} language={language} settings={effectiveSettings} />
          case "index":
            return <SpecimenIndex key={id} items={items} onOpen={openProject} />
        }
      })}
      <SiteFooter
        items={items}
        settings={effectiveSettings}
        language={language}
        onOpen={openProject}
      />
    </main>
  )
}
