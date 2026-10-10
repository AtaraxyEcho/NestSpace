// 双语字段（挑战 / 解决方案）读侧规则 + 管理端投影 的闸门（node bilingual.test.mjs）
// 覆盖：新列优先、旧单列按内容猜语言落栏、空对象不算内容、坏 JSON 不抛错、
//       按语言取值与「回退到另一种语言」的标注、管理端投影必须把双语对象交出去。
import { strict as assert } from 'node:assert'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = (...parts) => pathToFileURL(join(HERE, ...parts)).href

const { asBilingual, pickBilingual, pickSiteHeading, pairFromSingleText } = await import(
  url('src', 'utils', 'bilingual.ts')
)
const worker = await import(url('worker', 'index.ts'))
const { adminProjectRow, EDITABLE_COLUMNS, EDITABLE_JSON_COLUMNS, normalizeJsonValue } = worker

const cases = []
const check = (name, fn) => cases.push([name, fn])

check('新列有值时以新列为准，旧单列不参与', () => {
  const pair = asBilingual('{"en":"English text","zh":"中文文本"}', '旧中文')
  assert.deepEqual(pair, { en: 'English text', zh: '中文文本' })
})

check('新列为空 → 旧单列按中文兜底（老标本不会因为这次改动变空）', () => {
  assert.deepEqual(asBilingual('', '面向个人自托管场景……'), { en: '', zh: '面向个人自托管场景……' })
  assert.deepEqual(asBilingual('', ''), { en: '', zh: '' }, '两处都空才是真没内容')
  assert.deepEqual(asBilingual(undefined, undefined), { en: '', zh: '' })
})

check("'{}' 算没写过 → 旧列兜底；但带 en/zh 键的空对是\"主动清空\" → 必须生效", () => {
  assert.deepEqual(asBilingual('{}', '旧中文'), { en: '', zh: '旧中文' }, '空对象 = 没写过')
  // 这条就是"删除永远不生效"的回归守卫：抽屉保存的永远是完整一对，清空后写入
  // {"en":"","zh":""}，若还回退旧列，管理员删掉的中文会在下次读取时复活。
  assert.deepEqual(asBilingual('{"en":"","zh":""}', '旧中文'), { en: '', zh: '' }, '显式清空不回退')
})

check("垃圾形状不渲染字面量（'[]' / '\"abc\"' / 'null' / '0'）", () => {
  for (const junk of ['[]', '"abc"', 'null', '0', 'true', '{"nope":1}']) {
    assert.deepEqual(asBilingual(junk, ''), { en: '', zh: '' }, `${junk} 不该变成页面上的字`)
    assert.deepEqual(asBilingual(junk, '旧中文'), { en: '', zh: '旧中文' }, `${junk} 时旧列仍兜底`)
  }
})

check('普通正文（含以数字开头的中文）不被误判成 JSON', () => {
  assert.deepEqual(asBilingual('3 天内完成迁移', ''), { en: '', zh: '3 天内完成迁移' })
  assert.deepEqual(asBilingual('面向个人与家庭自托管场景…', ''), {
    en: '',
    zh: '面向个人与家庭自托管场景…',
  })
})

check('旧列里若混进 JSON，也按同一套判据解析（不是一律当中文正文）', () => {
  assert.deepEqual(asBilingual('', '{"en":"E","zh":"Z"}'), { en: 'E', zh: 'Z' })
})

check('旧列是英文时落到 en 栏：中文视图回退并标「原文」，不冒充中文', () => {
  // 0002 种子把英文写进旧列；若一律当中文，中文视图会把英文当"中文文案"显示且不打标
  const legacy = 'Creative teams were spending more time maintaining slides than shipping.'
  assert.deepEqual(asBilingual('', legacy), { en: legacy, zh: '' })
  assert.deepEqual(pickBilingual('', 'zh', legacy), { text: legacy, fallback: true })
  assert.deepEqual(pickBilingual('', 'en', legacy), { text: legacy, fallback: false })
})

