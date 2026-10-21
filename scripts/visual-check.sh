#!/usr/bin/env bash
# 页面级核对：起一台隔离的 dev（默认 8899），用无头 Chrome 取 DOM 与截图，
# 断言"顶栏 GitHub 入口带图标""馆长卡有姓名行""<title> 非空"，然后按端口收进程。
#
# 为什么单独成脚本而不并进 usage-probe：这里依赖本机装的 Chrome，而探针在 CI 里也要能跑。
#   bash scripts/visual-check.sh
#   CHROME_PATH="/path/to/chrome" bash scripts/visual-check.sh   # 非默认安装位置
# 截图与 DOM 落在 .tmp-visual/（已被 .gitignore 的 .tmp-* 覆盖）。
set -u

PORT="${VISUAL_PORT:-8899}"
ROOT="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"

# 优先用仓库钉住的 wrangler（frontend/node_modules），与 CI/同事同一版本；还没 install 时回落到 npx
if [ -x "$ROOT/frontend/node_modules/.bin/wrangler" ]; then
  WRANGLER_BIN="$ROOT/frontend/node_modules/.bin/wrangler"
else
  WRANGLER_BIN=""
fi
run_wrangler() {
  if [ -n "$WRANGLER_BIN" ]; then "$WRANGLER_BIN" "$@"; else npx wrangler "$@"; fi
}
WORK="$ROOT/.tmp-visual"
mkdir -p "$WORK"
LOG="$WORK/dev.log"

CHROME="${CHROME_PATH:-}"
if [ -z "$CHROME" ]; then
  for C in \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "$(command -v google-chrome || true)" \
    "$(command -v chromium || true)" \
    "$(command -v chromium-browser || true)"; do
    if [ -n "$C" ] && [ -x "$C" ]; then CHROME="$C"; break; fi
  done
fi
[ -n "$CHROME" ] || { echo "找不到 Chrome；用 CHROME_PATH 指过去" >&2; exit 1; }

echo "== build（dev 服务 dist 快照，先构建） =="
(cd "$ROOT/frontend" && pnpm run build > /dev/null 2>&1) || { echo "BUILD FAILED" >&2; exit 1; }

kill_probe_tree() {
  if command -v powershell.exe > /dev/null 2>&1; then
    powershell.exe -NoProfile -Command "
      \$hit = @(Get-CimInstance Win32_Process | Where-Object {
        (\$_.Name -eq 'workerd.exe' -and \$_.CommandLine -like \"*127.0.0.1:$PORT*\") -or
        (\$_.Name -eq 'node.exe' -and \$_.CommandLine -like \"*--port $PORT*\")
      })
      \$pids = @(\$hit | ForEach-Object { \$_.ProcessId })
      \$kids = @(Get-CimInstance Win32_Process | Where-Object {
        \$pids -contains \$_.ParentProcessId -and @('bash.exe','sh.exe','powershell.exe') -notcontains \$_.Name
      })
      \$all = @(\$pids + (\$kids | ForEach-Object { \$_.ProcessId })) | Sort-Object -Unique
      \$all | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }
    " > /dev/null 2>&1 || true
  else
    pkill -f "wrangler dev.*--port $PORT" 2> /dev/null || true
    pkill -f "workerd.*127.0.0.1:$PORT" 2> /dev/null || true
  fi
}
port_busy() {
  netstat -ano 2> /dev/null | tr -d '\r' | grep -i LISTENING | grep -q ":$PORT "
}
cleanup() {
  for _ in $(seq 1 8); do
    kill_probe_tree
    port_busy || break
    sleep 1
  done
  port_busy && echo "!! 警告：端口 $PORT 仍被占用" || echo "== dev worker 已停止，端口 $PORT 已释放 =="
  # 截图与 DOM 留着给人看；Chrome 的临时 profile 动辄几十 MB，用完就删
  rm -rf "$WORK/chrome-profile"
}
trap cleanup EXIT

echo "== 起 dev（$PORT） =="
# 端口不是自己的就别起跑（同 usage-probe.sh）：就绪检查会拿到别人的应答，收尾会杀掉别人的 workerd
if port_busy; then
  echo "!! 端口 $PORT 已被占用（多半是另一个会话的 wrangler dev）。" >&2
  echo "   先停掉它，或换端口：VISUAL_PORT=8898 bash scripts/visual-check.sh" >&2
  exit 1
fi
(cd "$ROOT/frontend" && run_wrangler dev --port "$PORT" --log-level warn > "$LOG" 2>&1 &)
READY=0
for _ in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/projects"; then READY=1; break; fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "!! dev worker 未在 $PORT 应答" >&2
  grep -vE '^[[:space:]]*$' "$LOG" 2> /dev/null | tail -15 | sed 's/^/    /' >&2
  exit 1
fi

BASE="http://127.0.0.1:$PORT"
echo "== 取 DOM 与截图 =="
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=9000 \
  --user-data-dir="$WORK/chrome-profile" --dump-dom "$BASE/" > "$WORK/dom.html" 2> /dev/null
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=9000 --user-data-dir="$WORK/chrome-profile" \
  --window-size=1440,1400 --screenshot="$WORK/home.png" "$BASE/" > /dev/null 2>&1

[ -s "$WORK/dom.html" ] || { echo "!! 没拿到 DOM" >&2; exit 1; }

echo "== 断言 =="
node - "$WORK/dom.html" <<'JS'
const fs = require('fs')
const html = fs.readFileSync(process.argv[2], 'utf8')
const checks = [
  ['页面 <title> 非空', /<title>\s*\S[\s\S]*?<\/title>/.test(html)],
  ['顶栏 GitHub 入口带 Octocat 图标', /class="header-github"[\s\S]{0,600}?<svg/.test(html)],
  ['馆长卡有姓名行（姓名 / NAME）', />(姓名|NAME)</.test(html)],
]
let failed = 0
for (const [name, ok] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`)
  if (!ok) failed += 1
}
process.exit(failed ? 1 : 0)
JS
RESULT=$?

echo "截图: .tmp-visual/home.png（$([ -f "$WORK/home.png" ] && echo 已生成 || echo 未生成)）"
echo "DOM:  .tmp-visual/dom.html"
if [ "$RESULT" -ne 0 ]; then
  echo "!! 页面级核对未通过" >&2
  exit 1
fi
echo "页面级核对通过 ✓"
