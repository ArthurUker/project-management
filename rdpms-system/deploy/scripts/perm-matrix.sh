#!/usr/bin/env bash
#
# rdpms-perm-matrix.sh — 权限矩阵测试（7 类主体）
#
# 总控裁定落实：
#   #3  角色枚举统一为 SUPER_ADMIN / ADMIN / MANAGER / MEMBER / VIEWER / AUDITOR
#   #19 测试账号仅 local/staging 由 SEED_TEST_ACCOUNTS=true 创建；生产不创建
#   非项目成员访问项目资源 = 404（隐藏资源存在性），不是 403
#   AUDITOR 只持审计/系统日志/合规只读，不默认持全业务详情读取权
#
# 用法（仅 local / staging；生产拒绝执行）：
#   sudo env SMOKE_ENV=staging TEST_PASSWORD='<pwd>' \
#        /usr/local/bin/rdpms-perm-matrix.sh --csv /var/log/rdpms/perm-matrix.csv
#
# 环境变量：
#   TEST_PASSWORD            6 个测试账号的共用密码（必需）
#   PREFIX                   账号前缀，默认 test_
#   PERM_ALLOW_WRITE         是否执行 POST/PUT/DELETE 行（会写测试数据），默认 1
#   SMOKE_FOREIGN_PROJECT_ID 非成员项目 ID（非成员 -> 404 行需要）
#   SMOKE_BUSINESS_FILE_ID   普通业务文件 ID（AUDITOR 下载 -> 403 行需要）
#   SMOKE_DELETE_USER_ID     一次性废弃用户 ID（users.delete 行需要；该行会真实删除用户）
#   SMOKE_TARGET_USER_ID     roles.assign_user 行的目标用户 ID
#   SMOKE_TARGET_ROLE_ID     roles.assign_permissions 行的目标角色 ID
#   SMOKE_INFECTED_FILE_ID   INFECTED 样本文件 ID
#
# 退出码：0 = 零差异且无 BLOCKED；1 = 存在差异或存在 BLOCKED-BY-BE 或账号不可用
#
# 多值期望：期望列支持 "/" 多选，如 200/204（幂等语义）、403/404（隐藏资源存在性）
# BLOCKED-BY-BE：已登录主体全 404 且期望中存在非 404 值 -> 判定端点未实现，
#                不计入 DIFF，但计入退出码 1，绝不以 SKIP/PASS 降级放行。
#
set -Eeuo pipefail

BASE="${BASE:-http://127.0.0.1}"
API="${BASE}/api"
SMOKE_ENV="${SMOKE_ENV:-staging}"
PREFIX="${PREFIX:-test_}"
TEST_PASSWORD="${TEST_PASSWORD:-}"
CSV_OUT="${CSV_OUT:-}"
PERM_ALLOW_WRITE="${PERM_ALLOW_WRITE:-1}"

ROLES=(SUPER_ADMIN ADMIN MANAGER MEMBER VIEWER AUDITOR)

while [ $# -gt 0 ]; do
  case "$1" in
    --csv) CSV_OUT="${2:?--csv 需要路径}"; shift 2 ;;
    *) printf '[perm] 未知参数: %s\n' "$1" >&2; exit 2 ;;
  esac
done

if [ "$SMOKE_ENV" = "production" ]; then
  printf '[perm] FATAL: 生产不创建测试账号，权限矩阵只能在 local/staging 执行\n' >&2
  printf '[perm] 生产请使用 rdpms-smoke.sh --profile read-only 做抽样验证\n' >&2
  exit 1
fi

command -v curl >/dev/null 2>&1 || { echo '[perm] 缺少 curl' >&2; exit 1; }
command -v jq   >/dev/null 2>&1 || { echo '[perm] 缺少 jq'   >&2; exit 1; }
[ -n "$TEST_PASSWORD" ] || { echo '[perm] 缺少 TEST_PASSWORD' >&2; exit 1; }

# 平行数组替代关联数组（bash 3.2 兼容；TOKENS[i] 对应 ROLES[i]）
TOKENS=()
DIFF=0; TOTAL=0; SKIP_ROWS=0
MISSING=(); UNCOVERED=(); BLOCKED_ROWS=()

