#!/usr/bin/env bash
# 按文件名顺序执行 migrations/ 下尚未应用的 SQL 迁移。
#
# 用法：
#   bash scripts/d1-migrate.sh                        # 本地库（默认 nestspace-prod）
#   bash scripts/d1-migrate.sh remote                 # 远程库（生产）
#   bash scripts/d1-migrate.sh remote --baseline      # 老库基线：把现有迁移全部登记为"已应用"，不执行
#
# 为什么需要记录表：
#   0002 用的是 INSERT OR REPLACE，盲目重跑会把 001–004 号标本重置回种子值、抹掉后台编辑。
#   因此本脚本用 `_migrations` 表登记每个已执行的文件，**只执行未登记的迁移**。
#
# 老库（此前手工逐条迁移、没有记录表）：
#   首次运行会被拒绝并提示使用 --baseline —— 它只登记不执行，避免把种子数据重新写回去。
#   确认库结构已是最新后执行一次即可：bash scripts/d1-migrate.sh remote --baseline
set -u

SCOPE="local"
DB_NAME="nestspace-prod"
BASELINE=0

for arg in "$@"; do
  case "$arg" in
    local | remote) SCOPE="$arg" ;;
    --baseline) BASELINE=1 ;;
    -h | --help)
      sed -n '2,17p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) DB_NAME="$arg" ;;
  esac
done

if ! command -v wrangler > /dev/null 2>&1; then
  echo "找不到 wrangler，请先安装（npm i -g wrangler）" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/migrations"
FRONTEND_DIR="$REPO_ROOT/frontend"
TRACK_TABLE="_migrations"

[ -d "$MIGRATIONS_DIR" ] || { echo "找不到迁移目录: $MIGRATIONS_DIR" >&2; exit 1; }
[ -f "$FRONTEND_DIR/wrangler.toml" ] || {
  echo "找不到 $FRONTEND_DIR/wrangler.toml（wrangler 需在该目录运行）" >&2
  exit 1
}

# 用 frontend/ 下的相对路径调用 wrangler：绝对 MSYS 路径（/d/...）Windows 版 wrangler 读不懂
sql_command() {
  (cd "$FRONTEND_DIR" && wrangler d1 execute "$DB_NAME" --"$SCOPE" --json --command "$1" 2> /dev/null)
}

# 列出某个迁移文件可校验的 DDL 目标，每行 `column|表|列` 或 `table|表名`
# 只认能对着实际结构核对的语句；纯数据迁移（如 0002 种子）没有目标，视为不可校验
migration_targets() {
  grep -ioE "ALTER TABLE [a-zA-Z_]+ ADD COLUMN [a-zA-Z_]+" "$1" |
    awk '{ print "column|" $3 "|" $6 }'
  grep -ioE "CREATE TABLE (IF NOT EXISTS )?[a-zA-Z_]+" "$1" |
    awk '{ print "table|" $NF }'
}

# 把实际存在的列/表读进内存（每个涉及的表一次查询 + 一次表清单查询）
declare -A EXISTING_COLUMNS=()
declare -A EXISTING_TABLES=()

query_column() {
  sql_command "$1" |
    node -e "
let s = '';
process.stdin.on('data', (d) => (s += d)).on('end', () => {
  try {
    const parsed = JSON.parse(s);
    const rows = (Array.isArray(parsed) ? parsed[0]?.results : parsed?.results) || [];
    process.stdout.write(rows.map((row) => row.name).join(' '));
  } catch { process.stdout.write(''); }
});
"
}

load_schema() {
  local tables table file
  tables="$(
    while IFS= read -r file; do
      migration_targets "$file" | awk -F'|' '{ print $2 }'
    done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | sort) | sort -u
  )"
  for table in $tables; do
    EXISTING_COLUMNS["$table"]="$(query_column "SELECT name FROM pragma_table_info('$table');")"
  done
  local tableList name
  tableList="$(query_column "SELECT name FROM sqlite_master WHERE type='table';")"
  for name in $tableList; do
    EXISTING_TABLES["$name"]=1
  done
}

target_exists() {
  local kind="$1" table="$2" column="${3:-}"
  if [ "$kind" = "table" ]; then
    [ -n "${EXISTING_TABLES[$table]:-}" ]
    return
  fi
  case " ${EXISTING_COLUMNS[$table]:-} " in
    *" $column "*) return 0 ;;
    *) return 1 ;;
  esac
}

# 校验一个迁移文件：0 = 结构已就位；1 = 有目标列/表缺失。
# 没有任何可校验 DDL 的文件（如纯种子数据）视为已就位——宁可漏跑也不误重置数据。
migration_structurally_applied() {
  local file="$1" kind table column
  while IFS='|' read -r kind table column; do
    [ -z "$kind" ] && continue
    target_exists "$kind" "$table" "$column" || return 1
  done < <(migration_targets "$file")
  return 0
}

# 从 wrangler --json 输出里取指定列的值（每行一个）
sql_column() {
  node -e "
let s = '';
process.stdin.on('data', (d) => (s += d)).on('end', () => {
  try {
    const parsed = JSON.parse(s);
    const rows = (Array.isArray(parsed) ? parsed[0]?.results : parsed?.results) || [];
    process.stdout.write(rows.map((row) => row['$1'] ?? '').filter(Boolean).join('\n'));
  } catch {
    process.stdout.write('');
  }
});
"
}

echo "数据库: $DB_NAME"
echo "目标:   $SCOPE"
echo "模式:   $([ "$BASELINE" -eq 1 ] && echo '基线登记（只登记不执行）' || echo '增量执行')"
echo

