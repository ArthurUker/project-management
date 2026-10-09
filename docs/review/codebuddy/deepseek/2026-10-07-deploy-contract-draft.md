# 部署合同草案（63d243b 首次受控上线）— 草案，未签署，未执行

> 依据 `deploy-control.py` 的实际校验逻辑推导。本文件是**草案**：所有 `PASS` 必须来自实际验证记录，不得为了让脚本运行而填写。

## 1. 控制器要求的合同字段

```json
{
  "evidenceKind": "TARGET_OPERATION",
  "releaseDecision": "APPROVED_TARGET_CHANGE",
  "targetApprovalRef": "<审批记录引用，必填非空>",
  "targetGates": {
    "S05-OI-01": "PASS",
    "S05-OI-02": "PASS",
    "S05-OI-04": "PASS",
    "S05-OI-05": "PASS"
  },
  "expectedCurrent": "/opt/rdpms/releases/20260929-1020",
  "candidateBuildId": "58bf3d1c89354533a637c61ff6485788e3bf0780d5e0fc2488b4acc3b94c1bb2",
  "newAppCompatible": true,
  "migrationCompatibility": { "<migration 相对路径>": { "sha256": "...", "newAppCompatible": true, "oldAppCompatible": "<逐项判定>" } },
  "safeRollback": null,
  "hooks": { "<name>": ["<绝对路径执行器>", "<子命令>"] }
}
```

附加硬校验（代码内）：

- `root.stat().st_dev == control.stat().st_dev` → 候选与 `current` 必须在**同一文件系统**。
- `expectedCurrent` 必须等于运行时实测的 `current` 目标，否则 `CURRENT_BASELINE_CHANGED`。
- `candidateBuildId` 必须等于 manifest 的 `buildId`，且 `newAppCompatible is True`，否则 `APP_SCHEMA_COMPATIBILITY_UNKNOWN`。
- `migrationBindings` 中**每一个**迁移都要在 `migrationCompatibility` 中给出 `sha256` 与 manifest 摘要一致且 `newAppCompatible: true`，否则 `MIGRATION_COMPATIBILITY_UNKNOWN`。

## 2. 十项 hook 的返回值契约（关键：退出码 0 不够）

控制器统一要求：`invoke()` 返回值必须是 dict 且 `ok` 为真，否则 `HOOK_FAILED:<name>`。

| hook | 调用参数 | 必须返回的字段 | 失败即中止 |
|---|---|---|---|
| `stopWrites` | 无 | `{"ok": true}` | `HOOK_FAILED:stopWrites` |
| `backup` | 无 | `{"ok": true, "restoreEligible": true, "consistentPointVerified": true, "runId": "<pairId>"}` | `PAIRED_BACKUP_NOT_VERIFIED` |
| `migrate` | 无 | `{"ok": true}` | `HOOK_FAILED:migrate` |
| `restart` | `<buildId>` | `{"ok": true}` | `HOOK_FAILED:restart` |
| `health` | `<buildId>` | `{"ok": true, "build": "<同一 buildId>"}` | `SERVICE_BUILD_OR_READY_MISMATCH` |
| `ready` | `<buildId>` | `{"ok": true, "build": "<同一 buildId>", "ready": true}` | `SERVICE_BUILD_OR_READY_MISMATCH` |
| `smoke` | `<buildId>` | `{"ok": true, "build": "<同一 buildId>"}` | `SMOKE_BUILD_MISMATCH` |
| `resumeWrites` | 无 | `{"ok": true}` | `HOOK_FAILED:resumeWrites` |
| `stopService` | 无（仅失败处置用） | `{"ok": true}` | 计入 `containmentFailure` |
| `restartPrevious` | 无（仅 DDL 前失败且回退目标合规时用） | `{"ok": true}` | 计入 `containmentFailure` |

验收循环 `observe(build)`：**连续 3 轮** `health` + `ready` 都必须返回与 `buildId` 匹配且 `ready === true`，随后 `smoke` 一次且 `build` 匹配。

### 关于"是否需要十个独立脚本"

