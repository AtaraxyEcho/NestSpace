#!/usr/bin/env bash
# 备份 D1：默认导出**远程**库，落成 backups/<库名>-<scope>-<UTC 时间戳>.sql。
#
#   bash scripts/d1-backup.sh                 # 远程（生产），导出后自动做一次恢复演练
#   bash scripts/d1-backup.sh local           # 本地开发库
#   bash scripts/d1-backup.sh --no-verify     # 只导出，不做恢复演练
#
# 为什么默认带恢复演练：没被恢复过的备份只是"以为有备份"。--verify 会用 Python 内置的
# sqlite3 把刚导出的 SQL **真灌进一个临时文件库**，再比对 projects / site_settings /
# _migrations 的行数——备份能否真正落库，当场就知道。
# （不用 wrangler 的临时库：现在这版 wrangler 拒绝未知库名，只认 wrangler.toml 里的绑定。）
#
# 恢复（真出事时）：
#   bash scripts/d1-backup.sh --no-verify     # 先留一份现状，别让恢复把证据也覆盖了
#   cd frontend && npx wrangler d1 execute <库名> --remote --file=../backups/<文件名>.sql
# 注意：dump 里是 CREATE TABLE，直接灌回**非空库**会撞 "already exists"；恢复前先确认目标库
# 是空的，或按需要删表（这一条不替你做决定）。
set -u
# dump 里是生产库全文，恢复演练的临时 sqlite 同样是——两者都别给同组/其他账号可读
umask 077

SCOPE="remote"
VERIFY=1
DB="nestspace-prod"
for arg in "$@"; do
  case "$arg" in
    local | remote) SCOPE="$arg" ;;
    --verify) VERIFY=1 ;;
    --no-verify) VERIFY=0 ;;
    -h | --help)
      sed -n '2,21p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) DB="$arg" ;;
  esac
done

if ! command -v npx > /dev/null 2>&1; then
  echo "找不到 npx（需要 Node ≥ 22.18）" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"
FRONTEND="$ROOT/frontend"

# 优先用仓库钉住的 wrangler（frontend/node_modules）；还没 install 时回落到 npx
if [ -x "$FRONTEND/node_modules/.bin/wrangler" ]; then
  WRANGLER_BIN="$FRONTEND/node_modules/.bin/wrangler"
else
  WRANGLER_BIN=""
fi
run_wrangler() {
  if [ -n "$WRANGLER_BIN" ]; then "$WRANGLER_BIN" "$@"; else npx wrangler "$@"; fi
}
[ -f "$FRONTEND/wrangler.toml" ] || { echo "找不到 $FRONTEND/wrangler.toml" >&2; exit 1; }

mkdir -p "$ROOT/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="${DB}-${SCOPE}-${STAMP}.sql"
OUT="$ROOT/backups/$NAME"
# wrangler 在 frontend/ 下运行：Windows 版读不懂 MSYS 绝对路径（/d/...），必须给相对路径
OUT_REL="../backups/$NAME"

echo "数据库: $DB（$SCOPE）"
echo "输出:   backups/$NAME"

# 导出日志走文件而不是 `| tail`：管道会把 wrangler 的退出码换成 tail 的，
# 导出失败也会"看起来成功"（只剩后面那两个内容检查兜底）。这里保留真实退出码。
EXPORT_LOG="$ROOT/.tmp-backup.log"
if ! (cd "$FRONTEND" && run_wrangler d1 export "$DB" --"$SCOPE" --skip-confirmation --output="$OUT_REL") > "$EXPORT_LOG" 2>&1; then
  echo "✗ 导出失败：" >&2
  grep -vE '^[[:space:]]*$' "$EXPORT_LOG" | tail -6 | sed 's/^/    /' >&2
  rm -f "$EXPORT_LOG"
  exit 1
fi
grep -vE '^[[:space:]]*$' "$EXPORT_LOG" | tail -3 | sed 's/^/  /'
rm -f "$EXPORT_LOG"
[ -s "$OUT" ] || { echo "✗ 导出文件为空" >&2; exit 1; }
if ! grep -q "CREATE TABLE" "$OUT"; then
  echo "✗ dump 里没有 CREATE TABLE，导出不完整" >&2
  exit 1
fi
SIZE_KB=$(( $(wc -c < "$OUT" | tr -d ' ') / 1024 ))
echo "✓ 已写出（${SIZE_KB}KB）"

count_rows() {
  local db="$1" table="$2" scope="$3"
  (cd "$FRONTEND" && run_wrangler d1 execute "$db" --"$scope" --json \
    --command "SELECT COUNT(*) AS n FROM $table;" 2> /dev/null) |
    node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try {
    const parsed = JSON.parse(s)
    const rows = (Array.isArray(parsed) ? parsed[0]?.results : parsed.results) || []
    process.stdout.write(String(rows[0]?.n ?? ""))
  } catch {
    process.stdout.write("")
  }
})
'
}

if [ "$VERIFY" -eq 1 ]; then
  PYTHON="$(command -v python3 || command -v python || true)"
  if [ -z "$PYTHON" ]; then
    echo "✗ --verify 需要 Python 3（内置 sqlite3）；可以 --no-verify 只导出" >&2
    exit 1
  fi
  echo "恢复演练: 把 dump 灌进临时文件库，再比对行数"
  RESTORED="$("$PYTHON" - "$OUT" <<'PY'
import os
import sqlite3
import sys
import tempfile

dump = sys.argv[1]
sql = open(dump, encoding="utf-8").read()
fd, path = tempfile.mkstemp(suffix=".sqlite")
os.close(fd)
os.unlink(path)
db = sqlite3.connect(path)
try:
    db.executescript(sql)
    for table in ("projects", "site_settings", "_migrations"):
        print(f"{table}={db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]}")
finally:
    db.close()
    try:
        os.unlink(path)
    except OSError:
        pass
PY
)" || { echo "✗ 恢复演练失败：dump 无法导入" >&2; exit 1; }
  FAILED=0
  for TABLE in projects site_settings _migrations; do
    SRC="$(count_rows "$DB" "$TABLE" "$SCOPE")"
    GOT="$(printf '%s\n' "$RESTORED" | sed -n "s/^$TABLE=//p")"
    if [ -z "$SRC" ] || [ -z "$GOT" ]; then
      echo "  ✗ $TABLE: 读不到行数（源=$SRC 恢复=$GOT）"
      FAILED=1
    elif [ "$SRC" != "$GOT" ]; then
      echo "  ✗ $TABLE: 源 $SRC 行，恢复后 $GOT 行"
      FAILED=1
    else
      echo "  ✓ $TABLE: $GOT 行"
    fi
  done
  if [ "$FAILED" -ne 0 ]; then
    echo "✗ 恢复演练未通过：这份 dump 不可用" >&2
    exit 1
  fi
  echo "✓ 恢复演练通过（临时库已删除）"
fi

echo "完成: backups/$NAME"
