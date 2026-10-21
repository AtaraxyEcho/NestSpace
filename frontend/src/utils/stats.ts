import type { Project } from "../types/project"
import type { SiteSettings, ActivityLogItem } from "../types/siteSettings"

/**
 * 将项目 stars 字段（如 "2.8k", "920", "1.5k"）解析为数值
 */
export function parseStarCount(stars: string | number | undefined | null): number {
  if (!stars) return 0
  if (typeof stars === "number") return stars
  const cleaned = String(stars).trim().toLowerCase()
  if (cleaned.endsWith("k")) {
    const num = parseFloat(cleaned.slice(0, -1))
    return isNaN(num) ? 0 : Math.round(num * 1000)
  }
  const parsed = parseInt(cleaned.replace(/[^0-9]/g, ""), 10)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * 将数值格式化为可读的 citations 字符串（如 8400 -> "8.4k", 920 -> "920"）
 */
export function formatStarCount(count: number): string {
  if (count <= 0) return "0"
  if (count >= 1000) {
    const k = count / 1000
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`
  }
  return String(count)
}

/**
 * 计算动态馆藏统计数据 (Catalogue Stats)
 */
export function computeCatalogueStats(items: Project[], settings?: Partial<SiteSettings>) {
  const totalCount = items.length
  const totalStars = items.reduce((acc, p) => acc + parseStarCount(p.stars), 0)
  const citations = settings?.customCitations?.trim()
    ? settings.customCitations.trim()
    : formatStarCount(totalStars)

  const distinctLanguages = new Set(
    items.map((item) => item.language).filter(Boolean),
  ).size

  const distinctHabitats = new Set(
    items.map((item) => item.habitat).filter(Boolean),
  ).size

  // 计算最早年份 SINCE
  let sinceYear = settings?.statsSinceYear?.trim()
  if (!sinceYear) {
    const validYears = items
      .map((item) => {
        const y = parseInt(item.year || item.date?.slice(0, 4) || "", 10)
        return isNaN(y) ? null : y
      })
      .filter((y): y is number => y !== null && y > 2000 && y < 2100)
    sinceYear = validYears.length > 0 ? String(Math.min(...validYears)) : "2021"
  }

  // 计算最新更新月份 AS OF
  let asOfDate = settings?.statsAsOfDate?.trim()
  if (!asOfDate) {
    const dates = items
      .map((item) => {
        const d = (item.updated || item.date || "").replace(/-/g, ".")
        return d.slice(0, 7) // e.g. "2024.10"
      })
      .filter((d) => /^\d{4}\.\d{2}$/.test(d))
    if (dates.length > 0) {
      dates.sort()
      asOfDate = dates[dates.length - 1]
    } else {
      const now = new Date()
      asOfDate = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`
    }
  }

  return {
    specimensCount: String(totalCount).padStart(2, "0"),
    citations,
    distinctLanguages: String(distinctLanguages).padStart(2, "0"),
    distinctHabitats,
    sinceYear,
    asOfDate,
    totalStars,
  }
}

/**
 * 计算活跃度图表 (Activity Log Timeline)
 * 支持 "auto"（自动按项目创立与历程事件聚合并按比例计算高度）或 "custom"
 */
export function computeActivityTimeline(
  items: Project[],
  settings?: Partial<SiteSettings>,
): ActivityLogItem[] {
  if (
    settings?.activityLogMode === "custom" &&
    settings.customActivityLog &&
    settings.customActivityLog.length > 0
  ) {
    const maxVal = Math.max(...settings.customActivityLog.map((i) => i.count || 1), 1)
    return settings.customActivityLog.map((item) => ({
      year: item.year,
      count: item.count,
      // 高度只由 count 派生，**不读库里存的 item.height**：那是自动档烤进来的旧值，
      // 认了它就会出现"改权重、条形不动、保存还报成功"的假状态
      height: Math.max(25, Math.min(100, Math.round((item.count / maxVal) * 100))),
      note: item.note,
    }))
  }

  // 自动根据项目数据聚合
  const currentYear = new Date().getFullYear()
  const yearCounts: Record<number, number> = {}

  items.forEach((p) => {
    const pYear = parseInt(p.year || p.date?.slice(0, 4) || "", 10)
    if (!isNaN(pYear) && pYear >= 2018 && pYear <= currentYear + 1) {
      yearCounts[pYear] = (yearCounts[pYear] || 0) + 2
    }
    // 累加时间线里程碑
    if (Array.isArray(p.timeline)) {
      p.timeline.forEach((event) => {
        const tYear = parseInt(event.date?.slice(0, 4) || "", 10)
        if (!isNaN(tYear) && tYear >= 2018 && tYear <= currentYear + 1) {
          yearCounts[tYear] = (yearCounts[tYear] || 0) + 1
        }
      })
    }
  })

  const years = Object.keys(yearCounts).map(Number)
  if (years.length === 0) {
    // 默认近4年骨架
    return [
      { year: currentYear - 3, count: 1, height: 38 },
      { year: currentYear - 2, count: 2, height: 62 },
      { year: currentYear - 1, count: 3, height: 79 },
      { year: currentYear, count: 4, height: 100 },
    ]
  }

  const minYear = Math.min(...years)
  const maxYear = Math.max(...years, currentYear)
  const rangeYears: number[] = []
  for (let y = minYear; y <= maxYear; y++) {
    rangeYears.push(y)
  }

  // 保证至少展示 3-5 年
  while (rangeYears.length < 4) {
    rangeYears.unshift(rangeYears[0] - 1)
  }

  const counts = rangeYears.map((y) => yearCounts[y] || 1)
  const maxCount = Math.max(...counts, 1)

  return rangeYears.map((year) => {
    const count = yearCounts[year] || 1
    // 高度范围在 30% 到 100% 之间，视觉更饱满和谐
    const ratio = count / maxCount
    const height = Math.round(28 + ratio * 72)
    return {
      year,
      count,
      height,
    }
  })
}
