# 服务器 ↔ GitHub 代码差异深度分析（2026-10-06）

> 目的：仅做状态盘点与风险评估，**未拉取、未部署、未改生产**。

## 1. 三方基准

| 对象 | 位置 | commit | 说明 |
|---|---|---|---|
| 生产运行 | `/opt/rdpms/current` → `releases/20260929-1020` | `138cf2d` | `.deploy-meta` 一致；树哈希逐目录核对一致 |
| 本地开发工作区 | `/mnt/datadisk0/rdpms/work/rdpms-port` | `138cf2d`（分支 `main`） | 工作区 clean，无未提交改动；仅 1 个旧 stash `ui-glass-restyle-temp` |
| GitHub 远端 | `origin/main` | `63d243b` | **领先 3 个提交，可快进**（`rev-list --left-right --count` = 0 / 3） |

树哈希核对（`138cf2d` 与生产 release 完全一致）：

```
rdpms-system/backend/src        9aabc931
rdpms-system/backend/prisma     a3961ac3
rdpms-system/frontend/src       de44a845
```

## 2. 待更新的 3 个提交

| commit | 日期 | 主题 | 规模 |
|---|---|---|---|
| `4c90b15` | 10-06 | fix(rdpms): integrate audited remediation and regression coverage | **112 文件 +11330 / -3464（代码主体）** |
| `aaa2a30` | 10-06 | docs: 审计计划与整改交付记录 | 148 文件（docs/audits） |
| `63d243b` | 10-06 | docs: 视觉证据发布 + 本地去重归档索引 | 32 文件 + 27 张 PNG |

`138cf2d..origin/main` 总差异：**3032 文件，+1,380,024 / -3,464**

按目录分布：

```
 1350101  +       0   2766  docs/remediation      ← 证据/日志，非运行时
   17585  +       0    148  docs/audits
    8948  +    1614     82  rdpms-system/backend  ← 运行时
    1759  +     957     19  rdpms-system/frontend ← 运行时
     963  +       0      5  docs/publication
     623  +     893     11  rdpms-system/deploy   ← 发布体系
      45  +       0      1  .gitignore
```

- `package.json` / `package-lock.json` **均未变更** → 无新增 npm 依赖。
- `dist/` / `node_modules/` **不入库** → 新代码必须现场构建。

## 3. 这次更新的性质

不是常规功能开发，而是 **2026-09-30 审计 → RP00–RP19 整改包的集中落地提交**（另一个执行体 Codex/Luna 完成，郭仁康以"研发副总监"身份批准）。

### 3.1 数据库：6 个新迁移（生产库当前停在 `20260928120000_file_access_scope`）

| 迁移 | 内容 | 性质 |
|---|---|---|
| `20261005_sync_receipt_v1_scope` | `sync_mutations` 加 4 列（receipt_version/resource_scope/payload_hash/expires_at） | 纯加列 |
| `20261006_milestone_delete_permission` | 插入权限 `milestones.delete`（high_risk，`ON CONFLICT DO NOTHING`，未授予任何角色） | 加行 |
| `20261006_user_security_version` | `users.security_version` + 非负 CHECK | 加列 |
| `20261006_restore_operation_gate` | 新建 `data_recovery_state`；**给几乎所有业务表（含 audit_logs）加 BEFORE 语句级触发器** `rdpms_restore_write_gate()` | **护栏，影响所有写** |
| `20261007_dataset_epoch_fences` | 重建 gate 函数（增加 epoch 校验 `DATASET_EPOCH_CHANGED`）；给 `sync_devices`/`refresh_tokens`/`mutation_receipts` 加 `dataset_epoch UUID NOT NULL DEFAULT rdpms_current_dataset_epoch()` | **加列+表重写** |
| `20261008_sync_commit_journal` | 新建 `sync_publication_state`/`sync_source_revisions`/`sync_change_events`；对 projects/phases/tasks/milestones/monthly_progress/reports/project_members 加 **AFTER 行级触发器**写 journal；`SYNC_EVENT_IMMUTABLE`；禁 TRUNCATE | **新增写放大** |

数据量评估（生产库，行数极小）：

```
audit_logs 779 | refresh_tokens 680 | task_template_steps 424 | role_permissions 289
enum_meta 256 | template_tasks 149 | permissions 98 | file_objects 16
```

→ 表重写（函数默认值不走 PG 快速加列）与触发器创建的代价都很低。

### 3.2 后端（82 文件）