# 期望值支持 "/" 分隔多选（如 200/204、403/404），命中任一即视为符合
matches() {
  local want="$1" got="$2" alt oldifs="${IFS:- }"
  IFS='/'
  set -f
  for alt in $want; do
    if [ "$alt" = "$got" ]; then set +f; IFS="$oldifs"; return 0; fi
  done
  set +f
  IFS="$oldifs"
  return 1
}

login() {
  local u="$1"
  local code
  code=$(curl -s -o /tmp/rdpms-perm.body -w '%{http_code}' -X POST "${API}/auth/login" \
    -H 'Content-Type: application/json' \
    -d "$(printf '{"username":"%s","password":"%s"}' "$u" "$TEST_PASSWORD")")
  [ "$code" = "200" ] || return 1
  jq -r '.accessToken // .data.accessToken' /tmp/rdpms-perm.body 2>/dev/null || true
}

printf '=== RDPMS 权限矩阵 | env=%s base=%s 主体=匿名+6角色 ===\n\n' "$SMOKE_ENV" "$BASE"

printf -- '-- 登录测试账号 --\n'
for r in "${ROLES[@]}"; do
  u="${PREFIX}$(echo "$r" | tr '[:upper:]' '[:lower:]')"
  if t="$(login "$u")" && [ -n "$t" ]; then
    TOKENS+=("$t"); printf '  [OK]   %s (%s)\n' "$r" "$u"
  else
    MISSING+=("$r"); TOKENS+=(""); printf '  [FAIL] %s (%s) 登录失败 -- 请确认 SEED_TEST_ACCOUNTS=true\n' "$r" "$u"
  fi
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  printf '\n[perm] FATAL: 以下角色账号不可用: %s\n' "${MISSING[*]}"
  printf '[perm] 处理：在 local/staging 设置 SEED_TEST_ACCOUNTS=true 后重新 seed\n'
  exit 1
fi

if [ "$PERM_ALLOW_WRITE" = "1" ]; then
  printf '  [WARN] PERM_ALLOW_WRITE=1：POST/PUT/DELETE 行会产生测试数据，需纳入清理\n'
else
  printf '  [INFO] PERM_ALLOW_WRITE=0：写操作行将 SKIP\n'
fi

