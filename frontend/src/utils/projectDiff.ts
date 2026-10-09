/**
 * 抽屉里的当前内容 vs 列表基线行：唯一一份「哪些列变了」的判定。
 *
 * 保存路径与「未保存改动」提示必须用同一判据，否则会出现「关闭时说没改动、保存却写进去」
 * 或反过来（本项目在管理端明令禁止假状态）。逐列比较用 JSON.stringify：
 * features / metrics / timeline / description 这些结构化列直接比引用会永远不等。
 */

/**
 * 库里存 JSON 字符串的列：先解析再比。
 * 不这么做的话，库里写成 `["a", "b"]`（带空格）而抽屉重新序列化成 `["a","b"]` 会被判成"有改动"，
 * 于是每次打开都提示未保存——一个纯粹的假警报。
 */
const JSON_COLUMNS = new Set(["preview_images_json"])

function comparable(key: string, value: unknown): unknown {
  if (JSON_COLUMNS.has(key) && typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) return JSON.stringify(parsed.map((item) => String(item).trim()))
    } catch {
      // 库里是坏 JSON：原样比，至少不会把"坏值"和"空数组"当成相等
    }
  }
  return value
}

export function changedColumns(
  baseline: Record<string, unknown>,
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const changed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(draft)) {
    if (key === "id") continue
    if (JSON.stringify(comparable(key, baseline[key])) !== JSON.stringify(comparable(key, value))) {
      changed[key] = value
    }
  }
  return changed
}

/**
 * 「有没有未保存改动」= 改动集非空。调用方（抽屉的四个关闭入口）关心的是"要不要拦一次"，
 * 而新建项目没有基线时由调用方自己按"有内容"处理——所以这里不再单独包一层布尔函数。
 */
