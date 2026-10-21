/**
 * 单次 GitHub 同步的行数上限：Worker 的批次校验与后台的说明文案**共用这一份**。
 *
 * 为什么要在 src/ 下而不是只写在 worker 里：上限是拿免费版「每次调用 50 个子请求」算出来的
 * （算术与逐行成本见 `worker/index.ts` 的 `syncRowCost`，闸门 `test/sync_scope.test.mjs` 钉住），
 * 但界面必须提前告诉管理员一批能勾几个。两处各写一个数字时，改动预算只会红一边，
 * 另一边就变成"界面说 10 个、服务端拒绝 10 个"的假说明。
 */

/** 不抓文档时一批最多同步多少件 */
export const SYNC_MAX_ROWS = 10

/** 勾选「同时抓取 README / Compose 文档」时一批最多几件（每行最坏 20 个子请求） */
export const SYNC_MAX_DOC_ROWS = 2

/** 当前抓取模式下的一批上限 */
export const syncRowCap = (fetchDocs: boolean): number => (fetchDocs ? SYNC_MAX_DOC_ROWS : SYNC_MAX_ROWS)
