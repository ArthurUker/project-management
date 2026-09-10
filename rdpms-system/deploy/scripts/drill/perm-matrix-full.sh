#!/usr/bin/env bash
# 演练环境：造全 perm-matrix 所需夹具，零跳过复跑（修正：项目创建返回体为顶层对象）
set -Eeuo pipefail
BASE=http://127.0.0.1:3210
API="$BASE/api"
export SMOKE_ENV=staging

PW=$(sudo grep -E '^SEED_TEST_PASSWORD=' /srv/rdpms-staging/.env | cut -d= -f2-)
export TEST_PASSWORD="$PW"

login() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$PW\"}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken",""))'
}

TSA=$(login test_super_admin)
[ -n "$TSA" ] || { echo "登录失败"; exit 1; }

echo "--- 1) 复用/创建演练项目（其余角色非成员）---"
PROJ_ID=$(curl -s -X POST "$API/projects" -H "Authorization: Bearer $TSA" -H 'Content-Type: application/json' \
  -d '{"name":"W11 演练外部项目","positioning":"演练用：验证非成员访问返回 404"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
[ -n "$PROJ_ID" ] || { echo "项目创建失败"; exit 1; }
echo "  project_id=$PROJ_ID"

echo "--- 2) 交叉验证 ---"
echo -n "  test_super_admin(成员/SA) -> "; curl -s -o /dev/null -w '%{http_code}\n' "$API/projects/$PROJ_ID" -H "Authorization: Bearer $TSA"
TM=$(login test_member)
echo -n "  test_member(非成员)       -> "; curl -s -o /dev/null -w '%{http_code}\n' "$API/projects/$PROJ_ID" -H "Authorization: Bearer $TM"

echo "--- 3) 文件夹具 ---"
BIZ=$(sudo -u postgres psql -d rdpms_drill -tAc "SELECT id FROM file_objects WHERE original_name='w11-fixture-clean.txt' LIMIT 1" | tr -d ' ')
INF=$(sudo -u postgres psql -d rdpms_drill -tAc "SELECT id FROM file_objects WHERE original_name='w11-fixture-infected.txt' LIMIT 1" | tr -d ' ')
echo "  business=$BIZ"; echo "  infected=$INF"

echo "--- 4) perm-matrix 零跳过复跑 ---"
sudo env SMOKE_ENV=staging BASE="$BASE" TEST_PASSWORD="$PW" \
  SMOKE_FOREIGN_PROJECT_ID="$PROJ_ID" \
  SMOKE_BUSINESS_FILE_ID="$BIZ" \
  SMOKE_INFECTED_FILE_ID="$INF" \
  /usr/local/bin/rdpms-perm-matrix.sh --csv /var/log/rdpms/perm-matrix-full.csv 2>&1 | tail -16
exit 0