同意你的判断：**不需要十个不同可执行文件**。控制器只要求 `hooks[name]` 是**非空数组、首元素为绝对路径可执行文件**。可由一个受控执行器（如 `/usr/local/bin/rdpms-deploy-hook`）以不同子命令提供全部十项能力，避免重复实现。建议该执行器：

- 以 root 或具备目标权限的身份运行（控制器注释：operator installed hook owns target privileges）；
- **不打印任何密钥/环境变量值**；
- 每个子命令输出**单行 JSON** 到 stdout（供 `json.loads`），诊断信息走 stderr；
- `backup` 子命令必须真正完成配对（DB + 文件）并验证一致点，再置 `restoreEligible` / `consistentPointVerified`；
- `health` / `ready` / `smoke` 必须实际探测目标服务并回读 buildId，不得硬编码。

## 3. 回退策略：首次升级建议 `safeRollback: null`

控制器逻辑：

```
if stopped:
    stopWrites + stopService
    if schemaMayHaveChanged and rollback:        → SAFE_COMPATIBLE_ROLLBACK
    elif not schemaMayHaveChanged:               → restartPrevious（仅当回退目标恰为 before）
    else:                                        → MAINTENANCE_REQUIRED
    （无 rollback 且已改 schema）                 → MAINTENANCE_REQUIRED
```

即：**已执行 DDL 且没有合格回退目标时，控制器保持维护态，绝不盲切回旧版。**

首次从 `138cf2d` 升级存在两个使旧版不合格为回退目标的因素：

1. 迁移 `20261006_restore_operation_gate` / `20261007` / `20261008` 在库上新增了表、列与触发器；旧应用在这些对象上的行为尚未逐项验证（尤其 `users.security_version` 与 journal 触发器对旧代码写入路径的影响）。
2. `138cf2d` 的 release **没有 `.rdpms-release-manifest.json`**，新版 `rdpms-start.sh` 会拒绝启动它；要让它可启动需改动启动链或补 manifest——这正是"切回旧 symlink 不等于完整回滚"的具体含义。

因此草案建议：

```json
"safeRollback": null
```

并**在操作方案中明确写出**：一旦进入 DDL 之后失败，预期结果是 `MAINTENANCE_REQUIRED` + 服务处于受控停止/维护态，由人工按前滚方式处置，而不是自动回到 `138cf2d`。

若后续取得"旧应用在迁移后库上可正常运行 + 启动链可用"的实际证据，`safeRollback` 才可能填入，且必须同时满足 `securityFloorSafe` 与 `postMigrationCompatible` 为真、且**所有**迁移 `oldAppCompatible` 为真（否则 `UNSAFE_ROLLBACK_TARGET`）。

## 4. 门禁 `PASS` 的证据来源要求

`targetGates` 四项（S05-OI-01 / 02 / 04 / 05）当前在 `OPEN_ITEM_GATES.json` 中为 `OPEN` / `validation: NOT_RUN`。草案要求每项 PASS 附：

- 执行时间、执行环境（目标主机）、使用的命令或脚本；
- 原始输出或证据文件路径；
- 与 RP18-T03（候选/配置/回退目标环境一致性）、RP19（配对备份与恢复）的对应关系。

**不得**以"脚本跑通"或"构建通过"替代。当前已具备的证据仅覆盖：候选构建与配置（`candidate-gate.py` PASS）、后端静态检查与单元/契约测试；**未覆盖**目标环境验收、配对恢复、旧客户端兼容。

## 5. 执行前置（未满足前不执行 `--apply`）

- [ ] 前端 16 个单测失败处置完毕并复跑通过
- [ ] `pullProtocol=2` 首拉初始化缺口确认/修复
- [ ] 十项 hook 执行器实现并逐个空跑验证返回 JSON 符合要求
- [ ] 配对备份 + 恢复可用性证明（RP19 相关）
- [ ] 六项迁移 `oldAppCompatible` / `newAppCompatible` 逐项判定并签署
- [ ] 旧客户端离线草稿升级的**实际 UI 验证**
- [ ] `targetGates` 四项取得目标环境证据
- [ ] 明确维护态处置方案（`safeRollback: null` 的后果已被告知并接受）
- [ ] 上线前告知用户：会因 `SESSION_REVOKED` 需要重新登录
