#!/usr/bin/env bash
# 一次性把本地 Worker 起在 8898（用默认 .wrangler/state，绝不碰生产），探完
# /api/usage 的接受与拒绝、/api/img 的缩略图档、管理端写路径与双语写读往返、
# 以及访问台账的 D1 落地（PV/UV 去重、爬虫与管理端排除、事件计数），
# 最后把**我自己**起的进程连同子进程收干净（并把探针写过的种子行复原）。
set -u
VISIT_FAIL=0
PROBE_FAIL=0
export LANG=C.UTF-8
# 路径全部相对脚本自身解析，不再写死本机绝对路径（换机器/换用户名都能跑）
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
cd "$ROOT/frontend" || exit 1
# 中间文件统一放仓库根的 .tmp-probe/（已被 .gitignore 的 .tmp-* 覆盖）。
# 注意别用 /tmp：原生 node 读不懂 MSYS 的 /tmp 路径
WORK="$ROOT/.tmp-probe"
mkdir -p "$WORK"

echo "== build（dist 必须是最新的，否则 wrangler 报 no such asset）=="
pnpm run build >/dev/null 2>&1 || { echo "BUILD FAILED"; exit 1; }

PORT="${PROBE_PORT:-8898}"
LOG="$WORK/wrangler-usage.log"
# 服务不在这里起：要先有 port_busy / trap，见下面「== 起 dev ==' 一段
kill_probe_tree() {
  # Windows 下 wrangler dev 的进程树是 bash→cmd→node→node→workerd 多层，
  # 而且 $! 抓到的外层 PID 常常不是这棵树的根。所以主收路径交给 PowerShell：按**端口**精确匹配这一支
  #   - workerd 的命令行含 `--socket-addr=entry=127.0.0.1:<PORT>`
  #   - wrangler 的 node 命令行含 `--port <PORT>`
  # 再连带它们的子进程一并收。只匹配本端口，不动别人的服务。
  # 必须按 Name 限定成 node/workerd：**不能**只看"命令行里有没有 --port 8898"。这条 PS 文本本身就带
  # `--port 8898`，所以 bash.exe / cmd.exe / powershell.exe 全都会被匹配上（实测 10 条），
  # 而 Stop-Process 按 PID 升序处理——先把自己这条收了，workerd 排在后面就永远留下来了。
  if command -v powershell.exe >/dev/null 2>&1; then
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
    " >/dev/null 2>&1 || true
  else
    # Linux/macOS：按端口精确匹配，只收自己起的那一支
    pkill -f "wrangler dev.*--port $PORT" 2>/dev/null || true
    pkill -f "workerd.*127.0.0.1:$PORT" 2>/dev/null || true
  fi
}

port_busy() {
  netstat -ano 2>/dev/null | tr -d '\r' | grep -i LISTENING | grep -q ":$PORT "
}

