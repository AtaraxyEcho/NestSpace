#!/usr/bin/env bash
# 生产只读烟测：**只发 GET**。push 之后用它判断"是代码没生效，还是迁移没跑"。
#
#   bash scripts/verify-production.sh
#   BASE_URL=https://your-domain bash scripts/verify-production.sh
#   ADMIN_TOKEN=... bash scripts/verify-production.sh     # 额外确认 0016 是否已跑
#
# 判定口径：
#   /api/admin/visits 未带凭据必须是 401（路由与鉴权在）。503 = 表没迁（0016 未跑）；
#   404 = 旧 Worker（路由还没上）；200 = 管理端没鉴权，属于事故。
#   注意：鉴权发生在 handler 之前，所以**无凭据的 401 证明不了表在不在**；给 ADMIN_TOKEN 才会做
#   带凭据的 GET，200 表示台账可读、非 200 会把响应体前 160 字节带出来。
set -u

BASE="${BASE_URL:-https://nestspace.online}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
FAIL=0
ROOT="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"
WORK="$ROOT/.tmp-verify"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

say() { printf '%s\n' "$*"; }
ok() { say "  ✓ $*"; }
bad() { say "  ✗ $*"; FAIL=1; }

say "目标: $BASE"

# 1) 首页：200 且 <title> 非空（title 是 Worker 按 D1 覆写注入的，空标题说明注入链路坏了）
HOME_CODE=$(curl -s -o "$WORK/home.html" -w '%{http_code}' --max-time 20 "$BASE/")
TITLE=$(grep -o "<title>[^<]*</title>" "$WORK/home.html" 2> /dev/null | head -1)
if [ "$HOME_CODE" = "200" ] && [ -n "$TITLE" ]; then
  ok "首页 200，标题 ${TITLE}"
else
  bad "首页异常：HTTP $HOME_CODE，标题 '${TITLE}'"
fi

# 2) 公开列表：200 且至少一条（空数组通常意味着库没迁/种子没跑，首页会静默退回内置数据）
PROJECTS_N=$(curl -s --max-time 20 "$BASE/api/projects" | node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try {
    const parsed = JSON.parse(s)
    const rows = Array.isArray(parsed) ? parsed : parsed.projects
    process.stdout.write(String(Array.isArray(rows) ? rows.length : -1))
  } catch {
    process.stdout.write("-1")
  }
})
')
if [ "$PROJECTS_N" -gt 0 ] 2> /dev/null; then
  ok "/api/projects 返回 $PROJECTS_N 条"
else
  bad "/api/projects 没有返回项目（HTTP 或 JSON 异常）"
fi

# 3) 站点文案：200 且是一个对象
SETTINGS_CODE=$(curl -s -o "$WORK/settings.json" -w '%{http_code}' --max-time 20 "$BASE/api/site-settings")
SETTINGS_OK=$(node -e '
try {
  const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
  process.stdout.write(d && typeof d === "object" && !Array.isArray(d) ? "1" : "0")
} catch {
  process.stdout.write("0")
}
' "$WORK/settings.json")
if [ "$SETTINGS_CODE" = "200" ] && [ "$SETTINGS_OK" = "1" ]; then
  ok "/api/site-settings 200（JSON 对象）"
else
  bad "/api/site-settings 异常：HTTP $SETTINGS_CODE"
fi

# 4) 管理端：未带凭据必须 401。503/404/200 各有明确含义，分别报出来。
VISITS_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/api/admin/visits")
case "$VISITS_CODE" in
  401) ok "/api/admin/visits 未带凭据 401（鉴权在）" ;;
  503) bad "/api/admin/visits 503：表未迁移，先在仓库根跑 bash scripts/d1-migrate.sh remote（0016）" ;;
  404) bad "/api/admin/visits 404：Worker 还是旧版（这条路由没上线）" ;;
  200) bad "/api/admin/visits 未带凭据返回 200：管理端鉴权失效，立刻检查" ;;
  *) bad "/api/admin/visits 异常 HTTP $VISITS_CODE" ;;
esac

# 4b) 可选：带凭据确认台账可读（能区分"表在"与"表没迁"）
if [ -n "$ADMIN_TOKEN" ]; then
  AUTH_CODE=$(curl -s -o "$WORK/visits.json" -w '%{http_code}' --max-time 20 \
    -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/visits?days=7")
  if [ "$AUTH_CODE" = "200" ]; then
    ok "带凭据 /api/admin/visits 200（0016 已迁移，台账可读）"
  else
    bad "带凭据 /api/admin/visits 异常 HTTP $AUTH_CODE：$(head -c 160 "$WORK/visits.json" 2> /dev/null)"
  fi
else
  say "  · 未提供 ADMIN_TOKEN，跳过“表是否已迁移”的确认"
fi

# 5) 品牌资产：必须是图片，不能是 SPA 兜底出来的 index.html
for ASSET in /brand/logo-mark.png /brand/logo-banner.png /brand/favicon.ico /brand/apple-touch-icon.png; do
  LINE=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 20 "$BASE$ASSET")
  case "$LINE" in
    200\ *text/html*|200\ *application/json*|4*\ *|5*\ *) bad "$ASSET -> $LINE" ;;
    *) ok "$ASSET -> $LINE" ;;
  esac
done

if [ "$FAIL" -ne 0 ]; then
  say "烟测未通过（见上方 ✗）"
  exit 1
fi
say "生产烟测通过 ✓"