- 恢复/数据安全：`kernel/backupRestore.js` 重写（+285/-340）、新增 `kernel/restoreSchemaRegistry.js`、`platform/recovery/dataEpoch.ts`
- 同步：新增 `modules/sync/syncMutationCommands.ts`(218)、`syncReadPolicy.ts`、`changePublisher.ts`(87)
- 鉴权：`routes/auth.js`(+179/-71) —— 登录锁定 TTL 语义修正、并发失败计数原子化、refresh 重放检测 `REFRESH_TOKEN_REPLAYED`、`securityVersion` 校验 `LOGIN_STATE_CHANGED`、`ACCOUNT_DISABLED`
- 项目/注册：`projectChildren.ts`(新)、`projectCommands.ts`(新 126)、`registrationAccess.ts`(新)、`routes/projects.js` 重写
- 文件：`fileReadService.ts`(新)、感染文件读保护（含审计拒绝）
- 配置：**新增 `platform/config/configSchema.ts` + `configCli.ts` + `configExec.ts`**
- 其他：`rbac.js`、`users.js`(+44/-135)、`roles.js`、`files.js`、`reports.js`、`db/client.js`

### 3.3 前端（19 文件）

- 离线引擎按用户分片：`offline/idb.ts`(+299/-171) —— **IndexedDB `DB_VERSION 2 → 4`**，旧库数据转 `legacyQuarantine`（原始保留），新增 `ownerMeta`/`OWNED.*` store
- `offline/engine.ts`(+448/-306)、`pendingDraft.ts`、`deadLetter.ts`、新增 `RecoveryPanel.tsx`
- 鉴权代际化：`auth/tokenStore.ts`(+146/-53)、`api/http.ts`(+81/-44)、`AuthProvider.tsx`(+55/-92) —— loginGeneration/tokenRevision、refresh 单飞按代际分桶、`REFRESH_OUTCOME_UNKNOWN`
- 同步：`api/endpoints/sync.ts`（pullProtocol=2 / paginationVersion=1）
- `SyncConflictDialog.tsx`(-209 大幅删减)、`EditProjectModal.tsx`、`shared/projectEditCommand.ts`(新)、`pages/Tasks.tsx`

### 3.4 部署体系（**被重写**）

| 脚本 | 变化 |
|---|---|
| `deploy.sh` | **182 行 → 16 行**：只剩 `--prepare`（转 `candidate-gate.py`）与 `--apply`（转 `deploy-control.py`）；原 10 步（取码/npm ci/migrate/构建/切流/smoke）**全部移除** |
| `preflight.sh` | **555 行 → 17 行**：只剩 `--host`（检查命令存在）与 `--candidate`（检查 dist 存在 + 跑 configCli） |
| `rdpms-start.sh` | 新：强制 `dist/index.js` + `$CURRENT_ROOT/.rdpms-release-manifest.json` + `deploy-control.py --verify-current` + `configCli.js --compare-manifest`；**删除 src 回退**（注释："Legacy src fallback can activate known unsafe code and is intentionally unavailable"） |
| 新增 Python | `deploy-control.py`(128)、`candidate-gate.py`(57)、`backup-pair.py`(134)、`drill/release-gates.py`(137)、`drill/paired-restore-check.py`(60)、`drill/backup-filesystem-check.py`(48) |
| `backup-pg.sh` / `rdpms-env` | 修改 |

## 4. 风险清单

### P0 — 会导致服务起不来

1. **新 `rdpms-start.sh` 的三项硬前置**：当前生产 release **没有 `.rdpms-release-manifest.json`**（已确认不存在）。
   → 只要「换装新脚本」与「切到带 manifest 的新 release」不同时完成，服务**必然启动失败**，且新版**没有 src 回退兜底**。
2. **发布流程不再支持一键上线**：`deploy.sh --apply` 要求 contract JSON 满足
   `releaseDecision == 'APPROVED_TARGET_CHANGE'`、`targetApprovalRef` 非空、
   `targetGates` 中 **S05-OI-01 / S05-OI-02 / S05-OI-04 / S05-OI-05 全部 PASS**，
   且必须提供 10 个**绝对路径 hook 可执行文件**：`stopWrites, stopService, backup, migrate, restart, restartPrevious, health, ready, smoke, resumeWrites`。
   → 这些 hook **本机不存在**，contract 也无人签署。

### P1 — 数据与客户端兼容

3. **写护栏触发器**：`data_recovery_state` 一旦缺行或状态非 READY → 所有写操作抛 `RESTORE_GATE_UNAVAILABLE` / `RESTORE_WRITE_BLOCKED`。回滚时若删表会连带删触发器，需成套处理。
4. **IndexedDB v2→v4**：老用户首次打开新版前端会触发升级，未同步的离线草稿进入 `legacyQuarantine`，需 `RecoveryPanel` 人工恢复 → **上线前需告知用户，避免"我的草稿不见了"**。
5. **数据集 epoch 围栏**：旧设备/旧分页游标在新 epoch 下返回 409 `DATASET_EPOCH_CHANGED`。
6. **鉴权语义变化**：refresh 重放检测 + securityVersion → 切换瞬间在线用户会话可能失效，需重新登录（access token 本就只有 15 分钟）。