# ────────────────────────────────────────────────────────────
# 用例表格式：
#   METHOD|PATH|匿名|SUPER_ADMIN|ADMIN|MANAGER|MEMBER|VIEWER|AUDITOR
# 条件行（前置标记，缺变量则整行 SKIP）：
#   REQ:SMOKE_FOREIGN_PROJECT_ID|GET|/api/projects/${SMOKE_FOREIGN_PROJECT_ID}|...
# PATH 中可使用 ${ENV_VAR}，会被展开（变量由运维注入，非外部输入）
#
# 标注 [BE?] 的行端点尚未冻结，需 BE 契约确定后复核
# ────────────────────────────────────────────────────────────
CASES=$(cat <<'EOF'
# ── 基础与健康检查 ──
GET|/api/health|200|200|200|200|200|200|200
GET|/api/ready|200|200|200|200|200|200|200
GET|/api/auth/me|401|200|200|200|200|200|200
# /api/dict：登录即可（无 dict.read 权限点）
GET|/api/dict|401|200|200|200|200|200|200
# AUDITOR 不持 projects.view（403）；其余登录角色按成员过滤（MANAGER/MEMBER/VIEWER 无成员项目时 200/404）
GET|/api/projects|401|200|200/404|200/404|200/404|200/404|403
# ── 业务读写（写行为按权限先拦 403，再按请求体校验 400）──
POST|/api/projects|401|400|400|400|403|403|403
# 资源不存在的 UUID：requirePermission 先于 handler 内 404（标准 RBAC）——
# 无系统权限的角色得 403；有权限者进入 handler 后因项目不存在得 404。
# 「真实存在的项目 + 非成员 → 404」由下方 SMOKE_FOREIGN_PROJECT_ID 行覆盖。
PUT|/api/projects/00000000-0000-0000-0000-000000000000|401|404|404|404|403|403|403
# projects.delete 已解冻（批次二 P1_UNFROZEN）：默认仅 SUPER_ADMIN 持有 → 进入 handler 后 404；其余角色 403
DELETE|/api/projects/00000000-0000-0000-0000-000000000000|401|404|403|403|403|403|403
POST|/api/tasks|401|400|400|400|400|403|403
PATCH|/api/tasks/00000000-0000-0000-0000-000000000000/status|401|200/400/404|200/400/404|200/400/404|200/400/404|403|403
POST|/api/files|401|400|400|400|400|403|403
GET|/api/registrations|401|200|200|200|200|200|403
PATCH|/api/registrations/00000000-0000-0000-0000-000000000000/stage|401|200/400/404|200/400/404|200/400/404|403|403|403
GET|/api/primers|401|200|200|200|200|200|403
POST|/api/primers|401|400|400|400|403|403|403
# M-1 v1.0：/api/reagents 聚合路由（P0 唯一读入口；写方法固定 405）
GET|/api/reagents|401|200|200|200|200|200|403
POST|/api/reagents|401|405|405|405|405|405|405
PATCH|/api/reagents/00000000-0000-0000-0000-000000000000|401|405|405|405|405|405|405
PUT|/api/reagents/00000000-0000-0000-0000-000000000000|401|405|405|405|405|405|405
DELETE|/api/reagents/00000000-0000-0000-0000-000000000000|401|405|405|405|405|405|405
# reagents.export：P0 唯一试剂导出出口（MEMBER/VIEWER/AUDITOR 403）
POST|/api/reagents/export|401|200|200|200|403|403|403
# reagent-lots：读 = reagents.view；写 = reagents.create / reagents.update
GET|/api/reagent-lots|401|200|200|200|200|200|403
POST|/api/reagent-lots|401|400|400|400|403|403|403
PATCH|/api/reagent-lots/00000000-0000-0000-0000-000000000000|401|200/400/404|200/400/404|200/400/404|403|403|403
GET|/api/docs/categories|401|200|200|200|200|200|403
# ── 用户与角色管理 ──
# users.view：SA/ADMIN/MANAGER 持有
GET|/api/users|401|200|200|200|403|403|403
POST|/api/users|401|400|400|403|403|403|403
PUT|/api/users/00000000-0000-0000-0000-000000000000|401|400/404|400/404|403|403|403|403
# roles.assign_user：仅 SUPER_ADMIN（PUT /api/users/:id/roles）
REQ:SMOKE_TARGET_USER_ID|PUT|/api/users/${SMOKE_TARGET_USER_ID}/roles|401|200/400|403|403|403|403|403
# roles.assign_permissions：仅 SUPER_ADMIN
REQ:SMOKE_TARGET_ROLE_ID|POST|/api/roles/${SMOKE_TARGET_ROLE_ID}/permissions|401|200/400|403|403|403|403|403
# data.export：仅 SUPER_ADMIN（出口 = /api/backup/export）
GET|/api/backup/export|401|200|403|403|403|403|403
# ── 审计与系统日志 ──
# audit.view：SA + ADMIN + AUDITOR
GET|/api/audit-logs|401|200|200|403|403|403|200
# system.logs.view：SA + AUDITOR（ADMIN 403）
GET|/api/system-logs|401|200|403|403|403|403|200
# audit.export：SA + AUDITOR（ADMIN 403）
POST|/api/audit-logs/export|401|200|403|403|403|403|200
# users.delete：仅 SUPER_ADMIN（200/204/404）
REQ:SMOKE_DELETE_USER_ID|DELETE|/api/users/${SMOKE_DELETE_USER_ID}|401|200/204/404|403|403|403|403|403
# settings.view：SA + ADMIN；settings.update：仅 SA（8 项高危之一）
GET|/api/settings|401|200|200|403|403|403|403
PATCH|/api/settings|401|200/400|403|403|403|403|403
# ── 资源存在性隐藏与文件安全 ──
# 非项目成员访问项目资源 -> 404（不是 403）；SUPER_ADMIN 200（elevated）
REQ:SMOKE_FOREIGN_PROJECT_ID|GET|/api/projects/${SMOKE_FOREIGN_PROJECT_ID}|401|200|404|404|404|404|403/404
# files.download：AUDITOR 不持（403）
# M-1 §6.6：VIEWER 持有 files.download（19 条之一）；§6.7：AUDITOR 不持有 → 仅 AUDITOR 403
REQ:SMOKE_BUSINESS_FILE_ID|GET|/api/files/${SMOKE_BUSINESS_FILE_ID}/download|401|200|200|200|200|200|403
# INFECTED 文件下载 -> 403（所有已登录主体）
REQ:SMOKE_INFECTED_FILE_ID|GET|/api/files/${SMOKE_INFECTED_FILE_ID}/download|401|403|403|403|403|403|403
# ── 批次二解冻的 P1 端点（默认仅 SUPER_ADMIN 持有 → 进入 handler；无权限角色 403）──
DELETE|/api/tasks/00000000-0000-0000-0000-000000000000|401|404|403|403|403|403|403
DELETE|/api/reports/00000000-0000-0000-0000-000000000000|401|404|403|403|403|403|403
DELETE|/api/docs/documents/00000000-0000-0000-0000-000000000000|401|404|403|403|403|403|403
DELETE|/api/primers/00000000-0000-0000-0000-000000000000|401|404|403|403|403|403|403
POST|/api/primers/batch-import|401|400|403|403|403|403|403
DELETE|/api/reagent-materials/00000000-0000-0000-0000-000000000000|401|404|403|403|403|403|403
POST|/api/reagent-materials/bulk-delete|401|400|403|403|403|403|403
POST|/api/project-templates/00000000-0000-0000-0000-000000000000/copy|401|404|403|403|403|403|403
# task_templates.delete 为 P0（SA/ADMIN 持有）：空 ids → 400
POST|/api/task-templates/bulk-delete|401|400|400|403|403|403|403
# users.create（SA/ADMIN 持有）：空列表 → 400
POST|/api/users/batch|401|400|400|403|403|403|403
# ── 批次三：备份恢复 v2（仅 SUPER_ADMIN；只读校验 + 单事务应用，不出整库覆盖口）──
GET|/api/backup/restore/tables|401|200|403|403|403|403|403
POST|/api/backup/restore/preview|401|400|403|403|403|403|403
POST|/api/backup/restore|401|400|403|403|403|403|403
# ── 批次四：离线同步 v2（登录即可读；上行缺 deviceId → 400）──
GET|/api/sync/status|401|200|200|200|200|200|200
GET|/api/sync/init|401|200|200|200|200|200|200
POST|/api/sync/push|401|400|400|400|400|400|400
EOF
)