# 1) 确保记录表存在
if ! sql_command "CREATE TABLE IF NOT EXISTS $TRACK_TABLE (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);" | grep -q '"success": *true'; then
  echo "无法创建迁移记录表 $TRACK_TABLE（请检查库名与权限）" >&2
  exit 1
fi

applied="$(sql_column name < <(sql_command "SELECT name FROM $TRACK_TABLE ORDER BY name;"))"

# 2) 老库保护：结构已存在但没有任何记录 → 默认拒绝，避免重跑 0002 覆盖种子数据
if [ "$BASELINE" -eq 0 ] && [ -z "$applied" ] && sql_command "SELECT name FROM sqlite_master WHERE type='table' AND name='projects';" | grep -q '"name": *"projects"'; then
  echo "检测到该库已有 projects 表，但没有任何迁移记录。" >&2
  echo "直接执行会重跑 0002 的 INSERT OR REPLACE，把 001–004 号标本重置回种子值。" >&2
  echo "确认库结构已是最新后，请先登记一次基线：" >&2
  echo "    bash scripts/d1-migrate.sh $SCOPE --baseline" >&2
  exit 1
fi

record() {
  sql_command "INSERT OR REPLACE INTO $TRACK_TABLE (name) VALUES ('$1');" > /dev/null
}

# 输出文件里"目标列尚不存在"的 ADD COLUMN 语句（用于部分应用后的定向补齐）
missing_add_column_statements() {
  local file="$1" stmt table column
  grep -ioE "ALTER TABLE [a-zA-Z_]+ ADD COLUMN [a-zA-Z_]+ [^;]*" "$file" |
    while IFS= read -r stmt; do
      table="$(printf '%s' "$stmt" | awk '{ print $3 }')"
      column="$(printf '%s' "$stmt" | awk '{ print $6 }')"
      target_exists column "$table" "$column" || printf '%s;\n' "$stmt"
    done
}

# 列出缺失的列/表，用于失败时点名
missing_targets() {
  local file="$1" kind table column
  while IFS='|' read -r kind table column; do
    [ -z "$kind" ] && continue
    if [ "$kind" = "table" ]; then
      target_exists table "$table" || printf '%s ' "$table"
    else
      target_exists column "$table" "$column" || printf '%s.%s ' "$table" "$column"
    fi
  done < <(migration_targets "$file")
}

# 执行一个迁移文件：成功或补齐则 0，补不齐则 1（绝不把未生效的迁移登记成已应用）
run_migration() {
  local file="$1" name="$2" output missing stmt
  output="$(cd "$FRONTEND_DIR" && wrangler d1 execute "$DB_NAME" --"$SCOPE" --file="../migrations/$name" 2>&1)"

  if printf '%s' "$output" | grep -q '"success": *true'; then
    record "$name"
    echo "✓ 已执行"
    executed=$((executed + 1))
    return 0
  fi

  if printf '%s' "$output" | grep -qiE 'duplicate column name|already exists'; then
    load_schema
    if migration_structurally_applied "$file"; then
      record "$name"
      echo "· 结构已存在，补记录"
      recorded=$((recorded + 1))
      return 0
    fi
    # 部分应用（例如整文件两条 ADD COLUMN、只缺其中一条时）：
    # 整文件重跑会因已存在的列报错并整体回滚，因此改为逐条补跑缺失语句
    missing="$(missing_add_column_statements "$file")"
    if [ -n "$missing" ]; then
      while IFS= read -r stmt; do
        [ -z "$stmt" ] && continue
        sql_command "$stmt" > /dev/null
      done <<< "$missing"
      load_schema
      if migration_structurally_applied "$file"; then
        record "$name"
        echo "· 部分应用，已补齐缺失列"
        recorded=$((recorded + 1))
        return 0
      fi
    fi
    echo "✗ 失败（缺少：$(missing_targets "$file")）"
    failed=$((failed + 1))
    failed_list="$failed_list$name"
    return 1
  fi

  echo "✗ 失败"
  failed=$((failed + 1))
  failed_list="$failed_list$name"
  printf '\n%s\n' "$output" | grep -vE '^$' | tail -6 | sed 's/^/    /'
  return 1
}

load_schema

executed=0
skipped=0
recorded=0
healed=0
failed=0
failed_list=""

while IFS= read -r file; do
  name="$(basename "$file")"
  isRecorded=0
  printf '%s\n' "$applied" | grep -qx "$name" && isRecorded=1

  # 已登记且结构核对通过 → 真正跳过
  if [ "$isRecorded" -eq 1 ] && migration_structurally_applied "$file"; then
    printf '%-46s· 已记录，跳过\n' "$name"
    skipped=$((skipped + 1))
    continue
  fi

  # 登记了、但结构其实缺失：多半是 --baseline 误登记，重新执行一次
  printf '%-46s' "$name"
  if [ "$isRecorded" -eq 1 ]; then
    printf '! 记录与结构不符，重跑 → '
    healed=$((healed + 1))
  fi

  if [ "$BASELINE" -eq 1 ]; then
    if migration_structurally_applied "$file"; then
      record "$name"
      echo "· 结构已在，登记为已应用"
      recorded=$((recorded + 1))
    else
      echo "· 结构缺失，未登记（正常执行时会真正执行它）"
    fi
    continue
  fi

  run_migration "$file" "$name"
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | sort)

echo
echo "汇总：已执行 $executed，跳过 $skipped，登记 $recorded，纠正误登记后重跑 $healed，失败 $failed"
if [ "$failed" -gt 0 ]; then
  echo "失败文件："
  printf '  - %s\n' $failed_list
  exit 1
fi

echo "全部迁移已就绪。"
