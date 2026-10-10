/**
 * 段落行的两种口径。单独放一个无 JSX 的模块，是因为 markdown.tsx 里有 JSX，
 * 而 Node 的原生 type stripping 只剥类型、不转换 JSX —— .mjs 闸门吃不下 .tsx，
 * 这两条判据又是"改一个就换一种显示效果"的地方，必须有测试钉着。
 *
 * - README：breaks=false。README 源码习惯在 80 列折行，句中的换行不是排版意图，
 *   拼回一行才对；若把它变成硬换行，每一篇 README 都会变成 80 列宽的短行瀑布。
 * - 后台正文（挑战 / 方案）：breaks=true。管理员在 textarea 里按 Enter，
 *   就是想另起一行，换行本身即语义。
 */

export function joinParagraphLines(lines: string[], breaks: boolean): string {
  return lines.join(breaks ? '\n' : ' ')
}

/**
 * 渲染前按硬换行拆开。默认口径下段落文本里不会出现 '\n'（上一步已用空格拼接），
 * 所以拆开永远是一项，README 的输出与改动前逐字一致。
 */
export function splitParagraphLines(text: string): string[] {
  return text.split('\n')
}

/**
 * 行内解析（链接/图片/粗斜体/行内代码）与"去 HTML 标签"的单段长度上限。
 *
 * 为什么要设上限：那几个正则都要求闭合符，输入里若是一长串没有闭合符的 `[` 或 `<`，
 * 引擎会在每个起点向前扫到段尾 ⇒ 平方级退化。实测 20 万字符的一行要 ~40 秒、5 万字符 2.4 秒，
 * 而这是**同步渲染**，等于把页面冻住。项目正文（README / 后台正文）没有长度上限，
 * 同步抓来的 README 完全可能带一条超长行，所以必须在解析前挡住。
 *
 * 超过上限就按纯文本原样呈现：少几处加粗，好过卡死。
 */
export const MD_TEXT_PARSE_MAX = 12000

export function exceedsInlineParseLimit(text: string): boolean {
  return text.length > MD_TEXT_PARSE_MAX
}
