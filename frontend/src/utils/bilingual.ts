/**
 * 双语文本（{en, zh}）的读侧规则。Worker 的三个投影与管理端/前台都用这一份，
 * 免得"库里怎么存"在两侧各解释一遍。
 *
 * 为什么需要兜底：`challenge` / `solution` 以前是**单列纯文本**。0011 加了
 * `challenge_json` / `solution_json` 之后旧列不再双写，只作只读兜底：
 * 新列"从来没写过"时用旧列，老标本不会因为这次改动整段变空。
 * 旧列的文字**按内容猜语言**（种子里的挑战/方案是英文，后台手工填的基本是中文）——
 * 一律当中文会让英文文案在中文视图里冒充中文，猜错的代价只是「原文」标的朝向。
 *
 * "没写过"与"被清空"必须能区分，否则删除永远不生效（本轮实测到的假状态）：
 * 抽屉保存的是完整的一对 → 清空后写入 `{"en":"","zh":""}`（带 en/zh 键）= 明确的空记录，不再回退；
 * 而 `''` / `'{}'` / 坏 JSON / `'null'` / `'[]'` 这类"没写过或垃圾形状"才继续用旧列。
 */

export type BilingualText = { en: string; zh: string }

const EMPTY: BilingualText = { en: "", zh: "" }

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "")

function fromPair(raw: Record<string, unknown>): BilingualText {
  return { en: str(raw.en), zh: str(raw.zh) }
}

/** 写了 en/zh 任一键（哪怕值是空串）就是"一条明确的双语记录"，不能再回退旧列 */
const hasPairKeys = (raw: Record<string, unknown>) => "en" in raw || "zh" in raw

/**
 * 把一列文本分成三类：
 * - text  ：不是 JSON 形态 → 当正文本身（历史中文文案就是这一类）
 * - pair  ：JSON 对象且带 en/zh 键 → 双语记录（两栏都空 = 管理员**主动清空**，必须生效）
 * - empty ：没写过 / 坏 JSON / `'{}'` / `'[]'` / `'null'` / `'0'` / `'"abc"'` 这类垃圾形状
 *           → 不渲染字面量，交给下一层兜底
 */
type Classified =
  | { kind: "text"; text: string }
  | { kind: "pair"; pair: BilingualText }
  | { kind: "empty" }

function classify(raw: unknown): Classified {
  const text = str(raw)
  if (!text) return { kind: "empty" }
  // 只有"整串就是 JSON"才尝试解析：以数字或 null 开头的中文正文（"3 天内完成迁移"）
  // 不是垃圾值，判成 JSON 会把内容整个吞掉（实测踩过）。
  const looksJson =
    text[0] === "{" ||
    text[0] === "[" ||
    text[0] === '"' ||
    /^(?:null|true|false|-?\d+(?:\.\d+)?)$/.test(text)
  if (!looksJson) return { kind: "text", text }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { kind: "empty" }
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>
    return hasPairKeys(obj) ? { kind: "pair", pair: fromPair(obj) } : { kind: "empty" }
  }
  return { kind: "empty" }
}

/**
 * @param value   新列的值：{en, zh} 对象、它的 JSON 字符串，或空
 * @param legacy  旧单列的纯文本（按内容猜语言，见 pairFromSingleText）
 */
export function asBilingual(value: unknown, legacy?: unknown): BilingualText {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    if (hasPairKeys(obj)) return fromPair(obj)
  } else if (typeof value === "string") {
    const c = classify(value)
    if (c.kind === "pair") return c.pair
    if (c.kind === "text") return pairFromSingleText(c.text)
  }
  // 旧列走**同一套**判据：历史上有人可能把 JSON 直接写进了旧列
  const fallback = classify(legacy)
  if (fallback.kind === "pair") return fallback.pair
  if (fallback.kind === "text") return pairFromSingleText(fallback.text)
  return { ...EMPTY }
}

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/**
 * 只有一句、不分语言的文本（仓库的 GitHub description、旧单列兜底）该落到哪一栏。
 * 同塞进两种语言 = 对访客撒谎：中文站会把英文简介当成"中文文案"显示，
 * 且因为"当前语言有内容"而不标原文。所以按内容猜一种语言填进去，另一种留空 →
 * 由 pickBilingual 回退并标注「原文」。猜错的代价只是标注方向反了，可见内容不变。
 */
export function pairFromSingleText(text: unknown): BilingualText {
  const value = str(text)
  if (!value) return { ...EMPTY }
  return CJK_RE.test(value) ? { en: "", zh: value } : { en: value, zh: "" }
}

/** 按语言取文。fallback=true 表示 requested 语言没有内容、给的是另一种语言（前台要标「原文」） */export function pickBilingual(
  value: BilingualText | string | null | undefined,
  lang: "en" | "zh",
  legacy?: unknown,
): { text: string; fallback: boolean } {
  const pair = typeof value === "object" && value !== null ? value : asBilingual(value, legacy)
  const wanted = lang === "en" ? pair.en : pair.zh
  if (wanted) return { text: wanted, fallback: false }
  const other = lang === "en" ? pair.zh : pair.en
  if (other) return { text: other, fallback: true }
  return { text: "", fallback: false }
}

/**
 * 站点级小标题（详情页「挑战 / 方案」两段的那两句）的取文口径：按语言取，该语言留空就回退另一种。
 *
 * 前台详情页与后台的字段标签**必须共用这一份**：后台的标签显示的就是访客看到的那句话，
 * 管理员改了标题，后台的指称跟着变。两边各写一遍正是这次要修的 bug（抽屉里还挂着
 * 「挑战 / 背景」「解决方案」这类写死的旧词，而它管的恰恰是能把这两个词改掉的设置）。
 */
export function pickSiteHeading(pair: BilingualText, lang: "en" | "zh"): string {
  return pickBilingual({ en: pair.en.trim(), zh: pair.zh.trim() }, lang).text
}