check('旧列是中文时仍落 zh 栏（历史后台手工填的那一批不受影响）', () => {
  assert.deepEqual(asBilingual('', '中文方案'), { en: '', zh: '中文方案' })
  assert.deepEqual(pickBilingual('', 'en', '中文方案'), { text: '中文方案', fallback: true })
})

check('新列存的是纯文本（非 JSON）时同样按语言落栏', () => {
  assert.deepEqual(asBilingual('A single English line.'), { en: 'A single English line.', zh: '' })
  assert.deepEqual(asBilingual('一句中文'), { en: '', zh: '一句中文' })
})

check('库里是坏 JSON 或非 JSON 文本时不抛错（读侧宽容，写侧才严格）', () => {
  assert.deepEqual(asBilingual('{"en":', '旧中文'), { en: '', zh: '旧中文' }, '截断的 JSON → 旧列兜底')
  assert.deepEqual(asBilingual('一段普通中文'), { en: '', zh: '一段普通中文' }, '非 JSON 字符串当内容本身')
  assert.deepEqual(asBilingual(['a', 'b']), { en: '', zh: '' }, '数组不是合法形状')
  assert.deepEqual(asBilingual(42), { en: '', zh: '' }, '数字不是合法形状')
})

check('按语言取值：命中当前语言时不标原文', () => {
  const pair = { en: 'English', zh: '中文' }
  assert.deepEqual(pickBilingual(pair, 'en'), { text: 'English', fallback: false })
  assert.deepEqual(pickBilingual(pair, 'zh'), { text: '中文', fallback: false })
})

check('当前语言缺失 → 回退另一种语言并标 fallback（前台据此显示「中文原文」）', () => {
  const onlyZh = { en: '', zh: '只有中文' }
  assert.deepEqual(pickBilingual(onlyZh, 'en'), { text: '只有中文', fallback: true })
  assert.deepEqual(pickBilingual(onlyZh, 'zh'), { text: '只有中文', fallback: false })
  const onlyEn = { en: 'only english', zh: '' }
  assert.deepEqual(pickBilingual(onlyEn, 'zh'), { text: 'only english', fallback: true })
})

check('pickBilingual 也接受旧形状（列表页可能仍拿到纯字符串）', () => {
  assert.deepEqual(pickBilingual('旧中文', 'en'), { text: '旧中文', fallback: true })
  assert.deepEqual(pickBilingual(null, 'zh', '旧中文'), { text: '旧中文', fallback: false })
  assert.deepEqual(pickBilingual('', 'en'), { text: '', fallback: false }, '什么都没有时不编造内容')
})

check('值两侧空白被去掉，纯空白不算内容', () => {
  assert.deepEqual(asBilingual({ en: '  ', zh: '  中文  ' }), { en: '', zh: '中文' })
})

// —— 管理端投影：抽屉绑的就是这两个键 ——
check('adminProjectRow 把双语对象交给抽屉（而不是旧单列字符串）', () => {
  const row = adminProjectRow({
    id: '005',
    challenge: '旧中文挑战',
    challenge_json: '{"en":"English challenge","zh":"中文挑战"}',
    solution: '旧中文方案',
    solution_json: '',
  })
  assert.deepEqual(row.challenge, { en: 'English challenge', zh: '中文挑战' })
  assert.deepEqual(row.solution, { en: '', zh: '旧中文方案' }, '新列为空时旧列兜底')
})

check('挑战 / 方案已搬到 JSON 列白名单（旧纯文本列不再被写）', () => {
  assert.equal(EDITABLE_COLUMNS.challenge, undefined, 'challenge 不该再出现在纯文本列')
  assert.equal(EDITABLE_COLUMNS.solution, undefined)
  assert.equal(EDITABLE_JSON_COLUMNS.challenge, 'challenge_json')
  assert.equal(EDITABLE_JSON_COLUMNS.solution, 'solution_json')
})