cleanup() {
  # 收一轮就够的情况是少数：workerd 会被 wrangler 的 supervisor 重新拉起，而拉起发生在收完之后。
  # 所以按"收 → 看端口 → 再收"有界重试，端口空了才走人（以前只收一轮就宣布释放，实测留过孤儿进程）。
  for _ in $(seq 1 8); do
    kill_probe_tree
    port_busy || break
    sleep 1
  done
  if port_busy; then
    echo "!! 警告：端口 $PORT 仍被占用，请手动清理后再跑"
  else
    echo "== dev worker 已停止，端口 $PORT 已释放 =="
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "== 起 dev（$PORT） =="
# 端口不是自己的就别起跑：同一工作树可能有另一个会话的 wrangler dev 占着 8898。
# 那种情况下"等就绪"会拿到**别人**的应答，实测写进的是那一支的库，
# 而收尾按端口收进程——等于把另一个会话的服务杀掉，还自称"端口已释放"。
if port_busy; then
  echo "!! 端口 $PORT 已被占用（多半是另一个会话的 wrangler dev）。" >&2
  echo "   先停掉它，或换端口：PROBE_PORT=8897 bash scripts/usage-probe.sh" >&2
  exit 1
fi
run_wrangler dev --port "$PORT" --log-level warn > "$LOG" 2>&1 &

echo "== 等就绪 =="
READY=0
for _ in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/projects"; then READY=1; break; fi
  sleep 1
done
# 没起来就别往下跑：以前会打出一整屏 HTTP 000 的真失败，却看不出原因，
# 而唯一的原因在 $LOG 里——cleanup 会连工作目录一起删掉。
worker_log_tail() {
  echo "  wrangler 日志尾部："
  grep -vE '^[[:space:]]*$' "$LOG" 2>/dev/null | tail -15 | sed 's/^/    /'
}
if [ "$READY" -ne 1 ]; then
  echo "!! dev worker 未在 $PORT 应答，探针终止"
  worker_log_tail
  exit 1
fi

probe() {
  local label="$1"; shift
  local code
  code=$(curl -s -D "$WORK/usage-head.txt" \
    -o "$WORK/usage-body.bin" -w '%{http_code}' "$@")
  # 标签里写了「（要 NNN）」的，实际状态码不符时记失败（以前只打印，回归不会让脚本变红）
  local expected
  expected=$(printf '%s' "$label" | grep -oE '要 [0-9]{3}' | grep -oE '[0-9]{3}' | head -1)
  if [ -n "$expected" ] && [ "$code" != "$expected" ]; then
    PROBE_FAIL=1
    echo "  !! 期望 HTTP $expected，实际 $code"
  fi
  # 响应体可能是二进制图片：只留可打印字符（含中文，Git Bash 的 [:print:] 会把 CJK 全滤掉）
  local peek ctype
  peek=$(node -e '
    const b = require("fs").readFileSync(process.argv[1])
    process.stdout.write(
      b.toString("utf8").replace(/[^\x20-\x7E\u3000-\u9fff\uff00-\uffef]/g, "").slice(0, 160),
    )
  ' "$WORK/usage-body.bin" 2>/dev/null)
  ctype=$(tr -d '\r' < "$WORK/usage-head.txt" | grep -ai '^content-type:' | head -1 | cut -d' ' -f2-)
  echo "$label -> HTTP $code | ${ctype:-无Content-Type} | ${peek:0:140}"
}

echo
echo "== 0. 健康检查（本地库有数据才谈得上写侧实测） =="
probe "GET /api/projects" "http://127.0.0.1:$PORT/api/projects"

echo
echo "== 1. 埋点端点 =="
probe "合法 deck view      " -X POST "http://127.0.0.1:$PORT/api/usage" \
  -H 'Content-Type: text/plain' --data-raw '{"e":"deck","m":"view","h":""}'
probe "合法 imgfail+主机名 " -X POST "http://127.0.0.1:$PORT/api/usage" \
  -H 'Content-Type: text/plain' --data-raw '{"e":"imgfail","h":"raw.githubusercontent.com"}'
probe "合法 dirimport ok   " -X POST "http://127.0.0.1:$PORT/api/usage" \
  -H 'Content-Type: text/plain' --data-raw '{"e":"dirimport","m":"ok"}'
probe "未知事件（要 400）  " -X POST "http://127.0.0.1:$PORT/api/usage" \
  -H 'Content-Type: text/plain' --data-raw '{"e":"ssrf","m":"ok"}'
probe "白名单外方式（要 400）" -X POST "http://127.0.0.1:$PORT/api/usage" \
  -H 'Content-Type: text/plain' --data-raw '{"e":"deck","m":"delete-me"}'
probe "非 JSON（要 400）   " -X POST "http://127.0.0.1:$PORT/api/usage" \
  -H 'Content-Type: text/plain' --data-raw 'hello'
# 公开无鉴权端点必须有体积上限：先量体积再解析，否则一个大 body 就能把 CPU 买走
BIG="$WORK/probe-big.txt"
node -e 'require("fs").writeFileSync(process.argv[1], "x".repeat(4096))' "$BIG"
probe "超大 body（要 413）  " -X POST "http://127.0.0.1:$PORT/api/usage" \
  -H 'Content-Type: text/plain' --data-binary "@$BIG"

echo
echo "== 2. 图片代理三档（缩略图档是这次新增的调用路径） =="
SRC="https://raw.githubusercontent.com/AtaraxyEcho/OmniNest/main/imgs/desktop/admin_console_home.png"
ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$SRC")
for W in 200 1600 2000; do
  probe "w=$W" "http://127.0.0.1:$PORT/api/img?w=$W&src=$ENC"
  tr -d '\r' < "$WORK/usage-head.txt" | grep -ai '^location:\|^x-image-source:\|^cache-control:' | sed 's/^/      /'
done
echo "      跟随一跳看真实取回（-L，最多 3 跳）："
for W in 200 1600; do
  code=$(curl -sL --max-redirs 3 -o "$WORK/img-$W.bin" -w '%{http_code} %{content_type} %{size_download}B %{time_total}s' \
    "http://127.0.0.1:$PORT/api/img?w=$W&src=$ENC")
  echo "      w=$W -> $code"
done
echo "      第三方转换服务本身是否可达（只读探针）："
curl -s -o /dev/null -w '      wsrv.nl -> %{http_code} %{time_total}s\n' --max-time 20 \
  "https://wsrv.nl/?url=$ENC&w=200&output=webp"
probe "名单外主机（要 404）" "http://127.0.0.1:$PORT/api/img?w=200&src=https%3A%2F%2Fevil.example.com%2Fa.png"

echo
echo "== 2b. 内置品牌资产必须直出（改名后最容易静默坏图的一条） =="
# not_found_handling=single-page-application 会把缺失路径变成"200 + index.html"，
# 配上 CSP img-src 'self'，浏览器什么都不报，只是图不见了——所以这里断言的是
# **内容类型不是 html**，而不只是 200。
for ASSET in /brand/logo-mark.png /brand/logo-banner.png /brand/favicon.ico /brand/apple-touch-icon.png; do
  LINE=$(curl -s -o "$WORK/asset.bin" -w '%{http_code} %{content_type} %{size_download}B' \
    "http://127.0.0.1:$PORT$ASSET")
  echo "      $ASSET -> $LINE"
  case "$LINE" in
    200\ *text/html*|200\ *application/json*|4*\ *|5*\ *)
      PROBE_FAIL=1
      echo "        !! 没有作为图片直出（多半是被 SPA 兜底或文件缺失）"
      ;;
  esac
done

echo
echo "== 2c. 深链与尾斜杠都要拿到**注入过**的 HTML（漏一条就是「页面照常、头部没有 canonical」） =="
# 判据用 `<!-- seo:origin-tags -->` 这个占位标记：它在构建产物里存在，只有 Worker 处理过才会被换掉。
# 资产层的 SPA 兜底返回的是没换过的那一份，状态码同样是 200 + text/html，所以只看状态码抓不到。
for PATHQ in /admin /admin/ /admin/anycase /project /project/001 /; do
  CODE=$(curl -s -o "$WORK/html.bin" -w '%{http_code}' "http://127.0.0.1:$PORT$PATHQ")
  # grep -c 无匹配时本来就打印 0（只是退出码是 1），别再 `|| echo 0`——那会变成两行"0"，把正常路径误判成失败
  MARKER=$(grep -c 'seo:origin-tags' "$WORK/html.bin" 2>/dev/null)
  TITLED=$(grep -c '<title>[^<]' "$WORK/html.bin" 2>/dev/null)
  printf '      %-16s -> HTTP %s，占位标记 %s 处，非空 <title> %s\n' "$PATHQ" "$CODE" "${MARKER:-0}" "${TITLED:-0}"
  if [ "$CODE" != "200" ] || [ "${MARKER:-0}" != "0" ] || [ "${TITLED:-0}" = "0" ]; then
    PROBE_FAIL=1
    echo "        !! 这条没经过 Worker 注入（run_worker_first 或 Hono 路由少了一种形态）"
  fi
done

echo
echo "== 3. 管理端写侧：相册判据仍是同一份（本地库，绝不碰生产） =="
TOKEN=$(sed -n 's/^ADMIN_SECRET_KEY=//p' .dev.vars | head -1 | tr -d '\r"')
# 口令只走临时头文件（-H @file）与子进程环境，不进 argv：本机其他账号在进程列表里读不到
AUTH_HEADER="$WORK/auth-header"
( umask 077; printf 'Authorization: Bearer %s\n' "$TOKEN" > "$AUTH_HEADER" )
if [ -z "$TOKEN" ]; then
  echo "ADMIN_SECRET_KEY 不在 .dev.vars 里，跳过写侧实测（只确认路由活着）"
  probe "PUT 无鉴权（要 401）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H 'Content-Type: application/json' --data-raw '{"preview_images_json":"[]"}'
else
  BODY="$WORK/admin-body.json"
  # 管理端列表返回的是裸数组（没有 {success,data} 包装），也没有 GET /projects/:id
  admin_list() {
    curl -s "http://127.0.0.1:$PORT/api/admin/projects" -H @"$AUTH_HEADER"
  }
  admin_row() {
    admin_list > "$BODY"
    node -e '
      const rows = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
      const r = Array.isArray(rows) ? rows.find((x) => String(x.id) === "001") : null
      if (!r) { console.error("管理端列表里没有 001"); process.exit(1) }
      process.stdout.write(JSON.stringify(r))
    ' "$BODY"
  }
  ORIG=$(admin_row | node -e '
    let s = ""
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const r = JSON.parse(s)
      // 直接用真实列名存下来，最后原样 PUT 回去
      process.stdout.write(JSON.stringify({
        preview_image_url: r.preview_image_url ?? "",
        preview_images_json: r.preview_images_json ?? "[]",
      }))
    })
  ')
  [ -n "$ORIG" ] || { echo "读 001 失败，跳过写侧实测"; worker_log_tail; exit 1; }
  echo "001 现值：项目图片长度 $(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).preview_image_url.length))' "$ORIG")，相册项数 $(node -e 'process.stdout.write(String(JSON.parse(JSON.parse(process.argv[1]).preview_images_json).length))' "$ORIG")（值不打印）"

  BAD=$(node -e 'process.stdout.write(JSON.stringify(Array.from({length:13},(_,i)=>`https://a.example/${i}.png`)))')
  probe "PUT 13 张（要 400：服务端点名张数，逐行点名在前端）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' \
    --data-raw "{\"preview_images_json\":$BAD}"
  probe "PUT 含坏行（要 400 点名第 2 行）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' \
    --data-raw '{"preview_images_json":"[\"https://a.example/1.png\",\"notaurl\"]"}'
  probe "PUT 项目图片非法（要 400 且说「项目图片」）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' \
    --data-raw '{"preview_image_url":"ftp://a.example/x.png"}'
  probe "PUT 两种拼写冲突（要 400）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' \
    --data-raw '{"previewImages":["https://a.example/1.png"],"preview_images_json":"[\"https://a.example/9.png\"]"}'

  # 用 node 生成合法 JSON（直接在 bash 里拼引号会把双引号原样带进去，那是探针的 bug 不是接口的问题）
  GOOD=$(node -e 'process.stdout.write(JSON.stringify({ preview_images_json: ["https://a.example/1.png","https://a.example/2.png"] }))')
  probe "PUT 合法两行（要 200）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' \
    --data-raw "$GOOD"
  GALLERY_COUNT=$(admin_row | node -e '
    let s = ""
    process.stdin.on("data", (d) => (s += d)).on("end", () =>
      process.stdout.write(String(JSON.parse(JSON.parse(s).preview_images_json ?? "[]").length)),
    )
  ')
  echo "回读确认：写入的相册项数 = ${GALLERY_COUNT}（应为 2）"
  if [ "$GALLERY_COUNT" != "2" ]; then
    PROBE_FAIL=1
    echo "  !! 相册回读项数不是 2"
  fi

  probe "PUT 恢复原值（要 200）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' \
    --data-raw "$ORIG"
  if ! admin_row | node -e '
    let s = ""
    const want = JSON.parse(process.argv[1])
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const r = JSON.parse(s)
      const same =
        (r.preview_image_url ?? "") === want.preview_image_url &&
        JSON.stringify(JSON.parse(r.preview_images_json ?? "[]")) ===
          JSON.stringify(JSON.parse(want.preview_images_json))
      console.log("原值已复原：", same ? "是" : "否（需要手工检查 001 的预览两列）")
      if (!same) process.exitCode = 1
    })
  ' "$ORIG"; then
    PROBE_FAIL=1
    echo "  !! 相册原值未复原"
  fi
