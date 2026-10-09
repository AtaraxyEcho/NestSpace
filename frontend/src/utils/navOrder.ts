/**
 * 首页内容栏目的顺序 = 管理端「导航与标头」里 navItems 的顺序。
 *
 * 为什么单独抽出来：导航条一直是数据驱动的（navItems 可拖序、可隐藏），
 * 而首页四段以前是写死在 JSX 里的（cabinet → catalogue → curator → index）。
 * 于是后台把导航拖成 Index / Cabinet / … 之后，导航条变了、页面段落还是老顺序——
 * 同一个设置只管到一半。这里把"顺序"变成一份可测的纯函数，App 只负责按它渲染。
 */

export type HomeSectionId = "cabinet" | "catalogue" | "curator" | "index"

/** 首页的四段，也是导航条允许指向的四个锚点（与 SECTION_ANCHORS 同一批 id） */
export const HOME_SECTION_IDS: readonly HomeSectionId[] = [
  "cabinet",
  "catalogue",
  "curator",
  "index",
]

/**
 * 按 navItems 给出段落顺序：
 * - 只认 HOME_SECTION_IDS 里的 id（导航可以指向外部链接或将来新增的段落，不该影响首页排版）；
 * - 重复 id 只取第一次出现；
 * - **导航里没有的段落排到末尾**，而不是消失——后台删掉一个导航项不该顺手把整段内容从页面上弄丢。
 */
export function orderHomeSections(
  navItems: readonly { id?: string }[] | null | undefined,
): HomeSectionId[] {
  const picked: HomeSectionId[] = []
  const seen = new Set<string>()
  for (const item of navItems ?? []) {
    const id = item?.id
    if (!id || seen.has(id)) continue
    if ((HOME_SECTION_IDS as readonly string[]).includes(id)) {
      seen.add(id)
      picked.push(id as HomeSectionId)
    }
  }
  for (const id of HOME_SECTION_IDS) {
    if (!seen.has(id)) picked.push(id)
  }
  return picked
}
