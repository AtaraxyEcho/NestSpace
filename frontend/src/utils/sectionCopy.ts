/**
 * 栏目 / 页面文案的读侧判据：公开站点与管理端**共用这一份**。
 *
 * 为什么必须有这一份：导航标签今天已被三个地方各写一遍判据（顶栏、页脚章节列、后台页脚预览），
 * 再加第四个消费者（首页栏目标题）就是第四次分叉——而"后台改了导航名、栏目标题不动"正是本轮要修的 bug。
 * 现在四个消费者都调 navLabel，改名必然同时生效。
 *
 * 两类槽位两套判据，不可混用：
 * - 并排显示（`EN <em>/ ZH</em>`，详情页那三处标题）：每种语言各取各的，该语言留空只回退**该语言**的内置默认。
 *   用跨语言回退会让"只填英文"的标题框把中文侧也顶成英文。
 * - 按访客语言只显示一种（首页描述行）：走 pickSiteHeading，一侧空着回退另一种，两边都空 = 不渲染。
 */
import type { Language } from '../types/project'
import type {
  NavItemConfig,
  SectionSlotKey,
  SectionSlotMap,
  SectionSlotPair,
} from '../types/siteSettings'
import {
  BUILT_IN_SECTION_SLOTS,
  SECTION_SLOT_TEXT_MAX,
  defaultNavItem,
} from '../data/defaultSiteSettings.ts'
import { pickSiteHeading } from './bilingual.ts'
import type { HomeSectionId } from './navOrder'

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** 导航标签：当前语言为空就用另一种语言顶（与改造前三处内联写法同一口径） */
export function navLabel(item: NavItemConfig, lang: Language): string {
  const en = text(item.labelEn)
  const zh = text(item.labelZh)
  return lang === 'zh' ? zh || en : en || zh
}

/** 按 id 找导航项；库里缺这一项（老数据、或被展示偏好摘掉）时落内置默认 */
export function findNavItem(
  items: readonly { id?: string; labelEn?: string; labelZh?: string; visible?: boolean }[] | null | undefined,
  id: HomeSectionId,
): NavItemConfig {
  const found = (items ?? []).find((item) => item?.id === id) as NavItemConfig | undefined
  if (found) return found
  return defaultNavItem(id)
}

/**
 * 首页栏目标题 = 导航标签本身（不设覆盖字段，也不内置标题默认）。
 * 必须走 navLabel 而不是"各语言回退各自的内置默认"：管理员只填了一种语言时，
 * 导航条显示的是那一串，标题也必须显示同一串——否则"改了导航名、标题不跟"这类 bug
 * 会在一边留空的标签上复活（内置默认顶在前面）。内置默认只在**整项缺失**时才用得到（见 findNavItem）。
 * pair=false 表示中英两串相同，渲染时省掉 `<em>/ …</em>`，避免出现 "Statistics / Statistics"。
 */
export function sectionHeading(
  items: Parameters<typeof findNavItem>[0],
  id: HomeSectionId,
): { en: string; zh: string; pair: boolean } {
  const item = findNavItem(items, id)
  const en = navLabel(item, 'en')
  const zh = navLabel(item, 'zh')
  return { en, zh, pair: zh !== '' && zh !== en }
}

/** 单格上限与整列序列化上限 */
export const SECTION_SLOT_SERIALIZED_MAX = 4000

export const SECTION_SLOT_KEYS = Object.keys(BUILT_IN_SECTION_SLOTS) as SectionSlotKey[]

/**
 * 取一格的原始值。库里/接口可能给回 `[]`（Worker 对 JSON 列的统一兜底）、
 * 甚至一个字符串（手改过的库），所以先确认槽位是对象再取键——
 * 不这么做的话管理端 `{...slot}` 会把字符串摊成 `{"0":"..."}` 再写回库。
 */
function plainSlot(map: SectionSlotMap | null | undefined, key: SectionSlotKey) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return undefined
  const slot = (map as Record<string, unknown>)[key]
  return slot && typeof slot === 'object' && !Array.isArray(slot) ? (slot as SectionSlotPair) : undefined
}

/** 并排式槽位的渲染三元组：中英串 + 要不要 `<em>`（中文侧为空或中英同串时不要） */
export function slotHeading(
  map: SectionSlotMap | null | undefined,
  key: SectionSlotKey,
): { en: string; zh: string; pair: boolean } {
  const slot = plainSlot(map, key)
  const built = BUILT_IN_SECTION_SLOTS[key]
  // 并排显示：每种语言各取各的，该语言留空只回退**该语言**的内置默认（D14）
  const en = text(slot?.en) || built.en
  const zh = text(slot?.zh) || built.zh
  return { en, zh, pair: en !== '' && zh !== '' && zh !== en }
}

/** 单显式槽位（首页描述行）：按语言取、一侧空着回退另一种，两边都空返回空串 = 不渲染这一行 */
export function slotProse(
  map: SectionSlotMap | null | undefined,
  key: SectionSlotKey,
  lang: Language,
): string {
  const slot = plainSlot(map, key)
  const built = BUILT_IN_SECTION_SLOTS[key]
  return pickSiteHeading({ en: text(slot?.en) || built.en, zh: text(slot?.zh) || built.zh }, lang)
}

/**
 * 写侧预算闸门：逐格点名超限的槽位，再算整列序列化是否越过前端自设的整串上限。
 * 为什么前端也判一遍：Worker 的 400 只会点名 `sectionCopy` 这一个顶层字段、说不出是哪一格，
 * 且超限时**整个键**被拒，看起来像"改了没保存"。这里是**前端自己拦下**（不发请求），
 * Worker 的 5000 才是最终裁决；上限取 4000 是给键名与标点留出余量，避免贴着服务端走。
 */
export function sectionSlotIssues(map: SectionSlotMap | null | undefined): string[] {
  const problems: string[] = []
  if (!map || typeof map !== 'object' || Array.isArray(map)) return problems

  for (const key of SECTION_SLOT_KEYS) {
    const slot = map[key]
    for (const lang of ['en', 'zh'] as const) {
      const value = slot?.[lang]
      if (typeof value !== 'string') continue
      if (value.trim().length > SECTION_SLOT_TEXT_MAX) {
        problems.push(
          `「${key}」${lang === 'en' ? '英文' : '中文'}有 ${value.trim().length} 字符，超过 ${SECTION_SLOT_TEXT_MAX} 字符上限`,
        )
      }
    }
  }

  const serialized = JSON.stringify(map).length
  if (serialized > SECTION_SLOT_SERIALIZED_MAX) {
    problems.push(
      `栏目文案合计 ${serialized} 字符，超过 ${SECTION_SLOT_SERIALIZED_MAX} 的整列上限（已拦下，未发送；服务端上限是 5000）`,
    )
  }
  return problems
}
