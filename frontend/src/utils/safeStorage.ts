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

// 跨会话存储：访问统计的匿名 ID 与"不计入"开关需要跨天存活，
// 所以用 localStorage。读写同样收掉异常——存储被禁用时当作"没有值/没写进去"。

export function readLocal(key: string): string {
  try {
    return globalThis.localStorage?.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // 写不进去由调用方回读判断（例如排除开关会明确提示未生效）
  }
}

export function removeLocal(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    // 同上
  }
}
