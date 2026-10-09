#!/usr/bin/env bash
# 一次性把本地 Worker 起在 8898（用默认 .wrangler/state，绝不碰生产），探完
# /api/usage 的接受与拒绝、/api/img 的缩略图档、管理端写路径与双语写读往返，
# 最后把**我自己**起的进程连同子进程收干净（并把探针写过的种子行复原）。
set -u
export LANG=C.UTF-8
# 路径全部相对脚本自身解析，不再写死本机绝对路径（换机器/换用户名都能跑）
ROOT="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"
cd "$ROOT/frontend" || exit 1
# 中间文件统一放仓库根的 .tmp-probe/（已被 .gitignore 的 .tmp-* 覆盖）。
# 注意别用 /tmp：原生 node 读不懂 MSYS 的 /tmp 路径
WORK="$ROOT/.tmp-probe"
mkdir -p "$WORK"

echo "== build（dist 必须是最新的，否则 wrangler 报 no such asset）=="
npm run build >/dev/null 2>&1 || { echo "BUILD FAILED"; exit 1; }

PORT="${PROBE_PORT:-8898}"
LOG="$WORK/wrangler-usage.log"
npx wrangler dev --port "$PORT" --log-level warn > "$LOG" 2>&1 &
cleanup() {
  # Windows 下 wrangler dev 的进程树是 bash→cmd→node→node→workerd 多层，
  # 而且 $! 抓到的外层 PID 常常不是这棵树的根（实测收不干净、workerd 会被 supervisor 重新拉起）。
  # 所以主收路径交给 PowerShell：按**端口**精确匹配这一支
  #   - wrangler 的 node 进程命令行含 `--port <PORT>`
  #   - workerd 的进程命令行含 `<127.0.0.1:PORT>`
  # 再连带它们的子进程一并收，循环三轮吃掉被重新拉起的子进程。只匹配本端口，不动别人的服务。
  powershell.exe -NoProfile -Command "
    for (\$i = 0; \$i -lt 3; \$i++) {
      \$hit = @(Get-CimInstance Win32_Process | Where-Object {
        (\$_.Name -eq 'workerd.exe' -or \$_.CommandLine -match 'wrangler') -and
        (\$_.CommandLine -like \"*--port $PORT*\" -or \$_.CommandLine -like \"*127.0.0.1:$PORT*\")
      })
      \$pids = @(\$hit | ForEach-Object { \$_.ProcessId })
      \$kids = @(Get-CimInstance Win32_Process | Where-Object { \$pids -contains \$_.ParentProcessId })
      \$all = @(\$pids + (\$kids | ForEach-Object { \$_.ProcessId })) | Sort-Object -Unique
      if (\$all.Count -eq 0) { break }
      \$all | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }
      Start-Sleep -Milliseconds 600
    }
  " >/dev/null 2>&1 || true
  sleep 1
  if netstat -ano 2>/dev/null | tr -d '\r' | grep -i LISTENING | grep -q ":$PORT "; then
    echo "!! 警告：端口 $PORT 仍被占用，请手动清理后再跑"
  else
    echo "== dev worker 已停止，端口 $PORT 已释放 =="
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "== 等就绪 =="
for _ in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/projects"; then break; fi
  sleep 1
done

probe() {
  local label="$1"; shift
  local code
  code=$(curl -s -D "$WORK/usage-head.txt" \
    -o "$WORK/usage-body.bin" -w '%{http_code}' "$@")
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
probe "白名单外方式(要400) " -X POST "http://127.0.0.1:$PORT/api/usage" \
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
echo "== 3. 管理端写侧：相册判据仍是同一份（本地库，绝不碰生产） =="
TOKEN=$(sed -n 's/^ADMIN_SECRET_KEY=//p' .dev.vars | head -1 | tr -d '\r"')
if [ -z "$TOKEN" ]; then
  echo "ADMIN_SECRET_KEY 不在 .dev.vars 里，跳过写侧实测（只确认路由活着）"
  probe "PUT 无鉴权（要 401）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H 'Content-Type: application/json' --data-raw '{"preview_images_json":"[]"}'
else
  BODY="$WORK/admin-body.json"
  # 管理端列表返回的是裸数组（没有 {success,data} 包装），也没有 GET /projects/:id
  admin_list() {
    curl -s "http://127.0.0.1:$PORT/api/admin/projects" -H "Authorization: Bearer $TOKEN"
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
  [ -n "$ORIG" ] || { echo "读 001 失败，跳过写侧实测"; exit 1; }
  echo "001 现值：项目图片长度 $(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).preview_image_url.length))' "$ORIG")，相册项数 $(node -e 'process.stdout.write(String(JSON.parse(JSON.parse(process.argv[1]).preview_images_json).length))' "$ORIG")（值不打印）"

  BAD=$(node -e 'process.stdout.write(JSON.stringify(Array.from({length:13},(_,i)=>`https://a.example/${i}.png`)))')
  probe "PUT 13 张（要 400 点名第 13 行）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data-raw "{\"preview_images_json\":$BAD}"
  probe "PUT 含坏行（要 400 点名第 2 行）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data-raw '{"preview_images_json":"[\"https://a.example/1.png\",\"notaurl\"]"}'
  probe "PUT 项目图片非法（要 400 且说「项目图片」）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data-raw '{"preview_image_url":"ftp://a.example/x.png"}'
  probe "PUT 两种拼写冲突（要 400）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data-raw '{"previewImages":["https://a.example/1.png"],"preview_images_json":"[\"https://a.example/9.png\"]"}'

  # 用 node 生成合法 JSON（直接在 bash 里拼引号会把双引号原样带进去，那是探针的 bug 不是接口的问题）
  GOOD=$(node -e 'process.stdout.write(JSON.stringify({ preview_images_json: ["https://a.example/1.png","https://a.example/2.png"] }))')
  probe "PUT 合法两行（要 200）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data-raw "$GOOD"
  echo "回读确认：写入的相册项数 = $(admin_row | node -e '
    let s = ""
    process.stdin.on("data", (d) => (s += d)).on("end", () =>
      process.stdout.write(String(JSON.parse(JSON.parse(s).preview_images_json ?? "[]").length)),
    )
  ')（应为 2）"

  probe "PUT 恢复原值（要 200）" -X PUT "http://127.0.0.1:$PORT/api/admin/projects/001" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data-raw "$ORIG"
  admin_row | node -e '
    let s = ""
    const want = JSON.parse(process.argv[1])
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const r = JSON.parse(s)
      const same =
        (r.preview_image_url ?? "") === want.preview_image_url &&
        JSON.stringify(JSON.parse(r.preview_images_json ?? "[]")) ===
          JSON.stringify(JSON.parse(want.preview_images_json))
      console.log("原值已复原：", same ? "是" : "否（需要手工检查 001 的预览两列）")
    })
  ' "$ORIG"
fi

echo
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
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data-binary "@$PAIRFILE"
  curl -s -o "$BODY" "http://127.0.0.1:$PORT/api/projects/$TARGET"
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    const want = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"))
    const same = JSON.stringify(r.challenge) === JSON.stringify(want.challenge)
      && JSON.stringify(r.solution) === JSON.stringify(want.solution)
      && JSON.stringify(r.description) === JSON.stringify(want.description)
    console.log("  公开详情返回双语对象：", same ? "是（en/zh 各一份，中文未乱码）"
      : `否（challenge=${JSON.stringify(r.challenge)} description=${JSON.stringify(r.description)}）`)
    console.log("  只填英文的简介没被同塞两份：",
      r.description?.en && !r.description?.zh ? "是" : `否（${JSON.stringify(r.description)}）`)
  ' "$BODY" "$PAIRFILE"

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
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data-binary "@$RESTORE_FILE"
  curl -s -o "$BODY" "http://127.0.0.1:$PORT/api/projects/$TARGET"
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    const want = JSON.parse(process.argv[2])
    const same = JSON.stringify(r.challenge) === JSON.stringify(want.expect.challenge)
      && JSON.stringify(r.solution) === JSON.stringify(want.expect.solution)
      && JSON.stringify(r.description) === JSON.stringify(want.expect.description)
    console.log(`  ${want.id} 三栏已复原（按可见内容比对，含只填一种语言的简介）：`, same ? "是"
      : `否（现 description=${JSON.stringify(r.description)} 期望 ${JSON.stringify(want.expect.description)}）`)
  ' "$BODY" "$SNAPSHOT"

  echo
  echo "== 5. 同步范围 ids 过滤（只跑选中的那一个，不真跑全表——GitHub 配额要留给需要时） =="
  ONE=$TARGET
  probe "同步单个 $ONE（要 200，结果应只有它）" -X POST "http://127.0.0.1:$PORT/api/admin/github-sync" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data-raw "{\"ids\":[\"$ONE\"]}"
  node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    const ids = (j.results || []).map((r) => r.id)
    const ok = ids.length === 1 && ids[0] === process.argv[2]
    console.log(`  返回 ${ids.length} 条 [${ids.join(",")}]：`, ok ? "只跑了选中的那个" : "范围不对",
      `（status=${(j.results || [])[0]?.status}，配额/skipped 不影响范围判定）`)
  ' "$WORK/usage-body.bin" "$ONE"
  probe "ids 为空数组（要 400，不能退化成全表）" -X POST "http://127.0.0.1:$PORT/api/admin/github-sync" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-raw '{"ids":[]}'
  probe "ids 形态不对（要 400）" -X POST "http://127.0.0.1:$PORT/api/admin/github-sync" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-raw '{"ids":"001"}'
  probe "未知 id（要 200 且返回 0 条）" -X POST "http://127.0.0.1:$PORT/api/admin/github-sync" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-raw '{"ids":["999999"]}'
  node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    console.log("  未知 id 返回条数：", (j.results || []).length, "（应为 0；参数化 IN 不该报错）")
  ' "$WORK/usage-body.bin"
fi

echo
echo "== dev 日志尾部 =="
tail -6 "$LOG"