fi

echo
echo "== 3c. 新建路径：POST 与 PUT 必须落同一批列（协议 / 四份文档曾被 INSERT 静默丢弃） =="
if [ -n "$TOKEN" ]; then
  TMP_ID="probe-tmp-$$"
  CREATE_BODY=$(node -e '
    const id = process.argv[1]
    process.stdout.write(
      JSON.stringify({
        id,
        name: "Probe Temp",
        status: "DRAFT",
        license: "MIT",
        readme_zh: "# probe readme",
        readme_en: "# probe en",
        compose_dev: "services: {}",
        compose_prod: "services: {}",
      }),
    )
  ' "$TMP_ID")
  probe "POST 新建（要 201）" -X POST "http://127.0.0.1:$PORT/api/admin/projects" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' --data-raw "$CREATE_BODY"
  # 列表不带四份长文档（响应体积），正文只能从单件详情接口回读
  CREATE_CHECK=$(curl -s "http://127.0.0.1:$PORT/api/admin/projects/$TMP_ID" -H @"$AUTH_HEADER" | node -e '
    let s = ""
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const row = JSON.parse(s)
        const ok =
          row.license === "MIT" &&
          ["readme_zh", "readme_en", "compose_dev", "compose_prod"].every(
            (key) => String(row[key] || "").length > 0,
          )
        process.stdout.write(ok ? "ok" : "fields-dropped")
      } catch {
        process.stdout.write("bad-json")
      }
    })
  ')
  echo "  新建后从详情接口回读：$CREATE_CHECK（应为 ok）"
  if [ "$CREATE_CHECK" != "ok" ]; then
    PROBE_FAIL=1
    echo "  !! 新建时手填的协议/文档没有落库"
  fi
  LIST_LEAN=$(admin_list | node -e '
    let s = ""
    const id = process.argv[1]
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const rows = JSON.parse(s)
      const row = rows.find((x) => String(x.id) === id) || {}
      process.stdout.write("readme_zh" in row ? "list-carries-docs" : "ok")
    })
  ' "$TMP_ID")
  echo "  列表不带长文档：$LIST_LEAN（应为 ok）"
  if [ "$LIST_LEAN" != "ok" ]; then
    PROBE_FAIL=1
    echo "  !! 列表仍然带上了文档正文（响应体积会随馆藏放大）"
  fi
  probe "DELETE 收尾（要 200）" -X DELETE "http://127.0.0.1:$PORT/api/admin/projects/$TMP_ID" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json'
