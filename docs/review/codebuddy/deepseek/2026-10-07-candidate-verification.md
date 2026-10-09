# 候选产物 `63d243b` 验证报告与目标环境差异（2026-10-07）

> 范围：仅准备并验证独立候选产物 + 目标环境差异盘点。**未执行生产迁移、未停服务、未切换 `current`、未替换生产启动脚本、未运行 `--apply`。**

## 1. 候选产物

| 项 | 值 |
|---|---|
| 候选根目录 | `/mnt/datadisk0/rdpms/work/candidates/20261007-63d243b` |
| 固定 commit | `63d243bd5379efa6f14c3c024e6ee2b8006d415b`（detached HEAD） |
| 来源 | 本地 `work/rdpms-port` 克隆后 checkout，**不在现有工作目录 `git pull`** |
| 证据目录 | `/mnt/datadisk0/rdpms/work/candidates/evidence/20261007-prepare-01` |

树哈希与 `origin/main` 逐项一致：

```
rdpms-system/backend/src        efb051be06345299309750a76fd8bc7453c9e616
rdpms-system/backend/prisma     5445ebf32e4a5866920294f316ecf716990edc2d
rdpms-system/frontend/src       607171a39a94ee52c57377db453b13aedd41638d
rdpms-system/deploy/scripts     b8f9dea0460567998b08ed191780d710fc2ee137
```

### 候选目录洁净性

- 无 `dist/`、无 `node_modules/`（clone 时为裸源码）。
- 无真实 `.env`：仅 `.env.example`（`backend`/`frontend` 各一份，示例）。
- 存在 `frontend/public` 与 `backend/config`，二者都会被 `candidate-gate.py` 计入 source bindings。

## 2. 工具链与依赖

| 项 | 值 | 结论 |
|---|---|---|
| node | v20.20.2 | 与生产一致 |
| npm | 10.8.2 | — |
| python3 | 3.10.12 | 满足 `deploy-control.py` / `candidate-gate.py` |
| tsc（frontend） | 5.9.3 | 可用（backend 无自带编译器，按 frontend 提供） |
| `package.json` / `package-lock.json` | 未变更 | 依赖集合与 `138cf2d` 相同 |

### Prisma Client：你的第 3 项提醒已实测成立

沿用旧 `node_modules/.prisma/client` 时，用 `candidate-gate.py` 同款 datamodel 比对：

```
BEFORE generate -> MISMATCH (stale client from 138cf2d)
AFTER  generate -> MATCH
generatedClientSchemaSha256 = e534fa311bce0e38bd8276038674852ac2df15f0b6496efe6432fe4f8219b545
```

**结论：`package-lock` 未变不代表现有 Prisma Client 可用。schema 已变，必须在候选目录重新 `prisma generate`，否则准备阶段即被拒绝。** `prisma validate` 通过。

## 3. 候选门禁结果

```
state  = PREPARED_PRE_DDL
result = PASS
criticalFailures = []
buildId = 58bf3d1c89354533a637c61ff6485788e3bf0780d5e0fc2488b4acc3b94c1bb2
databaseOperations = 0   currentChanges = 0   installOrFetchOperations = 0
sourceBindings 235 文件 | buildBindings 151 文件 | migrationBindings 13 个
```

命令记录（全部 exit 0）：`node-version` / `compiler-version` / `schema-validate` / `backend-build` / `frontend-build` / `compiled-config`。

关键产物：

```
backend/dist/index.js                        存在
backend/dist/platform/config/configCli.js    存在
frontend/dist/index.html                     存在
```

`effectiveConfig`（由生产 `.env` 快照算出，`valid = True`，fingerprint `3d4fca49ff62138a…`）：

```
mode=production  credentials=False  authTransport=BEARER_ACCESS_JSON_REFRESH
origins=['http://111.231.166.161','https://rdpms.digifluidic.com']
exportPolicy=EXISTING_AUDITED_SUPER_ADMIN_NOT_ENV_TOGGLE
proxyPolicy=NO_NEW_PROXY_TRUST_IMPLEMENTED
```

配置快照置于 `/tmp/rdpms-candidate-env-20261007`（600，候选目录之外），sha256 前 16 位 `a4c58e409cf9b71d`。

## 4. 验证结果（按你的提醒纠正了口径）

