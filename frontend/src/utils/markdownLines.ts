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
