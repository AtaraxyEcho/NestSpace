import { useEffect, useMemo, useRef, useState } from "react"
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
  type RemoteGithubRepo,
} from "./api/adminClient"
import type { SiteSettings, NavItemConfig } from "./types/siteSettings"
import { computeCatalogueStats, computeActivityTimeline } from "./utils/stats"
import { renderMarkdown } from "./utils/markdown"


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
          <p className="description">{project.description[language]}</p>
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

// 站内章节锚点：Cabinet → Catalogue → Curator → Index
const SECTION_ANCHORS = ["cabinet", "catalogue", "curator", "index", "colophon"]

// 详情页页签顺序：role=tab 的 aria-controls/id 与左右方向键导航都以此为准
const DETAIL_TABS = ["overview", "readme", "deployment"] as const

export function isAdminHost(): boolean {
  if (typeof window === "undefined") return false
  const host = window.location.hostname.toLowerCase()
  return host === "admin.nestspace.online" || host.startsWith("admin.")
}

function routeFromHash(hash: string) {
  if (isAdminHost()) return "admin"
  const clean = hash.replace(/^#/, "")
  // 若在生产公开站点直接访问 #admin，同步且立即跳转至 Zero Trust 保护的 admin 子域名
  if (
    clean === "admin" &&
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1"].includes(window.location.hostname)
  ) {
    window.location.replace("https://admin.nestspace.online")
    return "home"
  }
  if (!clean || SECTION_ANCHORS.includes(clean)) return "home"
  return clean
}

function LogoWordmark({ settings }: { settings: SiteSettings }) {
  const logoText = settings.logoText || "NESTSPACE"
  const logoSubtext = settings.logoSubtext || "ATARAXYECHO"
  const logoType = settings.logoType || "text"
  const logoImageUrl = settings.logoImageUrl

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
      {logoType !== "text" && logoImageUrl ? (
        <img src={logoImageUrl} alt={logoText} className="wordmark-logo-img" />
      ) : null}
      {logoType !== "image" ? (
        <>
          {logoText}
          {logoSubtext ? <span> — {logoSubtext}</span> : null}
        </>
      ) : null}
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
      <LogoWordmark settings={settings} />
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
      document.documentElement.style.setProperty("--page-progress", `${p}`)
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
        <span className="eyebrow">CURATOR'S NOTE / 馆长手记</span>
        <h2>
          Build things
          <br />
          that take root <em>/ 把复杂的事做简单</em>
        </h2>
        <blockquote>
          {language === "zh"
            ? "好的工具不应索取注意力。它应当安静地扎根，然后让别的事物生长。"
            : "A good tool does not ask for attention. It takes root quietly, then makes room for other things to grow."}
        </blockquote>
        <p>
          {" "}
          {settings.aboutEn}
        </p>
        <p>{settings.aboutZh}</p>
        <dl>
          <div>
            <dt>HABITAT</dt>
            <dd>Shanghai / Remote</dd>
          </div>
          <div>
            <dt>FIELD</dt>
            <dd>Design & Engineering</dd>
          </div>
          <div>
            <dt>GITHUB</dt>
            <dd>
              <a
                href={settings.githubUrl}
                target="_blank"
                rel="noreferrer"
              >
                {settings.githubUrl.replace(/^https?:\/\//, "")}
              </a>
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
  return text
    .replace(/\{name\}/g, vars.name)
    .replace(/\{since\}/g, vars.since)
    .replace(/\{year\}/g, String(vars.year))
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
          <a
            href={settings.githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            {copy(settings.footerGithubLabelEn, settings.footerGithubLabelZh)}
          </a>
          <a href={`mailto:${settings.contactEmail}`}>
            {copy(settings.footerContactLabelEn, settings.footerContactLabelZh)}
          </a>
        </div>
      </div>
      <div className="footer-bottom" id="colophon">
        <span>
          {fill(copy(settings.footerColophonLineEn, settings.footerColophonLineZh))}
        </span>
        {settings.icpEnabled && settings.icpNumber ? (
          <a
            href={settings.icpUrl || "https://beian.miit.gov.cn/"}
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
  const [detailTab, setDetailTab] =
    useState<"overview" | "readme" | "deployment">("overview")

  // README：优先当前语言，缺失时回退另一种语言并给出提示
  const readmeZh = (project.readmeZh ?? "").trim()
  const readmeEn = (project.readmeEn ?? "").trim()
  const preferredReadme = language === "zh" ? readmeZh : readmeEn
  const fallbackReadme = language === "zh" ? readmeEn : readmeZh
  const readmeText = preferredReadme || fallbackReadme
  const readmeFromFallback = !preferredReadme && Boolean(fallbackReadme)
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
          {settings.logoType !== "text" && settings.logoImageUrl ? (
            <img src={settings.logoImageUrl} alt={settings.logoText || "NESTSPACE"} className="wordmark-logo-img" />
          ) : null}
          {settings.logoType !== "image" ? (
            <>
              {settings.logoText || "NESTSPACE"} <span>— {settings.logoSubtext || "ATARAXYECHO"}</span>
            </>
          ) : null}
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
              // 中文简介可能为空（导入不再把英文塞进 zh 字段）：回退到另一种语言，
              // 而不是留一段空白
              const intro =
                project.description[language] ||
                project.description[language === "zh" ? "en" : "zh"]
              return intro ? (
                <p className="detail-intro">{intro}</p>
              ) : (
                <p className="detail-intro section-empty">尚未填写简介</p>
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
          <div className="detail-plate">
            <CropMarks />
            <span className="plate-code">NS / {project.id}</span>
            <SpecimenSvg shape={project.shape} />
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
        <section className="detail-section" id="field-notes">
          <div className="detail-section-label">
            <span className="eyebrow">FIELD NOTES / 01</span>
            <span>CONTEXT & RESPONSE</span>
          </div>
          <div className="detail-narrative">
            <article>
              <span>THE CONDITION</span>
              <h2>Why it needed to exist.</h2>
              {project.challenge ? (
                <p>{project.challenge}</p>
              ) : (
                <p className="section-empty">尚未记录</p>
              )}
            </article>
            <article>
              <span>THE RESPONSE</span>
              <h2>A narrow tool, carefully shaped.</h2>
              {project.solution ? (
                <p>{project.solution}</p>
              ) : (
                <p className="section-empty">尚未记录</p>
              )}
            </article>
          </div>
        </section>

        <section className="detail-section capability-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ANATOMY / 02</span>
              <h2>
                Core capabilities <em>/ 标本特征</em>
              </h2>
            </div>
            <span className="as-of">
              {String(project.features.length).padStart(2, "0")} TRAITS
            </span>
          </div>
          {project.features.length > 0 ? (
            <div className="capability-grid">
              {project.features.map((feature, index) => (
                <article key={feature}>
                  <span>0{index + 1}</span>
                  <h3>{feature}</h3>
                </article>
              ))}
            </div>
          ) : (
            <p className="section-empty">暂无特征标签</p>
          )}
          {project.metrics.length > 0 ? (
            <div className="metric-strip">
              {project.metrics.map((metric) => (
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
            <span className="eyebrow">EVOLUTION / 03</span>
            <span>A LIVING SPECIMEN</span>
          </div>
          {project.timeline.length > 0 ? (
            <div className="evolution-list">
              {project.timeline.map((event, index) => (
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
                    <span>{entry.path}</span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(entry.content)}
                    >
                      COPY
                    </button>
                    <pre>
                      <code>{entry.content}</code>
                    </pre>
                  </div>
                </div>
              ))
            )}
            <h3 id="env-vars">环境变量</h3>
            <div className="code-block">
              <span>.ENV.PRODUCTION</span>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard?.writeText(
                    `PUBLIC_REPOSITORY=${project.repository}${
                      demoUrl
                        ? `\nPUBLIC_DEMO_URL=${demoUrl}`
                        : ""
                    }`,
                  )
                }
              >
                COPY
              </button>
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
            <span className="eyebrow">NEIGHBOURING SPECIMENS / 04</span>
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

function textToMetrics(text: string): Project["metrics"] {
  return text
    .split("\n")
    .map((line) => line.split("|"))
    .filter((parts) => parts.length >= 2 && parts[0].trim() !== "")
    .map((parts) => ({
      label: parts[0].trim(),
      value: parts.slice(1).join("|").trim(),
    }))
}

function textToTimeline(text: string): Project["timeline"] {
  return text
    .split("\n")
    .map((line) => line.split("|"))
    .filter((parts) => parts.length >= 2 && parts[0].trim() !== "")
    .map((parts) => ({
      date: parts[0].trim(),
      title: (parts[1] ?? "").trim(),
      note: parts.slice(2).join("|").trim(),
    }))
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
  const [notice, setNotice] = useState("")
  const [contentLanguage, setContentLanguage] = useState<Language>("zh")
  // 站点文案与合规设置：初始为内置默认值，挂载后从 D1 拉取覆盖
  const [siteContent, setSiteContent] = useState<SiteSettings>({
    ...DEFAULT_SITE_SETTINGS,
  })
  const [syncing, setSyncing] = useState(false)
  // 是否在同步指标的同时抓取 README / Compose 文档
  const [syncDocs, setSyncDocs] = useState(false)
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
      setNotice("站点文案尚未从 D1 加载成功，已阻止保存以避免覆盖线上配置。请先点上方「重新加载」。")
      return
    }
    setNotice("正在保存站点设置到 Cloudflare D1...")
    const res = await saveAdminSiteSettings(siteContent)
    setNotice(
      res.success
        ? "站点设置已保存，刷新公开站点即可生效。"
        : `保存失败: ${res.error || "请检查网络或口令权限"}`,
    )
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
      setNotice("请输入 GitHub 用户名")
      return
    }
    setScanningRepos(true)
    setNotice(`正在扫描 GitHub 用户 @${githubUser.trim()} 的所有公开仓库…`)
    const res = await fetchGithubUserRepos(githubUser.trim(), githubToken.trim() || undefined)
    setScanningRepos(false)
    if (!res.success || !res.repos) {
      setNotice(`扫描失败: ${res.error || "请检查网络或用户名"}`)
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
    setNotice(`正在将 ${repoFullName} 导入为馆藏标本…`)
    const res = await importGithubRepo(repoFullName, githubToken.trim() || undefined)
    setImportingRepo(null)
    if (!res.success) {
      setNotice(`导入失败: ${res.error}`)
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

  const runGithubSync = async () => {
    setSyncing(true)
    setNotice(
      syncDocs
        ? "正在从 GitHub 采集指标并抓取 README / Compose 文档…"
        : "正在从 GitHub 采集已有标本的最新指标…",
    )
    const res = await syncGithubRepos(githubToken.trim() || undefined, syncDocs)
    setSyncing(false)
    if (!res.success || !res.results) {
      setNotice(`同步失败: ${res.error || "未知错误"}`)
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

  const filtered = items.filter((item) => {
    const matchesQuery = `${item.name} ${item.cn} ${item.type} ${item.language}`
      .toLowerCase()
      .includes(query.toLowerCase())
    return (
      matchesQuery && (statusFilter === "ALL" || item.status === statusFilter)
    )
  })

  // 抽屉打开时支持 Esc 关闭（键盘可达性；抽屉本身已是 role=dialog + aria-modal）
  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(null)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [editing])

  // 每次打开抽屉（切换项目或新建）时，把数组字段摊平成可编辑文本
  useEffect(() => {
    if (!editing) return
    setFeaturesText(editing.features.join("\n"))
    setMetricsText(
      editing.metrics.map((metric) => `${metric.label} | ${metric.value}`).join("\n"),
    )
    setTimelineText(
      editing.timeline
        .map((event) => `${event.date} | ${event.title} | ${event.note}`)
        .join("\n"),
    )
  }, [editing?.id])

  const saveProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    // 数组字段以逐行文本编辑，保存前统一解析回结构化数据
    const payload: Project = {
      ...editing,
      features: textToFeatures(featuresText),
      metrics: textToMetrics(metricsText),
      timeline: textToTimeline(timelineText),
    }
    const isNew = !items.some((item) => item.id === payload.id)
    setNotice("正在持久化到 Cloudflare D1 边缘数据库...")
    const res = await saveAdminProject(payload, isNew)
    if (res.success) {
      onChange(
        items.some((item) => item.id === payload.id)
          ? items.map((item) => (item.id === payload.id ? payload : item))
          : [payload, ...items],
      )
      setEditing(null)
      setNotice("项目资料已成功保存并同步到 Cloudflare D1 数据库。")
    } else {
      setNotice(`保存失败: ${res.error || "请检查网络或口令权限"}`)
    }
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
    setEditing({
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
      challenge: "",
      solution: "",
      description: { en: "", zh: "" },
      features: [],
      metrics: [],
      timeline: [],
      demoUrl: "",
      demoEnabled: false,
    })
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
    const updated: Project = { ...target, status: nextStatus }
    setNotice("正在更新状态...")
    const res = await saveAdminProject(updated, false)
    if (res.success) {
      onChange(items.map((item) => (item.id === id ? updated : item)))
      setNotice(`标本状态已更新为 ${nextStatus}。`)
    } else {
      setNotice(`更新状态失败: ${res.error}`)
    }
  }

  const removeProject = async (id: string) => {
    if (items.length <= 1) {
      setNotice("馆藏至少需要保留一个项目。")
      return
    }
    if (!window.confirm("确定要从馆藏数据库中永久移除这个标本吗？")) return
    setNotice("正在从 D1 数据库删除...")
    const res = await deleteAdminProject(id)
    if (res.success) {
      onChange(items.filter((item) => item.id !== id))
      setNotice("项目已从 D1 数据库成功移除。")
    } else {
      setNotice(`删除失败: ${res.error}`)
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
              站点文案未能从 D1 载入（{settingsLoadError}）。为避免用内置默认值覆盖线上配置，
              所有保存操作已禁用。
            </span>
            <button type="button" onClick={loadSiteSettings}>
              重新加载
            </button>
          </div>
        )}

        {notice && (
          <div className="admin-notice" role="status">
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
                      onClick={() => setEditing(item)}
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
                  通过 ▲ / ▼ 调整顶部栏显示顺序，并自定义各章节的中英文显示文案。
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
                      setSiteContent({
                        ...siteContent,
                        navItems: [
                          { id: "cabinet", labelEn: "Cabinet", labelZh: "标本陈列", visible: true },
                          { id: "curator", labelEn: "Curator", labelZh: "馆长手记", visible: true },
                          { id: "index", labelEn: "Index", labelZh: "馆藏目录", visible: true },
                        ],
                      })
                    }}
                  >
                    重置为推荐顺序 (Cabinet → Curator → Index)
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
                  Logo 图标/图片 URL
                  <input
                    value={siteContent.logoImageUrl || ""}
                    onChange={(e) =>
                      setSiteContent({ ...siteContent, logoImageUrl: e.target.value })
                    }
                    placeholder="https://... 或 /favicon.ico"
                  />
                  <small>支持 SVG 或 PNG 矢量/透明图标，建议高度约 20-30px</small>
                </label>

                <div className="logo-preview-box">
                  <span>HEADER LOGO PREVIEW / 标头实时预览</span>
                  <div className="logo-preview-display">
                    <a className="wordmark" href="#cabinet" onClick={(e) => e.preventDefault()}>
                      {siteContent.logoType !== "text" && siteContent.logoImageUrl ? (
                        <img
                          src={siteContent.logoImageUrl}
                          alt="Logo"
                          className="wordmark-logo-img"
                        />
                      ) : null}
                      {siteContent.logoType !== "image" ? (
                        <>
                          {siteContent.logoText || "NESTSPACE"}
                          {siteContent.logoSubtext ? (
                            <span> — {siteContent.logoSubtext}</span>
                          ) : null}
                        </>
                      ) : null}
                    </a>
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
                        <div className="row-actions">
                          <button
                            type="button"
                            onClick={() => setEditing(item)}
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
                      cursor: syncing ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      fontFamily: "inherit",
                      fontWeight: "500",
                    }}
                    disabled={syncing}
                    onClick={runGithubSync}
                  >
                    {syncing ? "正在采集…" : "⚡ 同步已有标本指标"}
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
                    <span>点击上方“⚡ 同步已有标本指标”刷新馆藏各标本的远程数据。</span>
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
            event.target === event.currentTarget && setEditing(null)
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
                onClick={() => setEditing(null)}
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
              <label>
                挑战 / 背景
                <textarea
                  value={editing.challenge}
                  onChange={(event) =>
                    setEditing({ ...editing, challenge: event.target.value })
                  }
                />
              </label>
              <label>
                解决方案
                <textarea
                  value={editing.solution}
                  onChange={(event) =>
                    setEditing({ ...editing, solution: event.target.value })
                  }
                />
              </label>
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
                  value={metricsText}
                  onChange={(event) => setMetricsText(event.target.value)}
                />
                <small>每行一条，格式「标签 | 数值」；STARS / FORKS / OPEN ISSUES 会被同步覆盖</small>
              </label>
              <label>
                时间线
                <textarea
                  value={timelineText}
                  onChange={(event) => setTimelineText(event.target.value)}
                />
                <small>
                  每行一条，格式「日期 | 标题 | 说明」；勾选 GitHub 同步时会被按仓库事实
                  （建档 / Release / 最近推送）重新生成，手工补充的内容会被覆盖
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
              <label>
                中文简介
                <textarea
                  required
                  value={editing.description.zh}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      description: {
                        ...editing.description,
                        zh: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                英文简介
                <textarea
                  required
                  value={editing.description.en}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      description: {
                        ...editing.description,
                        en: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <footer>
              <button type="button" onClick={() => setEditing(null)}>
                取消
              </button>
              <button type="submit" className="admin-primary">
                保存项目
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
  const [items, setItems] = useState<Project[]>(projects)
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS)
  // 站点设置是否已从接口返回（无论成功失败），用于决定何时套用展示偏好
  const [settingsResolved, setSettingsResolved] = useState(false)
  // 展示偏好只套用一次，之后不覆盖访客手动切换的语言与主题
  const preferenceApplied = useRef(false)

  // 挂载时从 Cloudflare 边缘 API 异步同步最新的公开项目数据与站点文案
  useEffect(() => {
    let isMounted = true
    fetchPublicProjects()
      .then((data) => {
        if (isMounted && data && data.length > 0) {
          setItems(data)
        }
      })
      .catch((err) => {
        console.warn("Public API fetch note (fallback in use):", err)
      })
    fetchSiteSettings()
      .then((settings) => {
        if (isMounted) setSiteSettings(settings)
      })
      .catch(() => {
        // 接口异常时保持内置默认文案
      })
      .finally(() => {
        if (isMounted) setSettingsResolved(true)
      })
    return () => {
      isMounted = false
    }
  }, [])

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

  useEffect(() => {
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
  }, [route])

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
        items={items}
        onChange={setItems}
        onExit={() => {
          if (isAdminHost()) {
            window.location.href = "https://nestspace.online"
          } else {
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

  return (
    <main>
      <Header
        language={language}
        setLanguage={setLanguage}
        dark={dark}
        setDark={setDark}
        settings={effectiveSettings}
      />
      <SpiralGallery language={language} items={items} settings={effectiveSettings} onOpen={openProject} />
      {siteSettings.homeStatsVisible !== false && (
        <CatalogueStats language={language} items={items} settings={effectiveSettings} />
      )}
      <Curator language={language} settings={effectiveSettings} />
      <SpecimenIndex items={items} onOpen={openProject} />
      <SiteFooter
        items={items}
        settings={effectiveSettings}
        language={language}
        onOpen={openProject}
      />
    </main>
  )
}