| 层次 | 命令 | 结果 |
|---|---|---|
| 后端未定义标识符 | `npm run lint:undefined` | ✅ 53 文件无未定义标识符 |
| **后端完整类型检查** | `npm run typecheck`（`tsc --noEmit`） | ✅ 0 错误 |
| 后端单元 | `npm run test:unit` | ✅ 87 / 87 |
| 后端契约 | `npm run test:contract` | ✅ 6 / 6 |
| 前端构建 | `npm run build`（`tsc -b && vite build`，门禁内执行） | ✅ |
| **前端纯逻辑单测** | `npm test` | ❌ **47 / 63，16 失败** |

说明：`typecheck:report` 实际是 `check-undefined.mjs --full`，按你的提醒**不作为类型检查结论**，已改用完整 `npm run typecheck`。

### ❌ 阻塞项：前端单测 16 个失败（新引入）

基线对照：

```
138cf2d（当前生产）: 42 tests, 42 pass, 0 fail
63d243b（候选）    : 63 tests, 47 pass, 16 fail
```

失败全部落在离线持久化与账号隔离：

```
F10-I1/I2/I3/I4/I5   拒绝区持久化与刷新恢复、重复拒绝、账号隔离、登出不清空
A09-I6               同 key 不同内容保留最早 payload
A06                  clearAll 清理真实键名且不清空持久拒绝区
A03-E1/E2/E3/E4      切换账号释放、上行拒绝释放、登出登录交叠、按原 key/payload 重试
A03-I1/I2            不同账号分片键互不覆盖、登出只清理当前主体
A05-P2/P4            缺项目记录本地留存、留存键按主体分片
RP13-T01             中间页落镜像但不提交 cursor，全部页面完成后才提交 checkpoint
```

根因（非环境缺失，`fake-indexeddb` 已安装）：

```
error: 'idb.outboxClear is not a function'
```

`src/offline/idb.ts` 重写后仅导出：

```ts
export const idb = { activateOwner, deactivateOwner, forOwner };
```

而 `tests/unit` 仍按旧的单一主体 API（`idb.outboxClear` 等）调用 → **测试未随 idb 重写同步更新**。

影响判断：这些正是本次整改要保护的核心场景（离线草稿归属、跨账号隔离、拒绝区持久化）。**它们现在既没有"通过"的证据，也没有"失败后已修"的证据——是验证缺口，不是已验证。** 整改包中 RP11/RP13 相关 `validation=PASS` 的口径在本层不成立，需要澄清其 PASS 究竟来自哪一层（集成/浏览器）并补齐本层。

## 5. 目标环境差异

### 5.1 生产库全表规模（只读盘点，43 张表）

关键表（行数 / 总体积）：

| 表 | 行数 | 体积 | 本次是否受影响 |
|---|---|---|---|
| `audit_logs` | 780 | 736 kB | restore gate 触发器 |
| `refresh_tokens` | 681 | 584 kB | **`dataset_epoch` 加列（表重写）** |
| `task_template_steps` | 424 | 312 kB | restore gate |
| `role_permissions` | 289 | 144 kB | restore gate |
| `enum_meta` | 256 | 336 kB | restore gate |
| `users` | **11** | 128 kB | **`security_version` 加列 + CHECK** |
| `sync_devices` | 2 | 80 kB | `dataset_epoch` 加列 |
| `projects` / `tasks` / `project_phases` | 2 / 1 / 1 | 144/144/80 kB | **journal AFTER 行级触发器** |
| `project_members` | 2 | 64 kB | journal 触发器 |
| `milestones` / `monthly_progress` / `reports` | 0 / 0 / 0 | — | journal 触发器 |
| `sync_mutations` | 0 | 40 kB | 加 4 列（可空） |
| `mutation_receipts` | 0 | 40 kB | `dataset_epoch` 加列 |

补充上次结论的不足：上次只看了 `audit_logs` / `refresh_tokens` 两张表就下"迁移代价低"的判断，**依据不充分**。本次全量盘点后可以说：所有表均为 KB 级、最大 780 行，DDL 锁窗口在秒级以内；但**风险不在体量，而在语义**（见 5.2–5.3）。

### 5.2 六项迁移逐项盘点（生产库当前停在 `20260928120000_file_access_scope`）

