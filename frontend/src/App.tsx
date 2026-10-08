import { useEffect, useRef, useState } from "react"
import type { Language, Project, ProjectShape, ProjectStatus } from "./types/project"
import { fallbackProjects as projects } from "./data/fallbackProjects"
import { DEFAULT_SITE_SETTINGS } from "./data/defaultSiteSettings"
import { fetchPublicProjects, fetchSiteSettings } from "./api/client"
import {
  verifyAndFetchAdminProjects,
  saveAdminProject,
  deleteAdminProject,
  getAdminToken,
  fetchAdminSiteSettings,
  saveAdminSiteSettings,
} from "./api/adminClient"
import type { SiteSettings } from "./types/siteSettings"


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

function Header({
  language,
  setLanguage,
  dark,
  setDark,
  onAdmin,
}: {
  language: Language
  setLanguage: (value: Language) => void
  dark: boolean
  setDark: (value: boolean) => void
  onAdmin: () => void
}) {
  return (
    <header className="site-header">
      <a className="wordmark" href="#cabinet">
        NESTSPACE <span>— ATARAXYECHO</span>
      </a>
      <nav aria-label="Primary navigation">
        <a className="active" href="#cabinet">
          Cabinet
        </a>
        <a href="#index">Index</a>
        <a href="#curator">Curator</a>
        <button type="button" className="nav-button" onClick={onAdmin}>
          Admin
        </button>
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

      cardsRef.current.forEach((card, index) => {
        if (!card) return
        const relAngle = index * step - p * totalAngle
        const x = Math.sin(relAngle) * radius
        const y = (-relAngle / step) * height
        const z = -Math.cos(relAngle) * radius
        const facing = Math.cos(relAngle)
        const visibleFacing = Math.max(0, facing)
        const opacity = facing <= 0 ? 0 : Math.pow(visibleFacing, 0.7)
        const blur = facing <= 0 ? 12 : (1 - facing) * 5
        const scale = facing <= 0 ? 0.68 : 0.82 + facing * 0.18
        card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateY(0deg) scale(${scale.toFixed(4)})`
        card.style.opacity = opacity.toFixed(3)
        card.style.filter = `blur(${blur.toFixed(2)}px)`
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
}: {
  language: Language
  items: Project[]
}) {
  const stats = [
    ["SPECIMENS", String(items.length).padStart(2, "0"), "Open-source works"],
    ["CITATIONS", "8.4k", `Across ${items.length} habitats`],
    [
      "RANGE",
      String(new Set(items.map((item) => item.language)).size).padStart(2, "0"),
      "Languages observed",
    ],
    ["SINCE", "2021", "Collected with care"],
  ]
  return (
    <section className="section stats-section reveal-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CABINET RECORD / 02</span>
          <h2>
            Catalogue{" "}
            <em>/ {language === "zh" ? "馆藏统计" : "Collection record"}</em>
          </h2>
        </div>
        <span className="as-of">AS OF 2024.10</span>
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
      <div className="timeline">
        <div className="timeline-copy">
          <span className="eyebrow">ACTIVITY LOG</span>
          <p>Each year marks another layer in the cabinet.</p>
        </div>
        {[38, 62, 79, 100].map((height, index) => (
          <div className="timeline-year" key={height}>
            <i
              style={
                {
                  "--bar-height": `${height}%`,
                  "--delay": `${index * 100}ms`,
                } as React.CSSProperties
              }
            />
            <span>{2021 + index}</span>
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
  onAdmin,
}: {
  items: Project[]
  settings: SiteSettings
  onOpen: (project: Project) => void
  onAdmin: () => void
}) {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <span className="eyebrow">AN OPEN CABINET</span>
          <strong>NestSpace</strong>
          <em>巢空间</em>
          <p>
            The open-source collection of AtaraxyEcho.
            <br />
            AtaraxyEcho 的开源项目标本馆。
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
          <a href="#cabinet">Cabinet</a>
          <a href="#index">Index</a>
          <a href="#curator">Curator</a>
          <a href="#colophon">Colophon</a>
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
          <button type="button" onClick={onAdmin}>
            Admin console →
          </button>
        </div>
      </div>
      <div className="footer-bottom" id="colophon">
        <span>Collected with care, since 2021</span>
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
  onAdmin,
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
  onAdmin: () => void
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
          NESTSPACE <span>— ATARAXYECHO</span>
        </button>
        <span className="detail-location">CABINET / SPEC—{project.id}</span>
        <div className="header-tools">
          <button type="button" onClick={onLanguage}>
            {language === "en" ? "中" : "EN"}
          </button>
          <button type="button" onClick={onTheme}>
            {dark ? "LIGHT" : "DARK"}
          </button>
          <button type="button" onClick={onAdmin}>
            ADMIN
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
      <SiteFooter items={items} settings={settings} onOpen={onOpen} onAdmin={onAdmin} />
    </main>
  )
}

type AdminView = "overview" | "content" | "projects" | "sync" | "settings"

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
  const [syncFrequency, setSyncFrequency] = useState("daily")
  const viewNames: Record<AdminView, string> = {
    overview: "馆藏总览",
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
            className={view === "content" ? "active" : ""}
            onClick={() => setView("content")}
          >
            <span>02</span> 内容管理
          </button>
          <button
            type="button"
            className={view === "projects" ? "active" : ""}
            onClick={() => setView("projects")}
          >
            <span>03</span> 项目管理
          </button>
          <button
            type="button"
            className={view === "sync" ? "active" : ""}
            onClick={() => setView("sync")}
          >
            <span>04</span> GitHub 同步
          </button>
          <button
            type="button"
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <span>05</span> 站点设置
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
                <span>总引用</span>
                <strong>8.4k</strong>
                <small>持续增长</small>
              </article>
              <article>
                <span>系统状态</span>
                <strong className="status-word">HEALTHY</strong>
                <small>最后检查：刚刚</small>
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
                <p>从仓库读取 README、部署文档、版本与引用数据。</p>
              </div>
              <button
                type="button"
                className="admin-primary"
                disabled={syncing}
                onClick={() => {
                  setSyncing(true)
                  window.setTimeout(() => {
                    setSyncing(false)
                    setNotice("同步完成：4 个仓库均为最新状态。")
                  }, 900)
                }}
              >
                {syncing ? "正在采集…" : "立即同步"}
              </button>
            </div>
            <div className="sync-layout">
              <section className="settings-card">
                <span className="eyebrow">CONNECTION</span>
                <h2>连接设置</h2>
                <label>
                  GitHub Personal Access Token
                  <input type="password" defaultValue="ghp_nestspace_demo" />
                  <small>仅保存在加密环境变量中，页面不会读取明文。</small>
                </label>
                <label>
                  自动同步频率
                  <select
                    value={syncFrequency}
                    onChange={(event) => setSyncFrequency(event.target.value)}
                  >
                    <option value="hourly">每小时</option>
                    <option value="daily">每天</option>
                    <option value="weekly">每周</option>
                    <option value="manual">仅手动</option>
                  </select>
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>同步 README</strong>
                    <small>自动更新项目详情正文</small>
                  </span>
                  <input type="checkbox" defaultChecked />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>同步部署文档</strong>
                    <small>读取 DEPLOYMENT.md 与发布记录</small>
                  </span>
                  <input type="checkbox" defaultChecked />
                </label>
              </section>
              <section className="settings-card sync-log">
                <span className="eyebrow">SYNC LOG</span>
                <h2>最近采集记录</h2>
                {items.map((item, index) => (
                  <div key={item.id}>
                    <span className="activity-mark">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p>
                      <strong>{item.name}</strong>
                      <small>
                        README · {item.version} · {index + 2} 项更新
                      </small>
                    </p>
                    <time>{index === 0 ? "刚刚" : `${index + 1} 小时前`}</time>
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
  const [route, setRoute] = useState(window.location.hash.slice(1) || "home")
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
    const onHashChange = () => {
      setRoute(window.location.hash.slice(1) || "home")
      window.scrollTo({ top: 0 })
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])


  useEffect(() => {
    if (route !== "home") return
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach(
          (entry) =>
            entry.isIntersecting && entry.target.classList.add("is-visible"),
        ),
      { threshold: 0.16 },
    )
    document
      .querySelectorAll(".section, .site-footer")
      .forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [route])

  const navigate = (next: string) => {
    window.location.hash = next
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
        onExit={() => navigate("home")}
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
        onAdmin={() => navigate("admin")}
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
        onAdmin={() => navigate("admin")}
      />
      <SpiralGallery language={language} items={items} settings={siteSettings} onOpen={openProject} />
      <CatalogueStats language={language} items={items} />
      <Curator language={language} settings={siteSettings} />
      <SpecimenIndex items={items} onOpen={openProject} />
      <SiteFooter
        items={items}
        settings={siteSettings}
        onOpen={openProject}
        onAdmin={() => navigate("admin")}
      />
    </main>
  )
}