fi

echo "== 4. 双语字段（挑战/方案）写读往返：先快照、测完按快照复原 =="
if [ -n "$TOKEN" ]; then
  # 复原按"解析后的双语对"写回（写侧从此只碰 challenge_json / solution_json，
  # 旧单列一个字都不写），所以老标本的可见内容不会因这次探针而变。
  SNAPSHOT=$(admin_list | node -e '
    // 新列有内容 → 原样写回；新列本来就空 → 复原成"空"，让旧列继续兜底（等价于探针之前）
    const fromJson = (jsonRaw) => {
      if (typeof jsonRaw === "string" && jsonRaw.trim()) {
        try {
          const p = JSON.parse(jsonRaw)
          if (p && typeof p === "object") return { en: String(p.en ?? ""), zh: String(p.zh ?? "") }
        } catch {}
      }
      return { en: "", zh: "" }
    }
    const norm = (pair) => ({
      en: String(pair?.en ?? ""),
      zh: String(pair?.zh ?? ""),
    })
    let s = ""
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const rows = JSON.parse(s)
      const row = (Array.isArray(rows) ? rows : [])[0]
      if (!row) process.exit(1)
      process.stdout.write(JSON.stringify({
        id: row.id,
        // restore = 探针后要写回的内容（只碰新列）；expect = 探针前"解析后的可见内容"（含旧列兜底）
        restore: { challenge: fromJson(row.challenge_json), solution: fromJson(row.solution_json) },
        expect: {
          challenge: norm(row.challenge),
          solution: norm(row.solution),
          description: norm(row.description),
        },
      }))
    })
  ')
  TARGET=$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).id))' "$SNAPSHOT")
  echo "  目标标本：SPEC—$TARGET（探针前可见内容 $(node -e '
    const r = JSON.parse(process.argv[1]).expect
    process.stdout.write(String((r.challenge.zh + r.challenge.en + r.solution.zh + r.solution.en).length))
  ' "$SNAPSHOT") 字）"

  # 载荷由 scripts/probe-bilingual-payload.mjs 生成（UTF-8 源文件），不在 bash 里内联中文：
  # Git Bash 会按本地码页改写命令行里的 CJK，内联写法会让探针自己造出乱码再误判接口。
  PAIRFILE="$WORK/probe-pair.json"
  node "$ROOT/scripts/probe-bilingual-payload.mjs" "$PAIRFILE" >/dev/null
  probe "PUT 双语对（要 200）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/$TARGET" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' \
    --data-binary "@$PAIRFILE"
  curl -s -o "$BODY" "http://127.0.0.1:$PORT/api/projects/$TARGET"
  if ! node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    const want = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"))
    const same = JSON.stringify(r.challenge) === JSON.stringify(want.challenge)
      && JSON.stringify(r.solution) === JSON.stringify(want.solution)
      && JSON.stringify(r.description) === JSON.stringify(want.description)
    const onlyEnglish = Boolean(r.description?.en && !r.description?.zh)
    console.log("  公开详情返回双语对象：", same ? "是（en/zh 各一份，中文未乱码）"
      : `否（challenge=${JSON.stringify(r.challenge)} description=${JSON.stringify(r.description)}）`)
    console.log("  只填英文的简介没被同塞两份：",
      onlyEnglish ? "是" : `否（${JSON.stringify(r.description)}）`)
    if (!same || !onlyEnglish) process.exitCode = 1
  ' "$BODY" "$PAIRFILE"; then
    PROBE_FAIL=1
    echo "  !! 双语写读不一致"
  fi

  # 复原体必须**落到文件**再 --data-binary @文件 送出：curl 的**命令行参数**会被 MSYS 按控制台
  # 码页改写，含中文的 JSON 走 `--data-raw "$VAR"` 出去时已成乱码（实测把乱码写进了本地 001 的简介，
  # 已用 repair SQL 修回）。变量/管道里的字节是安全的，只有 argv 不是。
  # 复原写的是"探针前解析后的可见内容"（expect）而不是空对：新语义下显式空对 = 主动清空。
  RESTORE_FILE="$WORK/probe-restore.json"
  node -e '
    const r = JSON.parse(process.argv[1])
    require("fs").writeFileSync(process.argv[2], JSON.stringify({
      challenge: r.expect.challenge,
      solution: r.expect.solution,
      description: r.expect.description,
    }), "utf8")
  ' "$SNAPSHOT" "$RESTORE_FILE"
  probe "PUT 按快照复原（要 200）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/$TARGET" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' \
    --data-binary "@$RESTORE_FILE"
  curl -s -o "$BODY" "http://127.0.0.1:$PORT/api/projects/$TARGET"
  if ! node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    const want = JSON.parse(process.argv[2])
    const same = JSON.stringify(r.challenge) === JSON.stringify(want.expect.challenge)
      && JSON.stringify(r.solution) === JSON.stringify(want.expect.solution)
      && JSON.stringify(r.description) === JSON.stringify(want.expect.description)
    console.log(`  ${want.id} 三栏已复原（按可见内容比对，含只填一种语言的简介）：`, same ? "是"
      : `否（现 description=${JSON.stringify(r.description)} 期望 ${JSON.stringify(want.expect.description)}）`)
    if (!same) process.exitCode = 1
  ' "$BODY" "$SNAPSHOT"; then
    PROBE_FAIL=1
    echo "  !! 双语原值未复原"
  fi

  echo
  echo "== 5. 同步范围 ids 过滤（只跑选中的那一个，不真跑全表——GitHub 配额要留给需要时） =="
  ONE=$TARGET
  probe "同步单个 $ONE（要 200，结果应只有它）" -X POST "http://127.0.0.1:$PORT/api/admin/github-sync" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' \
    --data-raw "{\"ids\":[\"$ONE\"]}"
  if ! node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    const ids = (j.results || []).map((r) => r.id)
    const ok = ids.length === 1 && ids[0] === process.argv[2]
    console.log(`  返回 ${ids.length} 条 [${ids.join(",")}]：`, ok ? "只跑了选中的那个" : "范围不对",
      `（status=${(j.results || [])[0]?.status}，配额/skipped 不影响范围判定）`)
    if (!ok) process.exitCode = 1
  ' "$WORK/usage-body.bin" "$ONE"; then
    PROBE_FAIL=1
    echo "  !! 同步范围不对"
  fi
  # 抓取文档的批次上限来自免费版每次调用 50 个子请求（每行最多 20 个）：必须在**发出任何
  # GitHub 请求之前**就 400，否则调用跑到一半被平台掐断 = 部分落库 + 后面的行没有结果。
  # 载荷写进文件再 --data-binary @文件：命令行里的中文会被 MSYS 按控制台码页改写。
  THREEFILE="$WORK/probe-sync-three.json"
  admin_list > "$BODY"
  THREE_COUNT=$(node -e '
    const rows = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    const ids = (Array.isArray(rows) ? rows : []).slice(0, 3).map((r) => String(r.id))
    require("fs").writeFileSync(process.argv[2], JSON.stringify({ ids, fetchDocs: true }), "utf8")
    process.stdout.write(String(ids.length))
  ' "$BODY" "$THREEFILE")
  if [ "${THREE_COUNT:-0}" -ge 3 ]; then
    probe "抓文档选 3 个（要 400：上限 2，且在任何 GitHub 请求之前）" -X POST \
      "http://127.0.0.1:$PORT/api/admin/github-sync" \
      -H @"$AUTH_HEADER" -H 'Content-Type: application/json' \
      --data-binary "@$THREEFILE"
  else
    echo "  本地馆藏不足 3 个标本，跳过抓文档批次上限实测（当前 $THREE_COUNT 个）"
  fi
  probe "ids 为空数组（要 400，不能退化成全表）" -X POST "http://127.0.0.1:$PORT/api/admin/github-sync" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' --data-raw '{"ids":[]}'
  probe "ids 形态不对（要 400）" -X POST "http://127.0.0.1:$PORT/api/admin/github-sync" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' --data-raw '{"ids":"001"}'
  probe "未知 id（要 200 且返回 0 条）" -X POST "http://127.0.0.1:$PORT/api/admin/github-sync" \
    -H @"$AUTH_HEADER" -H 'Content-Type: application/json' --data-raw '{"ids":["999999"]}'
  UNKNOWN_COUNT=$(node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    process.stdout.write(String((j.results || []).length))
  ' "$WORK/usage-body.bin")
  echo "  未知 id 返回条数：${UNKNOWN_COUNT}（应为 0；参数化 IN 不该报错）"
  if [ "$UNKNOWN_COUNT" != "0" ]; then
    PROBE_FAIL=1
    echo "  !! 未知 id 返回了结果"
  fi
fi

echo
echo "== 6. 访问台账（D1 聚合 / UV 去重 / 爬虫与管理端排除） =="
if [ -n "$TOKEN" ]; then
  if ! PROBE_ADMIN_TOKEN="$TOKEN" node "$ROOT/scripts/probe-visit-ledger.mjs" "$PORT"; then
    VISIT_FAIL=1
  fi
else
  echo "ADMIN_SECRET_KEY 不在 .dev.vars 里，跳过（管理端接口需要鉴权）"
  VISIT_FAIL=1
fi

echo
echo "== dev 日志尾部 =="
worker_log_tail

if [ "$VISIT_FAIL" -ne 0 ] || [ "$PROBE_FAIL" -ne 0 ]; then
  echo "!! 探针未通过（VISIT_FAIL=$VISIT_FAIL，PROBE_FAIL=$PROBE_FAIL，见上方 ✗ / !!）"
  exit 1
fi
echo "全部探针通过 ✓"