| 迁移 | DDL 性质 | 锁/重写 | 初始化行为 | 旧应用影响 |
|---|---|---|---|---|
| `20261005_sync_receipt_v1_scope` | `sync_mutations` 加 4 个**可空**列 | 元数据级 | 无 | 无 |
| `20261006_milestone_delete_permission` | 插入权限行（ON CONFLICT DO NOTHING） | 行级 | 不授予任何角色 | 无 |
| `20261006_user_security_version` | `users.security_version NOT NULL DEFAULT 0` + CHECK | `users` 仅 11 行 | 全表填 0 | **见 5.3** |
| `20261006_restore_operation_gate` | 建 `data_recovery_state` + **约 40 张表 BEFORE 语句级触发器** | 逐表短暂 ACCESS EXCLUSIVE（小表，秒级） | 迁移内 `INSERT (1, gen_random_uuid())`，status=READY | 写入需该表存在且 READY；回滚删表须连同触发器成套处理 |
| `20261007_dataset_epoch_fences` | `sync_devices`/`refresh_tokens`/`mutation_receipts` 加 `dataset_epoch NOT NULL DEFAULT 函数` | **函数默认值不走 PG 快速加列 → 三表重写**（最大 681 行） | 取当前 epoch 填充既有行 | 旧应用 INSERT 不带该列 → 由 DB 默认值填充，可写 |
| `20261008_sync_commit_journal` | 建 3 张表 + **7 类实体 AFTER 行级触发器** + 不可变约束 + 禁 TRUNCATE | 逐表短暂 | **`sync_publication_state` 迁移内不插初始行** | 写放大；见 5.3 |

### 5.3 三项必须处理的兼容性事实（代码级确认，非推测）

**(1) 上线瞬间所有在线会话失效 —— 确定性结论**

```
kernel/rbac.js:45   jwt.sign({ userId, systemRole, securityVersion, datasetEpoch }, ...)
kernel/rbac.js:82   !Number.isSafeInteger(decoded.securityVersion) → 判定无效
kernel/rbac.js:116  decoded.securityVersion !== user.securityVersion → 401 SESSION_REVOKED
kernel/rbac.js:43   签发时若无 securityVersion → throw 'Current securityVersion required'
```

`138cf2d` 签发的 access token **不含 `securityVersion` 字段** → 验证阶段即判为无效。
→ **上线后所有在线用户收到 401 `SESSION_REVOKED`，必须重新登录一次。** 这是需要提前告知用户的事实，不是"可能"。

**(2) `pullProtocol=2` 首次拉取存在初始化缺口**

```
syncReadPolicy.ts:  const state = await db.syncPublicationState.findUniqueOrThrow({ where: { epoch: acl.datasetEpoch } })
changePublisher.ts:12  await tx.syncPublicationState.upsert({ where:{epoch}, create:{epoch}, update:{} })   ← 仅写入时创建
```

`20261008` 不插初始行。若迁移后、任何写入发生前，客户端以 `pullProtocol=2` 拉取 → `findUniqueOrThrow` 抛错（Prisma P2025）。
→ 上线前需确认：v2 拉取路径是否先 ensure 该行；否则首次同步会 500。旧客户端不带 `pullProtocol` 参数时走原路径，不受影响。

**(3) 客户端 IndexedDB `VERSION 2 → 4`**

旧库原始数据转入 `legacyQuarantine`（retain originals），需 `RecoveryPanel` 恢复；账号切换后按 `ownerId` 分片。
**按你的提醒：这需要实际 UI 验证，不能拿文件名当证据**（例如 `actual-recovery-dialog.png` 实际是任务页面）。且本层单测目前是坏的（见第 4 节），**尚无可用证据**。

## 6. 本轮停止点

已完成：候选目录固定、依赖与 Prisma Client 就绪、门禁准备 PASS（产物与 manifest 齐备）、后端全部校验通过、目标环境差异盘点。

未完成（留给下一轮，需你决策）：

1. **前端 16 个单测失败** —— 需确定是补齐测试（对齐新 `idb` API）还是源码暴露兼容接口；在此之前离线/账号隔离场景无有效证据。
2. `pullProtocol=2` 首拉初始化缺口确认与处置。
3. 十项 hook 的服务器适配实现。
4. 配对备份与恢复可用性证明、迁移兼容性清单逐项签署。
5. 旧客户端离线草稿升级的**实际 UI 验证**（非测试脚本、非文件名）。
6. `safeRollback` 取舍（见部署合同草案）。