### P2 — 配置与运维

7. **生产 `.env` 兼容新 `configSchema` 严格校验：已逐项核对，全部通过，无需改动**

   | 项 | 生产值 | 判定 |
   |---|---|---|
   | `NODE_ENV` | production | strict 生效 |
   | `ALLOWED_ORIGINS` vs `CORS_ORIGINS` | 完全相同 | 无 CORS_ALIAS_CONFLICT |
   | `HOST` | 未设（默认 127.0.0.1） | 合法 |
   | `UPLOAD_DIR` | /srv/rdpms/uploads | 绝对路径 ✓ |
   | `ENABLE_BACKUP_EXPORT` | false | ✓ |
   | `TRUST_PROXY_HOPS` | 1 | ✓ |
   | `JWT_SECRET` | 64 字符、不在弱口令黑名单（please-change/admin123/123456/rdpms-jwt-secret） | ✓ |
   | `VITE_AUTH_MODE` | 未设 | 跳过校验 ✓ |

8. **`/usr/local/bin` 现装脚本是旧版**：`rdpms-start`(35 行) / `rdpms-preflight`(555) / `rdpms-backup`(98) / `rdpms-smoke`(457)。换装须 `chown root:rdpms && chmod 750`。
9. **前端 `.env.production`**：旧 deploy.sh 会写 `VITE_AUTH_MODE=cookie`（默认），新流程不再生成 → 候选构建时需明确前端环境变量来源，否则前后端鉴权口径可能不一致。
10. **新同步分页令牌密钥** `SYNC_PAGE_TOKEN_SECRET` 回落 `process.env.JWT_SECRET` → 生产有 JWT_SECRET，**无需新增 env**。

## 5. 整改包自身的门禁状态（决定"能不能正式上线"）

| 来源 | 结论 |
|---|---|
| `docs/remediation/2026-10-01-rdpms/RELEASE_GATES.json` | `executionAuthorized: false`、`candidateStatus: NOT_DEFINED`、`releaseStatus: NOT_EVALUATED` |
| `OPEN_ITEM_GATES.json` | S05-OI-01/02/03/04/05 全部 `status: OPEN`、`validation: NOT_RUN` |
| 各任务 `task-state.json`（2026-10-06 轮） | 绝大多数 `implementation: COMPLETE, validation: PASS`，但**全部** `targetValidation: NOT_RUN`、`release: NOT_EVALUATED`、`independentReview: PENDING` |
| ENV_BLOCKED 项 | `RP11-T03`、`RP12-T01`、`RP18-T03`（candidate/config/rollback 目标环境一致性）、`RP19-T02`（paired restore） |

**结论：代码已落地并通过本机合成验证，但"目标环境验证 + 发布评估 + 独立复核"全部未做——按整改包自己的规则，它现在不具备正式上线资格。**

## 6. 下一轮可选路径

| 方案 | 动作 | 风险 | 适用 |
|---|---|---|---|
| **A. 只同步不部署** | `git -C work/rdpms-port pull --ff-only`；跑 `lint:undefined` / `typecheck:report` / `npm test`（frontend）；必要时在隔离目录做一次 candidate 构建 | 零生产风险 | 先把代码看清、确认能编译 |
| **B. 走新门禁正式上线** | 补 10 个 hook 脚本 + 签署 contract + 关闭 S05-OI-01/02/04/05 + `candidate-gate.py --prepare` 生成 manifest + `deploy-control.py --apply` | 低（合规），但工作量最大 | 要与整改包裁定保持一致 |
| **C. 沿用旧 10 步流程发 main** | 临时取回旧 `deploy.sh`/`preflight.sh`，**保留旧 `rdpms-start.sh`**（有 src 回退），跑通后切流 | 中：绕过整改包门禁；上线后若再换装新 start 脚本仍会因缺 manifest 起不来 | 应急/想尽快上线 |

**建议顺序**：先 A → 在隔离目录验证后端 `npm run build` 能产出 `dist`（新 start 脚本的硬门槛，且整改包多次因 `tsc` 缺失报 ENV_BLOCKED）→ 再决定 B 还是 C。

## 7. 待办清单（下一轮）

- [ ] A：`git pull --ff-only`（快进，无冲突）
- [ ] 后端 `npm run lint:undefined` + `typecheck:report`
- [ ] 隔离目录跑 candidate 构建，确认 `backend/dist/index.js` + `platform/config/configCli.js` 产出
- [ ] 前端 `npm test` + `npm run build`
- [ ] 决定 hook 脚本与 contract 由谁签署（B 路线）
- [ ] 上线前告知用户：可能需重新登录，离线草稿走 RecoveryPanel 恢复
- [ ] 备份：`rdpms-backup.sh predeploy`
