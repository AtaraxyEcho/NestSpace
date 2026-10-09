export type FramePosition = "active" | "next" | "previous" | "back"

export interface PreviewFrame {
  index: number
  position: FramePosition
}

/**
 * 观察台上实际渲染哪几张牌、各站在哪个位置。
 * 环形取邻居在总数 ≤2 时会让 next 与 previous 落回同一张，所以要去重；
 * 总数 >3 才多取一张「往后还有」的后牌（牌面标 +N，N = 未显示的张数）。
 */
export function previewFrames(total: number, active: number): PreviewFrame[] {
  if (total <= 0) return []
  const safe = Math.min(Math.max(active, 0), total - 1)
  const seen = new Set<number>()
  const frames: PreviewFrame[] = []
  const add = (index: number, position: FramePosition) => {
    if (seen.has(index)) return
    seen.add(index)
    frames.push({ index, position })
  }
  add(safe, "active")
  add((safe + 1) % total, "next")
  add((safe - 1 + total) % total, "previous")
  if (total > 3) add((safe + 2) % total, "back")
  return frames
}

export function hiddenFrameCount(total: number, active: number): number {
  return Math.max(0, total - previewFrames(total, active).length)
}

function decodeUrlPart(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    // URL 里的 % 不一定是转义开头（例如 my100%shot），解码失败就原样显示
    return value
  }
}

/** 牌面标题与目录取自图片 URL 自身；解不出来才退回项目名，不编说明文字。 */
export function frameLabel(url: string, fallback: string): { title: string; path: string } {
  let pathname = ""
  try {
    pathname = new URL(url).pathname
  } catch {
    pathname = ""
  }
  const segments = pathname.split("/").filter(Boolean)
  const file = segments[segments.length - 1] ?? ""
  return {
    title: decodeUrlPart(file.replace(/\.[A-Za-z0-9]{2,5}$/, "")) || fallback,
    path: decodeUrlPart(segments.slice(0, -1).join("/")) || fallback,
  }
}