# ── W11：REQ 变量自动发现（用 SA 令牌查询真实资源，避免用例因环境数据缺失被 SKIP）──
SA_DISCOVER_TOKEN=""
discover_token() {
  if [ -z "$SA_DISCOVER_TOKEN" ]; then
    SA_DISCOVER_TOKEN="$(login "${PREFIX}super_admin" 2>/dev/null || true)"
    if [ -z "$SA_DISCOVER_TOKEN" ]; then
      SA_DISCOVER_TOKEN="$(login "${PREFIX}superadmin" 2>/dev/null || true)"
    fi
  fi
  printf '%s' "$SA_DISCOVER_TOKEN"
}

auto_discover() {
  local var="$1" tok out
  case "$var" in
    SMOKE_BUSINESS_FILE_ID)
      tok="$(discover_token)"; [ -z "$tok" ] && return 0
      # 找一条非 INFECTED 的文件记录
      out="$(curl -s -H "Authorization: Bearer ${tok}" "${BASE}/api/files?pageSize=50" \
        | jq -r '(.items // .list // .) | if type=="array" then . else [] end
                 | map(select(.scanStatus != "INFECTED")) | .[0].id // empty' 2>/dev/null || true)"
      printf '%s' "$out" ;;
    SMOKE_INFECTED_FILE_ID)
      # 仅发现真实 INFECTED 记录 —— 不伪造：上传接口无标记 INFECTED 的能力，
      # 伪造会产生 SKIPPED 状态导致误报。缺数据时构造方式见脚本 SKIP 提示。
      tok="$(discover_token)"; [ -z "$tok" ] && return 0
      out="$(curl -s -H "Authorization: Bearer ${tok}" "${BASE}/api/files?pageSize=50" \
        | jq -r '(.items // .list // .) | if type=="array" then . else [] end
                 | map(select(.scanStatus == "INFECTED")) | .[0].id // empty' 2>/dev/null || true)"
      printf '%s' "$out" ;;
    SMOKE_FOREIGN_PROJECT_ID)
      tok="$(discover_token)"; [ -z "$tok" ] && return 0
      # 找一个 SA 非成员的项目（用 test_auditor 账号验证其不可见）
      out="$(curl -s -H "Authorization: Bearer ${tok}" "${BASE}/api/projects?pageSize=50" \
        | jq -r '(.list // .items // .) | if type=="array" then . else [] end | .[0].id // empty' 2>/dev/null || true)"
      printf '%s' "$out" ;;
    SMOKE_TARGET_USER_ID|SMOKE_DELETE_USER_ID)
      # ⚠️ 这两个用例会「改角色」或「删账号」，绝不能复用六个 test_* 角色账号，
      #    否则会污染后续以这些账号发起的断言（W11 实测：误删 test_auditor 致其 401）。
      #    策略：复用既有哑元账号；没有则新建一个专用哑元账号。
      tok="$(discover_token)"; [ -z "$tok" ] && return 0
      out="$(curl -s -H "Authorization: Bearer ${tok}" "${BASE}/api/users?pageSize=50&keyword=w11-dummy" \
        | jq -r '(.list // .items // .) | if type=="array" then . else [] end | .[0].id // empty' 2>/dev/null || true)"
      if [ -z "$out" ]; then
        local created dummy_user dummy_pass
        dummy_user="w11-dummy-$(date +%s)"
        dummy_pass="W11-Dummy-Create-2026!x"
        created="$(curl -s -H "Authorization: Bearer ${tok}" -H 'Content-Type: application/json' \
          -X POST "${BASE}/api/users" \
          -d "{\"username\":\"${dummy_user}\",\"password\":\"${dummy_pass}\",\"displayName\":\"W11 dummy\"}" 2>/dev/null || true)"
        out="$(printf '%s' "$created" | jq -r '.id // empty' 2>/dev/null || true)"
        if [ -n "$out" ]; then
          printf '\n  [AUTO] 已创建专用哑元账号 %s（避免污染六个角色账号）' "$dummy_user" >&2
        fi
      fi
      printf '%s' "$out" ;;
    SMOKE_TARGET_ROLE_ID)
      tok="$(discover_token)"; [ -z "$tok" ] && return 0
      out="$(curl -s -H "Authorization: Bearer ${tok}" "${BASE}/api/roles" \
        | jq -r '(.items // .list // .) | if type=="array" then . else [] end
                 | map(select(.code == "MANAGER")) | .[0].id // empty' 2>/dev/null || true)"
      printf '%s' "$out" ;;
    *) return 0 ;;
  esac
  return 0
}

