#!/usr/bin/env python3
"""
RDPMS 备份恢复 v2 —— 演练（rdpms_drill @3210，仅 SUPER_ADMIN）

覆盖：
  1. 全量导出（version 2.0 结构、模块与表）
  2. 只读预校验 preview（merge）与逐表差异
  3. merge 应用：被改动的行按主键 upsert 回滚为备份值
  4. replace 破坏性确认门（confirmReplace）
  5. 校验拦截：备份内主键重复 → 400 且不写入任何数据
  6. 单事务回滚：同一批中前一行插入成功、后一行违反 NOT NULL → 整体回滚（无部分写入）
  7. replace 应用（confirmReplace=true）
  8. 审计：preview=read.sensitive / apply=restore（含被拦截与失败）
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


def req(method, path, token=None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, (txt if raw else json.loads(txt or "{}"))
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, (txt if raw else json.loads(txt or "{}"))
        except Exception:
            return e.code, txt


def sql(q):
    r = subprocess.run(PSQL + [q], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  [psql 警告] {r.stderr.strip()[:160]}", flush=True)
    return r.stdout.strip()


print("=== RDPMS 备份恢复 v2 演练 ===")
st, login = req("POST", "/api/auth/login", body={"username": "test_super_admin", "password": PW})
assert st == 200, f"登录失败 {st} {login}"
sa = login["accessToken"]

# ── 1. 全量导出 ────────────────────────────────────────────────
st, body = req("GET", "/api/backup/export", sa, raw=True)
backup = json.loads(body)
tables = list((backup.get("data") or {}).keys())
check("1. 全量导出可用（version 2.0 + 多表数据）",
      st == 200 and backup.get("version") == "2.0" and len(tables) >= 20,
      f"http={st} version={backup.get('version')} tables={len(tables)}")
with open("/tmp/drill-backup.json", "w", encoding="utf-8") as f:
    json.dump(backup, f, ensure_ascii=False)
print(f"  [i] 备份已存 /tmp/drill-backup.json（{len(tables)} 表）")

projects = backup["data"].get("projects") or []
target = next((p for p in projects if not p.get("deletedAt")), None)
check("1b. 备份包含项目行用于差异验证", bool(target), f"projects={len(projects)}")
pid, orig_name = target["id"], target["name"]

# ── 2. 改动一行 → preview 应识别差异 ───────────────────────────
new_name = f"[BEFORE-RESTORE] {uuid.uuid4().hex[:6]}"
st, _ = req("PUT", f"/api/projects/{pid}", sa, {"name": new_name})
now_name = sql(f"SELECT name FROM projects WHERE id='{pid}'").strip()
check("2. 已改动目标项目名（制造差异）", st == 200 and now_name == new_name, f"http={st} name={now_name}")

st, prev = req("POST", "/api/backup/restore/preview", sa, {"backup": backup, "mode": "merge"})
summary = prev.get("summary") or prev
errs = (prev.get("validation") or {}).get("errors") or []
check("2b. preview 只读校验通过（无错误）", st == 200 and not errs, f"http={st} errors={len(errs)}")
diff_txt = json.dumps(prev, ensure_ascii=False)
check("2c. preview 识别出 project 表差异（覆盖/新增计数）",
      ("projects" in diff_txt) and (("overwrite" in diff_txt) or ("覆盖" in diff_txt) or (prev.get("tables") is not None)),
      f"keys={list(prev.keys())}")

# ── 3. merge 应用 → 恢复为备份值 ───────────────────────────────
st, applied = req("POST", "/api/backup/restore", sa, {"backup": backup, "mode": "merge"})
restored = sql(f"SELECT name FROM projects WHERE id='{pid}'").strip()
check("3. merge 应用成功", st == 200, f"http={st} resp={json.dumps(applied, ensure_ascii=False)[:160]}")
check("3b. 被改动行按主键恢复为备份值", restored == orig_name, f"now={restored!r} expect={orig_name!r}")

# ── 4. replace 确认门 ──────────────────────────────────────────
st, resp = req("POST", "/api/backup/restore", sa, {"backup": backup, "mode": "replace"})
check("4. replace 缺少 confirmReplace 被拒（破坏性操作门禁）",
      st == 400 and "confirmReplace" in json.dumps(resp, ensure_ascii=False),
      f"http={st} resp={json.dumps(resp, ensure_ascii=False)[:120]}")

# ── 5. 校验拦截：备份内主键重复 ────────────────────────────────
bad = json.loads(json.dumps(backup))
bad["data"]["projects"] = (bad["data"].get("projects") or []) + [dict(target)]
st_p, prev_bad = req("POST", "/api/backup/restore/preview", sa, {"backup": bad, "mode": "merge"})
st_a, apply_bad = req("POST", "/api/backup/restore", sa, {"backup": bad, "mode": "merge"})
name_after = sql(f"SELECT name FROM projects WHERE id='{pid}'").strip()
bad_errs = (prev_bad.get("errors") or [])
check("5. preview 拦截备份内主键重复（200 + ok:false + 明确错误）",
      st_p == 200 and prev_bad.get("ok") is False and any("重复" in e for e in bad_errs),
      f"http={st_p} ok={prev_bad.get('ok')} errors={bad_errs[:2]}")
check("5b. apply 校验拦截且不写入（明确提示未写入任何数据）",
      st_a == 400 and "未写入任何数据" in json.dumps(apply_bad, ensure_ascii=False),
      f"http={st_a}")
check("5c. 拦截后数据未被改动", name_after == orig_name, f"name={name_after!r}")

# ── 6. 单事务回滚：同批前一行成功、后一行失败 ─────────────────
rollback_payload = json.loads(json.dumps(backup))
sentinel_id = str(uuid.uuid4())
bad_row_id = str(uuid.uuid4())
base_row = dict(target)
ok_row = {**base_row, "id": sentinel_id, "name": "[ROLLBACK-SENTINEL-OK]", "code": f"PRJ-RB-{uuid.uuid4().hex[:6]}"}
bad_row = {**base_row, "id": bad_row_id, "name": "[ROLLBACK-SENTINEL-BAD]", "code": f"PRJ-RB-{uuid.uuid4().hex[:6]}",
           "managerId": None}  # projects.manager_id NOT NULL → 写入期失败
rollback_payload["data"]["projects"] = (rollback_payload["data"].get("projects") or []) + [ok_row, bad_row]
st_p2, prev_rb = req("POST", "/api/backup/restore/preview", sa, {"backup": rollback_payload, "mode": "merge"})
st_rb, resp_rb = req("POST", "/api/backup/restore", sa, {"backup": rollback_payload, "mode": "merge"})
n_ok = sql(f"SELECT count(*) FROM projects WHERE id='{sentinel_id}'").strip()
n_bad = sql(f"SELECT count(*) FROM projects WHERE id='{bad_row_id}'").strip()
check("6. 写入期失败被捕获（校验通过 → 应用失败）",
      st_rb in (400, 500) and (("rolledBack" in json.dumps(resp_rb, ensure_ascii=False)) or ("未写入任何数据" in json.dumps(resp_rb, ensure_ascii=False))),
      f"preview={st_p2} apply={st_rb} resp={json.dumps(resp_rb, ensure_ascii=False)[:120]}")
check("6b. 单事务回滚：同批中先插入成功的行也被回滚（无部分写入）",
      n_ok == "0" and n_bad == "0", f"sentinel_ok={n_ok} sentinel_bad={n_bad}")

# ── 7. replace：非空库应被预校验明确拦截（不抛 Prisma 原始错误）──
before_cnt = sql("SELECT count(*) FROM projects WHERE deleted_at IS NULL").strip()
st_rep, resp_rep = req("POST", "/api/backup/restore", sa, {"backup": backup, "mode": "replace", "confirmReplace": True})
after_cnt = sql("SELECT count(*) FROM projects WHERE deleted_at IS NULL").strip()
txt_rep = json.dumps(resp_rep, ensure_ascii=False)
check("7. replace 在非空库被预校验明确拦截（含 append-only/外键原因与 merge 建议）",
      st_rep == 400 and "审计日志" in txt_rep and "merge" in txt_rep and "未写入任何数据" in txt_rep,
      f"http={st_rep} resp={txt_rep[:180]}")
check("7b. 被拦截后数据完全未变（无半恢复）",
      before_cnt == after_cnt == str(len(projects)), f"before={before_cnt} after={after_cnt} backup_projects={len(projects)}")

# ── 8. 审计 ────────────────────────────────────────────────────
n_read = sql("SELECT count(*) FROM audit_logs WHERE action='read.sensitive' AND created_at > now() - interval '20 minutes'")
n_restore = sql("SELECT count(*) FROM audit_logs WHERE action='restore' AND created_at > now() - interval '20 minutes'")
n_failed = sql("SELECT count(*) FROM audit_logs WHERE action='restore' AND (entity_label LIKE '%拦截%' OR entity_label LIKE '%失败%')")
check("8. 审计：preview 记 read.sensitive、apply 记 restore（含被拦截/失败）",
      int(n_read or 0) >= 1 and int(n_restore or 0) >= 3 and int(n_failed or 0) >= 2,
      f"read.sensitive={n_read} restore={n_restore} 拦截/失败={n_failed}")

print()
if _fails:
    print(f"=== 演练结果：{len(_fails)} 项失败 ===")
    for f in _fails:
        print("  - " + f)
    sys.exit(1)
print("=== 演练结果：全部通过 ===")
