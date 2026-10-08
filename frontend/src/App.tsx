import { useEffect, useRef, useState } from "react"
import type { Language, Project, ProjectShape, ProjectStatus } from "./types/project"
import { fallbackProjects as projects } from "./data/fallbackProjects"
import { DEFAULT_SITE_SETTINGS, DEFAULT_NAV_ITEMS } from "./data/defaultSiteSettings"
import { fetchPublicProjects, fetchSiteSettings } from "./api/client"
import {
  verifyAndFetchAdminProjects,
  saveAdminProject,
  deleteAdminProject,
  getAdminToken,
  fetchAdminSiteSettings,
  saveAdminSiteSettings,
  syncGithubRepos,
} from "./api/adminClient"
import type { SiteSettings, NavItemConfig } from "./types/siteSettings"
import { computeCatalogueStats, computeActivityTimeline } from "./utils/stats"


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
            <a
              href={`https://${project.repository}`}
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

// 站内章节锚点：Cabinet → Catalogue → Curator → Index
const SECTION_ANCHORS = ["cabinet", "catalogue", "curator", "index", "colophon"]

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
  const navList = (
    settings.navItems && settings.navItems.length > 0
      ? settings.navItems
      : DEFAULT_NAV_ITEMS
  ).filter((item) => item.visible !== false)

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
        <button
          type="button"
          onClick={() => setLanguage(language === "en" ? "zh" : "en")}
          aria-label="Switch language"
        >
          {language === "en" ? "中" : "EN"}
        </button>
        <button
          type="button"
          onClick={() => setDark(!dark)}
          aria-label="Switch theme"
        >
          {dark ? "LIGHT" : "DARK"}
        </button>
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
    const onScroll = () => {
      if (!sectionRef.current) return
      const rect = sectionRef.current.getBoundingClientRect()
      const range = sectionRef.current.offsetHeight - window.innerHeight
      targetRef.current = Math.max(0, Math.min(1, -rect.top / range))
    }
    const animate = () => {
      progressRef.current += (targetRef.current - progressRef.current) * 0.16
      const p = progressRef.current
      const step = Math.PI / 2
      const totalAngle = (items.length - 1) * step
      const radius = Math.min(
        620,
        window.innerWidth * (window.innerWidth < 900 ? 0.44 : 0.43),
      )
      const height =
        window.innerHeight < 700 ? 430 : window.innerWidth < 900 ? 500 : 620

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
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    frame = requestAnimationFrame(animate)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      cancelAnimationFrame(frame)
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
        style={{
          gridTemplateColumns: `2fr repeat(${timelineData.length}, 1fr)`,
        }}
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

function SiteFooter({
  items,
  settings,
  onOpen,
}: {
  items: Project[]
  settings: SiteSettings
  onOpen: (project: Project) => void
}) {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <span className="eyebrow">AN OPEN CABINET</span>
          <strong>{settings.logoText || "NestSpace"}</strong>
          <em>{settings.logoSubtext || "巢空间"}</em>
          <p>
            The open-source collection of {settings.logoSubtext || "AtaraxyEcho"}.
            <br />
            {settings.logoSubtext || "AtaraxyEcho"} 的开源项目标本馆。
          </p>
        </div>
        <div>
          <b>SPECIMENS</b>
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
          <b>COLLECTION</b>
          <a
            href="#cabinet"
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: "smooth" })
              if (window.location.hash) {
                window.history.replaceState(null, "", window.location.pathname)
              }
            }}
          >
            Cabinet
          </a>
          <a
            href="#catalogue"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById("catalogue")?.scrollIntoView({ behavior: "smooth" })
              if (window.location.hash) {
                window.history.replaceState(null, "", window.location.pathname)
              }
            }}
          >
            Catalogue
          </a>
          <a
            href="#curator"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById("curator")?.scrollIntoView({ behavior: "smooth" })
              if (window.location.hash) {
                window.history.replaceState(null, "", window.location.pathname)
              }
            }}
          >
            Curator
          </a>
          <a
            href="#index"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById("index")?.scrollIntoView({ behavior: "smooth" })
              if (window.location.hash) {
                window.history.replaceState(null, "", window.location.pathname)
              }
            }}
          >
            Index
          </a>
          <a
            href="#colophon"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById("colophon")?.scrollIntoView({ behavior: "smooth" })
              if (window.location.hash) {
                window.history.replaceState(null, "", window.location.pathname)
              }
            }}
          >
            Colophon
          </a>
        </div>
        <div>
          <b>FIELD NOTES</b>
          <a
            href={settings.githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
          <a href={`mailto:${settings.contactEmail}`}>Contact ↗</a>
        </div>
      </div>
      <div className="footer-bottom" id="colophon">
        <span>Collected with care, since {computeCatalogueStats(items, settings).sinceYear}</span>
        {settings.icpEnabled && settings.icpNumber ? (
          <a
            href={settings.icpUrl || "https://beian.miit.gov.cn/"}
            target="_blank"
            rel="noreferrer"
            style={{ font: '8px "IBM Plex Mono", monospace', letterSpacing: ".18em", color: "#b8ab98" }}
          >
            {settings.icpNumber}
          </a>
        ) : null}
        <small>© {new Date().getFullYear()} NESTSPACE · OPEN SOURCE UNDER MIT</small>
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
  const [detailTab, setDetailTab] =
    useState<"overview" | "readme" | "deployment">("overview")

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
          <button type="button" onClick={onLanguage}>
            {language === "en" ? "中" : "EN"}
          </button>
          <button type="button" onClick={onTheme}>
            {dark ? "LIGHT" : "DARK"}
          </button>
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
            <p className="detail-intro">{project.description[language]}</p>
            <div className="detail-actions">
              <a
                className="button primary"
                href={`https://${project.repository}`}
                target="_blank"
                rel="noreferrer"
              >
                VIEW SOURCE <span>↗</span>
              </a>
              <a className="button secondary" href="#field-notes">
                READ FIELD NOTES <span>↓</span>
              </a>
            </div>
          </div>
          <div className="detail-plate">
            <CropMarks />
            <span className="plate-code">NS / {project.id}</span>
            <SpecimenSvg shape={project.shape} />
            <p className="hand-note">Observed in {project.habitat}</p>
            <span className="plate-status">
              <b /> {project.status} · {project.version}
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
        <nav className="detail-tabs" aria-label="Project documentation">
          {(["overview", "readme", "deployment"] as const).map((tab) => (
            <button
              type="button"
              key={tab}
              className={detailTab === tab ? "active" : ""}
              onClick={() => setDetailTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
      </section>

      <div className={detailTab === "overview" ? "" : "document-hidden"}>
        <section className="detail-section" id="field-notes">
          <div className="detail-section-label">
            <span className="eyebrow">FIELD NOTES / 01</span>
            <span>CONTEXT & RESPONSE</span>
          </div>
          <div className="detail-narrative">
            <article>
              <span>THE CONDITION</span>
              <h2>Why it needed to exist.</h2>
              <p>{project.challenge}</p>
            </article>
            <article>
              <span>THE RESPONSE</span>
              <h2>A narrow tool, carefully shaped.</h2>
              <p>{project.solution}</p>
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
          <div className="capability-grid">
            {project.features.map((feature, index) => (
              <article key={feature}>
                <span>0{index + 1}</span>
                <h3>{feature}</h3>
                <p>
                  Designed as a stable part of the system rather than an
                  optional afterthought.
                </p>
              </article>
            ))}
          </div>
          <div className="metric-strip">
            {project.metrics.map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="detail-section evolution-section">
          <div className="detail-section-label">
            <span className="eyebrow">EVOLUTION / 03</span>
            <span>A LIVING SPECIMEN</span>
          </div>
          <div className="evolution-list">
            {project.timeline.map((event, index) => (
              <article key={event.date}>
                <span className="event-index">0{index + 1}</span>
                <time>{event.date}</time>
                <h3>{event.title}</h3>
                <p>{event.note}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      {detailTab === "readme" && (
        <section className="detail-section document-section">
          <aside>
            <span className="eyebrow">ON THIS PAGE</span>
            <a href="#introduction">Introduction</a>
            <a href="#installation">Installation</a>
            <a href="#features">Features</a>
            <a href="#license">License</a>
          </aside>
          <article className="markdown-body">
            <span className="eyebrow">README.MD / LATEST</span>
            <h2 id="introduction">{project.name}</h2>
            <blockquote>{project.description.en}</blockquote>
            <p>{project.solution}</p>
            <h3 id="installation">Installation</h3>
            <div className="code-block">
              <span>TERMINAL</span>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard?.writeText(
                    `npm install @nestspace/${project.name.toLowerCase()}`,
                  )
                }
              >
                COPY
              </button>
              <code>npm install @nestspace/{project.name.toLowerCase()}</code>
            </div>
            <h3 id="features">What it includes</h3>
            <ul>
              {project.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <h3 id="license">License</h3>
            <p>MIT licensed. Made to be studied, adapted, and shared.</p>
          </article>
        </section>
      )}

      {detailTab === "deployment" && (
        <section className="detail-section document-section">
          <aside>
            <span className="eyebrow">DEPLOYMENT</span>
            <a href="#requirements">Requirements</a>
            <a href="#cloudflare">Cloudflare Pages</a>
            <a href="#environment">Environment</a>
          </aside>
          <article className="markdown-body">
            <span className="eyebrow">DEPLOYMENT.MD / VERIFIED</span>
            <h2 id="requirements">Field deployment</h2>
            <p>
              This specimen ships as a static, reproducible build. Use Node 22
              or later and keep the lockfile committed.
            </p>
            <h3 id="cloudflare">Cloudflare Pages</h3>
            <div className="deployment-table">
              <div>
                <span>BUILD COMMAND</span>
                <strong>pnpm build</strong>
              </div>
              <div>
                <span>OUTPUT DIRECTORY</span>
                <strong>dist</strong>
              </div>
              <div>
                <span>RUNTIME</span>
                <strong>Node.js 22</strong>
              </div>
            </div>
            <h3 id="environment">Environment variables</h3>
            <div className="code-block">
              <span>.ENV.PRODUCTION</span>
              <code>PUBLIC_REPOSITORY={project.repository}</code>
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
      <SiteFooter items={items} settings={settings} onOpen={onOpen} />
    </main>
  )
}

type AdminView = "overview" | "navigation" | "stats" | "content" | "projects" | "sync" | "settings"

type GithubSyncResult = {
  id: string
  name: string
  status: string
  note?: string
  stars?: string
  version?: string
  updated?: string
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
  const [notice, setNotice] = useState("")
  const [contentLanguage, setContentLanguage] = useState<Language>("zh")
  // 站点文案与合规设置：初始为内置默认值，挂载后从 D1 拉取覆盖
  const [siteContent, setSiteContent] = useState<SiteSettings>({
    ...DEFAULT_SITE_SETTINGS,
  })
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<GithubSyncResult[] | null>(null)
  const viewNames: Record<AdminView, string> = {
    overview: "馆藏总览",
    navigation: "导航与标头",
    stats: "馆藏统计",
    content: "内容管理",
    projects: "项目管理",
    sync: "GitHub 同步",
    settings: "站点设置",
  }
  // 从 D1 拉取站点文案设置（拉取失败时保持内置默认值，仍可编辑保存）
  useEffect(() => {
    fetchAdminSiteSettings().then((res) => {
      if (res.success && res.data) {
        setSiteContent(res.data)
      }
    })
  }, [])

  const saveSettings = async () => {
    setNotice("正在保存站点设置到 Cloudflare D1...")
    const res = await saveAdminSiteSettings(siteContent)
    setNotice(
      res.success
        ? "站点设置已保存，刷新公开站点即可生效。"
        : `保存失败: ${res.error || "请检查网络或口令权限"}`,
    )
  }

  const runGithubSync = async () => {
    setSyncing(true)
    setNotice("正在从 GitHub 采集仓库数据…")
    const res = await syncGithubRepos()
    setSyncing(false)
    if (!res.success || !res.results) {
      setNotice(`同步失败: ${res.error || "未知错误"}`)
      return
    }
    const results = res.results as GithubSyncResult[]
    setSyncResults(results)
    const synced = results.filter((r) => r.status === "synced").length
    setNotice(`同步完成：${synced}/${results.length} 个仓库已更新。`)
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

  const saveProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    const isNew = !items.some((item) => item.id === editing.id)
    setNotice("正在持久化到 Cloudflare D1 边缘数据库...")
    const res = await saveAdminProject(editing, isNew)
    if (res.success) {
      onChange(
        items.some((item) => item.id === editing.id)
          ? items.map((item) => (item.id === editing.id ? editing : item))
          : [editing, ...items],
      )
      setEditing(null)
      setNotice("项目资料已成功保存并同步到 Cloudflare D1 数据库。")
    } else {
      setNotice(`保存失败: ${res.error || "请检查网络或口令权限"}`)
    }
  }

  const createProject = () => {
    const id = String(
      Math.max(0, ...items.map((item) => Number(item.id))) + 1,
    ).padStart(3, "0")
    setEditing({
      ...projects[0],
      id,
      name: "Untitled specimen",
      cn: "未命名标本",
      latin: "Specimen Novum",
      status: "BETA",
      stars: "0",
      date: new Date().toISOString().slice(0, 7).replace("-", "."),
      updated: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
      repository: "github.com/AtaraxyEcho/new-project",
    })
  }

  const toggleStatus = async (id: string) => {
    const target = items.find((item) => item.id === id)
    if (!target) return
    const nextStatus: ProjectStatus = target.status === "LIVE" ? "BETA" : "LIVE"
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
                          {item.updated} · {item.version}
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
                      <td>{item.version}</td>
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
                <span className="eyebrow">REMOTE COLLECTION / 04</span>
                <h1>GitHub 同步</h1>
                <p>从 GitHub 拉取各项目的最新 stars、推送时间与 Release 版本。</p>
              </div>
              <button
                type="button"
                className="admin-primary"
                disabled={syncing}
                onClick={runGithubSync}
              >
                {syncing ? "正在采集…" : "立即同步"}
              </button>
            </div>
            <div className="sync-layout">
              <section className="settings-card">
                <span className="eyebrow">HOW IT WORKS</span>
                <h2>同步说明</h2>
                <label>
                  同步内容
                  <small>
                    按各项目"仓库地址"字段（github.com/&lt;owner&gt;/&lt;repo&gt;）调用
                    GitHub 公开 API，更新 stars 数、最近推送时间与最新 Release
                    版本号，并立即写回 D1 数据库。
                  </small>
                </label>
                <label>
                  无需 Token
                  <small>
                    公开仓库的读取不需要任何凭证；GitHub 匿名限额为每 IP
                    60 次/小时，本站规模的手动同步完全够用。仓库地址在"项目管理"中维护。
                  </small>
                </label>
              </section>
              <section className="settings-card sync-log">
                <span className="eyebrow">SYNC LOG</span>
                <h2>最近同步结果</h2>
                {syncResults === null && (
                  <div className="empty-state">
                    <strong>尚未执行同步</strong>
                    <span>点击"立即同步"从 GitHub 拉取最新仓库数据。</span>
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
                          ? `★ ${result.stars} · ${result.version || "无 Release"} · ${result.updated}`
                          : result.note || result.status}
                      </small>
                    </p>
                    <time>
                      {result.status === "synced" ? "已更新" : result.status === "skipped" ? "已跳过" : "失败"}
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
                  <select defaultValue="auto">
                    <option value="auto">跟随浏览器</option>
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label>
                  默认主题
                  <select defaultValue="auto">
                    <option value="auto">跟随系统</option>
                    <option value="light">白日标本室</option>
                    <option value="dark">夜间标本室</option>
                  </select>
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>公开项目统计</strong>
                    <small>在首页显示馆藏数据</small>
                  </span>
                  <input type="checkbox" defaultChecked />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>深色模式</strong>
                    <small>允许访客切换主题</small>
                  </span>
                  <input type="checkbox" defaultChecked />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>中英双语</strong>
                    <small>显示语言切换入口</small>
                  </span>
                  <input type="checkbox" defaultChecked />
                </label>
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
                <label>
                  社交分享图
                  <input defaultValue="/images/nestspace-og.jpg" />
                </label>
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
                <h2>域名与部署</h2>
                <label>
                  主域名
                  <input defaultValue="nestspace.dev" />
                </label>
                <div className="domain-status">
                  <span>
                    <b /> DNS 已连接
                  </span>
                  <small>Cloudflare Pages · 自动部署开启</small>
                </div>
                <button
                  type="button"
                  className="admin-primary"
                  onClick={() => setNotice("站点设置已保存。")}
                >
                  保存全部设置
                </button>
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
          <form className="editor-drawer" onSubmit={saveProject}>
            <header>
              <div>
                <span className="eyebrow">SPECIMEN EDITOR</span>
                <h2>
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
                    <option value="LIVE">LIVE</option>
                    <option value="BETA">BETA</option>
                  </select>
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

export default function App() {
  const [language, setLanguage] = useState<Language>("en")
  const [dark, setDark] = useState(false)
  const [route, setRoute] = useState(routeFromHash(window.location.hash))
  const [items, setItems] = useState<Project[]>(projects)
  const [loading, setLoading] = useState(false)
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS)

  // 挂载时从 Cloudflare 边缘 API 异步同步最新的公开项目数据与站点文案
  useEffect(() => {
    let isMounted = true
    setLoading(true)
    fetchPublicProjects()
      .then((data) => {
        if (isMounted && data && data.length > 0) {
          setItems(data)
        }
      })
      .catch((err) => {
        console.warn("Public API fetch note (fallback in use):", err)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })
    fetchSiteSettings()
      .then((settings) => {
        if (isMounted) setSiteSettings(settings)
      })
      .catch(() => {
        // 接口异常时保持内置默认文案
      })
    return () => {
      isMounted = false
    }
  }, [])

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
  const activeProject = route.startsWith("project/")
    ? items.find((item) => item.id === route.split("/")[1])
    : undefined

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

  if (activeProject) {
    return (
      <DetailPage
        project={activeProject}
        items={items}
        language={language}
        dark={dark}
        settings={siteSettings}
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
        settings={siteSettings}
      />
      <SpiralGallery language={language} items={items} settings={siteSettings} onOpen={openProject} />
      <CatalogueStats language={language} items={items} settings={siteSettings} />
      <Curator language={language} settings={siteSettings} />
      <SpecimenIndex items={items} onOpen={openProject} />
      <SiteFooter
        items={items}
        settings={siteSettings}
        onOpen={openProject}
      />
    </main>
  )
}
