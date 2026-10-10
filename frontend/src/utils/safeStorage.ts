// 浏览器存储的安全读写：禁用存储的环境（隐私模式、企业策略、Safari 的某些状态）
// 连 `sessionStorage` 这个属性都可能直接抛 SecurityError；读发生在 render 期时，
// 一次抛出就是整站白屏。这里把异常收成"没有值"，与"读不到"同义。

export function readSession(key: string): string {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export function writeSession(key: string, value: string): void {
  try {
    globalThis.sessionStorage?.setItem(key, value)
  } catch {
    // 存不进去只影响"下次打开免口令"，不该打断当前操作
  }
}

export function clearSession(key: string): void {
  try {
    globalThis.sessionStorage?.removeItem(key)
  } catch {
    // 同上：清不掉不是用户需要知道的错误
  }
}