check('POST 与 PUT 对同一 body 必须落库一致（双语列）', () => {
  // 本项目为 demoUrl 踩过"两条路径不一致"，双语列同理：PUT 若直接 stringify 原始 body，
  // 脚本/curl 传一个纯字符串就会存成 "abc"，下次读出来带引号进 UI。
  for (const value of [{ en: 'E', zh: 'Z' }, '纯文本', '', null, { en: '', zh: '' }, 42]) {
    assert.equal(
      normalizeJsonValue('challenge', value),
      JSON.stringify(asBilingual(value)),
      `值 ${JSON.stringify(value)} 两条路径要写同一份文本`,
    )
  }
  assert.equal(normalizeJsonValue('solution', '纯文本'), '{"en":"","zh":"纯文本"}')
  assert.equal(normalizeJsonValue('features', ['a', 'b']), '["a","b"]', '非双语列原样序列化')
})

check('description 与 challenge/solution 走同一套读侧规则', () => {
  // 旧写法是 safeJsonParse(row.description_json, {})：不 trim、不校验形状，
  // 且管理端默认值是 {} → description.en 可能是 undefined（React 会拿到 undefined 当值）
  const row = adminProjectRow({ id: '001', description_json: '{"en":" E ","zh":""}' })
  assert.deepEqual(row.description, { en: 'E', zh: '' }, '两侧都必须是字符串（已 trim）')
  const garbage = adminProjectRow({ id: '002', description_json: '[]' })
  assert.deepEqual(garbage.description, { en: '', zh: '' }, '垃圾形状退化成空对，不是 undefined')
})

check('单语简介只填"猜得出的那一种语言"，不再同塞两边', () => {
  assert.deepEqual(pairFromSingleText('A living index of experiments'), {
    en: 'A living index of experiments',
    zh: '',
  })
  assert.deepEqual(pairFromSingleText('面向个人与家庭自托管场景'), {
    en: '',
    zh: '面向个人与家庭自托管场景',
  })
  assert.deepEqual(pairFromSingleText('  '), { en: '', zh: '' }, '空白不算内容')
  // 同塞两种语言会让"当前语言有内容"成立，前台连「原文」标注都不给 —— 那是对访客撒谎
  const pair = pairFromSingleText('Edge applications needed traces')
  assert.deepEqual(pickBilingual(pair, 'zh'), { text: 'Edge applications needed traces', fallback: true })
})

check('POST 与 PUT 对 description 也落同一份文本', () => {
  for (const value of [{ en: 'E', zh: 'Z' }, '纯文本', undefined, { en: '', zh: '' }]) {
    assert.equal(
      normalizeJsonValue('description', value),
      JSON.stringify(asBilingual(value)),
      `值 ${JSON.stringify(value)} 两条路径要写同一份文本`,
    )
  }
})

check('站点小标题：语言留空回退另一种，纯空白等同于没填', () => {
  // 前台详情页的小标题与后台抽屉的栏名共用这一份，两边不可能各说一套
  const enOnly = { en: 'Why it needed to exist.', zh: '' }
  assert.equal(pickSiteHeading(enOnly, 'zh'), 'Why it needed to exist.', '中文留空 → 回退英文（与访客看到的一致）')
  assert.equal(pickSiteHeading(enOnly, 'en'), 'Why it needed to exist.', '英文本身照给')
  const both = { en: 'A narrow tool.', zh: '把工具收窄。' }
  assert.equal(pickSiteHeading(both, 'zh'), '把工具收窄。', '两种语言各取各的')
  assert.equal(pickSiteHeading({ en: '  ', zh: '\n' }, 'en'), '', '纯空白按 trim 后算未填，不能渲染出一个空白标题')
  assert.equal(pickSiteHeading({ en: '', zh: '' }, 'zh'), '', '两边都空返回空串，由调用方回退内置默认')
})

let failed = 0
for (const [name, fn] of cases) {
  try {
    fn()
  } catch (err) {
    failed += 1
    console.error(`  ✗ ${name}\n    ${err.message}`)
  }
}
if (failed) {
  console.error(`bilingual：${failed}/${cases.length} 个用例失败`)
  process.exit(1)
}
console.log(`bilingual：全部 ${cases.length} 个用例通过（新列优先 / 旧列按内容落栏 / 坏数据不抛错 / 回退标注 / 管理端投影 / 站点小标题口径）✓`)