OUT_FILE="${CSV_OUT:-/var/log/rdpms/perm-matrix-$(date +%F-%H%M).csv}"
mkdir -p "$(dirname "$OUT_FILE")"
printf 'case,anonymous,SUPER_ADMIN,ADMIN,MANAGER,MEMBER,VIEWER,AUDITOR,status\n' > "$OUT_FILE"

printf -- '\n-- 执行矩阵 --\n'
# 读取 10 段：普通行 9 段（c10 空）；REQ 行 10 段（c1=REQ:VAR）
while IFS='|' read -r c1 c2 c3 c4 c5 c6 c7 c8 c9 c10; do
  # 处理注释与空行
  case "${c1:-}" in ''|\#*) continue ;; esac

  if [[ "$c1" == REQ:* ]]; then
    # 条件行：缺变量先尝试自动发现（W11），仍无则整行 SKIP
    req_var="${c1#REQ:}"
    req_val="${!req_var:-}"
    if [ -z "$req_val" ]; then
      req_val="$(auto_discover "$req_var")"
      if [ -n "$req_val" ]; then
        export "$req_var=$req_val"
        printf '  [AUTO] %s <- %s（自动发现）\n' "$req_var" "$req_val"
      fi
    fi
    if [ -z "$req_val" ]; then
      SKIP_ROWS=$((SKIP_ROWS + 1))
      UNCOVERED+=("${c2} ${c3}（缺 ${req_var}）")
      printf '  [SKIP] %s %s -- 缺少 %s' "$c2" "$c3" "$req_var"
      case "$req_var" in
        SMOKE_INFECTED_FILE_ID|SMOKE_BUSINESS_FILE_ID)
          printf '（构造方式：cd backend && node scripts/seed-test-files.mjs）' ;;
      esac
      printf '\n'
      continue
    fi
    method="$c2"; path="$c3"
    e_anon="$c4"; e_sa="$c5"; e_admin="$c6"
    e_manager="$c7"; e_member="$c8"; e_viewer="$c9"; e_auditor="$c10"
  else
    method="$c1"; path="$c2"
    e_anon="$c3"; e_sa="$c4"; e_admin="$c5"
    e_manager="$c6"; e_member="$c7"; e_viewer="$c8"; e_auditor="$c9"
  fi

  # 写操作行受 PERM_ALLOW_WRITE 控制
  case "$method" in
    POST|PUT|PATCH|DELETE)
      if [ "$PERM_ALLOW_WRITE" != "1" ]; then
        SKIP_ROWS=$((SKIP_ROWS + 1))
        UNCOVERED+=("${method} ${path}（PERM_ALLOW_WRITE=0）")
        printf '  [SKIP] %s %s -- PERM_ALLOW_WRITE=0\n' "$method" "$path"
        continue
      fi ;;
  esac

  # 展开 PATH 中的环境变量（变量由运维注入）
  path="$(eval "printf '%s' \"${path}\"")"
  label="${method} ${path}"

  actuals=()
  actuals+=("$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "${BASE}${path}")")
  for i in "${!ROLES[@]}"; do
    actuals+=("$(curl -s -o /dev/null -w '%{http_code}' -X "$method" \
      -H "Authorization: Bearer ${TOKENS[$i]}" "${BASE}${path}")")
  done

  expected=("$e_anon" "$e_sa" "$e_admin" "$e_manager" "$e_member" "$e_viewer" "$e_auditor")
  row_status="OK"

  # 已登录主体（索引 1..6）全部 404，且期望中至少有一个不是 404
  #   -> P0 契约端点未实现，标记 BLOCKED-BY-BE（不得降级为通过）
  got_all404=1; idx=0
  for a in "${actuals[@]}"; do
    if [ "$idx" -gt 0 ] && [ "$a" != "404" ]; then got_all404=0; fi
    idx=$((idx + 1))
  done
  want_all404=1
  for e in "$e_sa" "$e_admin" "$e_manager" "$e_member" "$e_viewer" "$e_auditor"; do
    [ "$e" != "404" ] && want_all404=0
  done

  if [ "$got_all404" -eq 1 ] && [ "$want_all404" -eq 0 ]; then
    BLOCKED_ROWS+=("$label")
    printf '%-72s %s (已登录主体全 404：端点未实现，需 BE 交付后重跑)\n' \
      "$label" "BLOCKED-BY-BE"
    printf '%s,%s,%s\n' "$label" "${expected[*]// /,}" "${actuals[*]// /,}" >> "$OUT_FILE"
    continue
  fi

  for i in "${!expected[@]}"; do
    TOTAL=$((TOTAL + 1))
    if ! matches "${expected[$i]}" "${actuals[$i]}"; then
      row_status="DIFF"; DIFF=$((DIFF + 1))
    fi
  done

  printf '%-72s %s (expect %s | actual %s)\n' "$label" "$row_status" \
    "${expected[*]}" "${actuals[*]}"
  printf '%s,%s,%s\n' "$label" "${expected[*]// /,}" "${actuals[*]// /,}" >> "$OUT_FILE"
done <<< "$CASES"

printf -- '\n=== 结果: 断言 %s 项，差异 %s 项，跳过行 %s，BLOCKED-BY-BE %s 行 ===\n' \
  "$TOTAL" "$DIFF" "$SKIP_ROWS" "${#BLOCKED_ROWS[@]}"
printf '明细: %s\n' "$OUT_FILE"

if [ "${#UNCOVERED[@]}" -gt 0 ]; then
  printf '未覆盖项（须抄录进验收报告，不得视为已覆盖）：\n'
  printf '  - %s\n' "${UNCOVERED[@]}"
fi

if [ "${#BLOCKED_ROWS[@]}" -gt 0 ]; then
  printf 'BLOCKED-BY-BE（P0 契约端点未实现，需 BE 交付后重跑，不得降级为通过）：\n'
  printf '  - %s\n' "${BLOCKED_ROWS[@]}"
fi

if [ "$DIFF" -gt 0 ]; then
  printf '[perm] 存在差异，需逐条确认是“期望基线过时”还是“后端权限实现缺陷”\n'
fi

if [ "$DIFF" -gt 0 ] || [ "${#BLOCKED_ROWS[@]}" -gt 0 ]; then
  exit 1
fi
printf 'perm-matrix 通过\n'
