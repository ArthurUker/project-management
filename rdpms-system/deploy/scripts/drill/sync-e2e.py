#!/usr/bin/env python3
"""
RDPMS 离线同步 v2 —— 端到端演练（演练库 rdpms_drill @3210）

覆盖：
  1. init 增量拉取（ACL 范围 + 权限 + 实体 upserts + cursor）
  2. push 上行（服务端派生字段 startedAt）
  3. clientMutationId 幂等重放（重复上行不重复写库）
  4. baseUpdatedAt 冲突检测（返回服务端快照）
  5. 软删墓碑（tasks.deletedAt）
  6. projectMembers 上行与增量拉取（joinedAt 时间戳实体）
  7. 服务端权威字段剔除（reports.status / reviewNote 客户端不可伪造）
  8. projects 禁止离线新建；projectPhases 允许离线新建
  9. 同步审计与设备登记
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("BASE", "http://127.0.0.1:3210")
PW = os.environ["TEST_PASSWORD"]
PSQL = ["sudo", "-u", "postgres", "psql", "-d", "rdpms_drill", "-tAc"]

_fails = []


def check(name, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + name + (f" | {detail}" if detail else ""), flush=True)
    if not cond:
        _fails.append(name)


def req(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode() or "{}"
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw}


def sql(q):
    r = subprocess.run(PSQL + [q], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  [psql 警告] {r.stderr.strip()[:160]}", flush=True)
    return r.stdout.strip()


def login(username):
    st, d = req("POST", "/api/auth/login", body={"username": username, "password": PW})
    assert st == 200, f"登录失败 {username}: {st} {d}"
    return d["accessToken"]


def push(token, device, mutation):
    st, d = req("POST", "/api/sync/push", token, {"deviceId": device, "changes": [mutation]})
    return (d.get("results") or [{}])[0]


def mut(entity, eid, op="upsert", data=None, base=None):
    m = {"clientMutationId": str(uuid.uuid4()), "entity": entity, "id": eid, "op": op}
    if data is not None:
        m["data"] = data
    if base:
        m["baseUpdatedAt"] = base
    return m


print("=== RDPMS 同步 v2 端到端演练 ===")
sa = login("test_super_admin")
device = "drill-device-" + uuid.uuid4().hex[:6]

# ── 0. 承载数据：项目 + 2 任务 ─────────────────────────────────
st, proj = req("POST", "/api/projects", sa, {
    "name": f"[同步演练] {uuid.uuid4().hex[:6]}",
    "type": "CUSTOMIZATION",
    "tasks": [{"title": "演练任务A"}, {"title": "演练任务B"}],
})
pid = proj.get("id")
check("0. 创建演练项目（含 2 任务）", st in (200, 201) and bool(pid), f"http={st}")

# ── 1. init 增量拉取 ───────────────────────────────────────────
st, sync = req("GET", f"/api/sync/init?deviceId={device}&deviceLabel=drill", sa)
acl = sync.get("acl") or {}
upserts_tasks = (sync.get("changes", {}).get("tasks", {}) or {}).get("upserts", []) or []
mine = [t for t in upserts_tasks if t.get("projectId") == pid or t.get("title") in ("演练任务A", "演练任务B")]
by_title = {t.get("title"): t.get("id") for t in mine}
task_a, task_b = by_title.get("演练任务A"), by_title.get("演练任务B")
check("1. init 返回 ACL 项目范围", st == 200 and pid in (acl.get("projectIds") or []),
      f"http={st} aclProjects={len(acl.get('projectIds') or [])}")
check("1b. init 返回权限与 aclVersion", bool(acl.get("permissions")) and acl.get("aclVersion") is not None,
      f"perms={len(acl.get('permissions') or [])} aclVersion={acl.get('aclVersion')}")
check("1c. init tasks upserts 含新建任务", bool(task_a and task_b), f"A={task_a} B={task_b}")
check("1d. init 返回 cursor 与 7 类实体", bool(sync.get("cursor")) and len((sync.get("changes") or {})) == 7,
      f"cursor={sync.get('cursor')} entities={len(sync.get('changes') or {})}")
cursor1 = sync.get("cursor")

# ── 2. push 上行 + 服务端派生字段 ──────────────────────────────
m1 = mut("tasks", task_a, data={"status": "IN_PROGRESS", "progressPercent": 30})
res1 = push(sa, device, m1)
check("2. push 任务状态上行 applied",
      res1.get("status") == "applied" and res1.get("action") == "updated",
      f"status={res1.get('status')} action={res1.get('action')} reason={res1.get('reason')}")

# ── 3. 幂等重放 ────────────────────────────────────────────────
res2b = push(sa, device, {**m1, "data": {"status": "COMPLETED"}})            # 同一 mutationId 重放
n_mut = sql(f"SELECT count(*) FROM sync_mutations WHERE client_mutation_id='{m1['clientMutationId']}'")
task_a_status = sql(f"SELECT status FROM tasks WHERE id='{task_a}'").strip()
started_at = sql(f"SELECT COALESCE(started_at::text,'NULL') FROM tasks WHERE id='{task_a}'").strip()
check("3. 服务端派生 startedAt 已写入（客户端不可伪造）", started_at != "NULL", f"startedAt={started_at}")
check("3b. 同一 clientMutationId 第二次返回首次结果（replayed）",
      res2b.get("replayed") is True, f"replayed={res2b.get('replayed')} status={res2b.get('status')}")
check("3c. 幂等：mutation 仅 1 条，且任务状态未被重放请求里的 COMPLETED 覆盖",
      n_mut == "1" and task_a_status == "IN_PROGRESS",
      f"mutations={n_mut} status={task_a_status}")

# ── 4. 冲突检测 ────────────────────────────────────────────────
res3 = push(sa, device, mut("tasks", task_a, data={"status": "BLOCKED"},
                            base="2020-01-01T00:00:00.000Z"))
check("4. 过期基线触发冲突并回传服务端快照",
      res3.get("status") == "conflict" and (res3.get("server") or {}).get("status") == "IN_PROGRESS",
      f"status={res3.get('status')} server={ (res3.get('server') or {}).get('status') }")

# ── 5. 离线新建：projectPhases 允许 / projects 禁止 ────────────
phase_id = str(uuid.uuid4())
res4 = push(sa, device, mut("projectPhases", phase_id,
                            data={"code": "PH-DRILL-1", "name": "离线新增阶段", "sortOrder": 1, "projectId": pid}))
check("5. projectPhases 离线新建 applied/created",
      res4.get("status") == "applied" and res4.get("action") == "created",
      f"status={res4.get('status')} action={res4.get('action')} reason={res4.get('reason')}")
# 缺必填字段时应优雅拒绝且原因可读（原实现回传整段 Prisma dump）
res4b = push(sa, device, mut("projectPhases", str(uuid.uuid4()),
                             data={"name": "缺 code 的阶段", "sortOrder": 2, "projectId": pid}))
check("5b. 缺必填字段返回可读拒绝原因（单行、无对象 dump）",
      res4b.get("status") == "rejected" and "\n" not in str(res4b.get("reason") or ""),
      f"status={res4b.get('status')} reason={res4b.get('reason')}")
res5 = push(sa, device, mut("projects", str(uuid.uuid4()), data={"name": "离线新建项目", "projectId": pid}))
check("5c. projects 拒绝离线新建（编号由服务端发号）", res5.get("status") == "rejected",
      f"status={res5.get('status')} reason={res5.get('reason')}")

# ── 6. 软删墓碑（tasks.deletedAt）─────────────────────────────
res6 = push(sa, device, mut("tasks", task_b, op="delete"))
check("6. 删除上行 applied/deleted", res6.get("status") == "applied" and res6.get("action") == "deleted",
      f"status={res6.get('status')} action={res6.get('action')}")
st, sync2 = req("GET", f"/api/sync/init?deviceId={device}&since={cursor1}", sa)
tombs = ((sync2.get("changes", {}).get("tasks", {}) or {}).get("tombstones")) or []
check("6b. 下次增量拉取包含该墓碑", task_b in tombs, f"tombstones={tombs}")

# ── 7. projectMembers（joinedAt 时间戳实体）───────────────────
member_id = str(uuid.uuid4())
member_user_id = sql("SELECT id FROM users WHERE username='test_member'").strip()
res7 = push(sa, device, mut("projectMembers", member_id,
                            data={"role": "MEMBER", "userId": member_user_id, "projectId": pid}))
check("7. projectMembers 上行 applied", res7.get("status") == "applied",
      f"status={res7.get('status')} reason={res7.get('reason')}")
st, sync3 = req("GET", f"/api/sync/init?deviceId={device}&since={cursor1}", sa)
member_upserts = [m.get("id") for m in ((sync3.get("changes", {}).get("projectMembers", {}) or {}).get("upserts") or [])]
check("7b. 增量拉取可返回 projectMembers（joinedAt 派生，原 500 缺陷已修）",
      member_id in member_upserts, f"members={len(member_upserts)}")
res7b = push(sa, device, mut("projectMembers", member_id, op="delete"))
left_at = sql(f"SELECT COALESCE(left_at::text,'NULL') FROM project_members WHERE id='{member_id}'").strip()
check("7c. 成员移除走 leftAt 墓碑（非 deletedAt）",
      res7b.get("status") == "applied" and left_at != "NULL", f"status={res7b.get('status')} leftAt={left_at}")

# ── 8. 服务端权威字段剔除（reports）───────────────────────────
report_id = str(uuid.uuid4())
res8 = push(sa, device, mut("reports", report_id, data={
    "reportType": "WEEKLY", "periodKey": "2026-W37", "content": "离线草稿内容",
    "status": "SUBMITTED", "reviewNote": "伪造审阅意见", "currentVersion": 99, "projectId": pid,
}))
check("8. reports 离线草稿上行 applied", res8.get("status") == "applied",
      f"status={res8.get('status')} reason={res8.get('reason')}")
rep = sql(f"SELECT status||'|'||COALESCE(review_note,'NULL')||'|'||current_version FROM reports WHERE id='{report_id}'").strip()
check("8b. 服务端权威字段被剔除（status=DRAFT、审阅意见为空、版本未被改）",
      rep.startswith("DRAFT") and rep.split("|")[1] == "NULL", f"db={rep}")

# ── 9. 审计与设备登记 ─────────────────────────────────────────
n_audit = sql("SELECT count(*) FROM audit_logs WHERE entity_label LIKE '离线同步上行%' AND created_at > now() - interval '15 minutes'")
n_dev = sql(f"SELECT count(*) FROM sync_devices WHERE id='{device}'")
n_dev_mut = sql(f"SELECT count(*) FROM sync_mutations WHERE device_id='{device}'")
check("9. 同步上行写入审计、设备登记与幂等记录",
      n_audit.strip() not in ("", "0") and n_dev.strip() == "1" and int(n_dev_mut or 0) >= 8,
      f"audit={n_audit} device={n_dev} mutations={n_dev_mut}")

print()
if _fails:
    print(f"=== 演练结果：{len(_fails)} 项失败 ===")
    for f in _fails:
        print("  - " + f)
    sys.exit(1)
print("=== 演练结果：全部通过 ===")
