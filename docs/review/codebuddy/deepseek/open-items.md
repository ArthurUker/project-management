# 未闭环事项清单（CodeBuddy / DeepSeek）

更新：2026-10-09　　关联提交：`f8ccb06`（部署形态改造）

> 本文件汇总当前部署与服务器补正相关的待办，不等于全部历次审计问题的关闭清单。
> 本地文档核对结果见 [REVIEW.md](../../../maintenance/2026-10-09/REVIEW.md)。

## A. 前端测试 4 项未解决（技术债，优先级最高）

2026-10-07 的 `TEST_ONLY` 补正把前端单测从 47/63 提升到 60/64，仍有 4 项失败，
该结果来自服务器候选副本，补丁尚未应用到当前正式测试目录（当前仍有 idb.outboxClear 等失效调用）。
剩余四项位于 `rdpms-system/frontend/tests/unit/offlineAccountSwitch.test.ts` 的引擎时序套件：

| 用例 | 现象 | 性质 |
|---|---|---|
| **A03-E4** | 断言「B 的拒绝内容必须归属 B」失败：0 ≠ 1 | **未定性** —— 真实缺陷 或 旧预期与新合同冲突，待裁定 |
| A03-E2 | 「A 的上行已发出」屏障超时（push 未被调用） | 夹具时序 |
| A03-E3 | `NETWORK_ERROR`（疑似上一用例遗留的 syncNow 在传输替身还原后走默认传输） | 夹具时序 + 用例隔离 |
| RP13-T01 | 「第二页请求已发起」屏障超时 | 夹具时序 |

已排除的原因（均实测过）：缺 `datasetEpoch`、缺 `_syncRevision`、
`resetDatasetEpoch` 清键、事件循环空转、用例间引擎状态残留。
独立诊断已证明**引擎的分页续拉逻辑本身正常**（第 1 页 → 第 2 页 → `cursor-final` 完整走通），
因此问题定位在夹具与引擎的时序耦合，而非分页实现。

**下一步**：先裁定 A03-E4 是缺陷还是旧预期冲突，再针对确认的原因单独划修复项；
其余三项作为「夹具时序」专项处理。

补正成果见 `artifacts/test-only-fix-63d243b.patch`。注意其基线是 `63d243b`，
部署变更起于 `f8ccb06`，本轮核对 HEAD 为 `289d340`，应用时可能需要手工对齐。

## B. 旧部署工具仍被测试引用，不能直接作为死代码删除

当前生产入口是 rdpms-deploy.sh。旧 candidate-gate.py、deploy-control.py、backup-pair.py
及 drill/ 仍被 RP17/RP18/RP19 集成测试调用。deploy.sh/preflight.sh 也仍保留旧协议。
本轮只清理文档，未删除源码、脚本或测试。

下一步需逐工具确定：保留为隔离验证工具、重命名并明确范围，或连同对应过时测试一起替换。
旧部署工具的测试通过不能证明当前 rdpms-deploy.sh 已通过部署验收。

## C. 待专项验证（需自有隔离库，禁止访问生产库）

`pullProtocol=2` 首次拉取的**懒初始化**：`routes/sync.js` 的 `/init` 在该分支先
`await publishCommittedChanges(prisma)`，其内部 `upsert` 当前 epoch 的
`sync_publication_state`，因此**不会**因缺行而失败 —— 2026-10-07 已撤回原先的
「缺行导致必然报错」判断。

但首次初始化涉及源表锁定与批量捕获，其**耗时与锁等待**尚未在目标环境实测。

**下一步**：在新建且确认自有的唯一 `rdpms_test_*` 隔离库中构造「迁移完成、publication state 不存在、无迁移后业务写入」
的场景，实测首次 v2 拉取；不得绕过路由直接调底层函数后宣称 API 有缺陷。

## D. 环境遗留

| 项 | 现状 | 建议 |
|---|---|---|
| 系统盘占用 | 77%（50G 用 37G，剩 12G） | 与 rdpms 无关（/home 15G、/usr 6.4G、/tmp 2G）；如需清理另行安排 |
| `/tmp/codebuddy-heap-snapshots` | 1.5G | CodeBuddy 扩展产生，非项目产物 |
| `review-packages/` 两个复核 zip | 43M，位于 `/mnt/datadisk0/rdpms-review/` | 内含代码版本已超前两代，可删（未纳入版本控制） |

## E. 已知的用户可见影响（非缺陷，无需修复）

- **需要重新登录一次**：新代码要求 access token 携带 `securityVersion`；
  2026-10-08 之前签发的 token 没有该字段，会先被判为 `SESSION_VERSION_REQUIRED`（401）；版本值不匹配才是 SESSION_REVOKED。
  这是 `kernel/rbac.js` 校验的确定性结果，刷新页面重新登录即可。
- **前端 IndexedDB v2 → v4**：旧库原始数据转入 `legacyQuarantine`（原样保留），
  未同步的离线草稿需通过 RecoveryPanel 恢复。**此项尚缺真实浏览器 UI 验证**
  （现有证据文件名不能替代真实截图）。

## F. 当前原地发布的实际能力缺口（2026-10-09 源码核对）

- rdpms-deploy.sh 不自动调用备份、不停写、不运行测试；migrate deploy 先于构建。
- 构建/依赖更新发生于运行目录，不是原子切换；失败不自动恢复之前的文件和数据库。
- restart 后仅等待 3 秒并核对 systemd active，未校验 HTTP health/ready、build 身份或页面。
- 当前脚本无固定提交回退模式；checkout 旧提交后调用脚本会再次合入 origin/main。
- 只有 lockfile 变化才安装，缺失 node_modules 而 lockfile 未变时会直接跳过；已取码后失败再重跑也可能跳过上轮失败的安装。
- 启动脚本/systemd 单元变化需要单独安装；发布脚本不处理这一步。
- 服务器 rdpms-backup.sh 未入库，无法从当前仓库确认其备份完整性或恢复能力。

上述是当前源码可确认的边界，不是本轮已修复项。实际服务器成功/失败影响尚未重验。
生产操作前需补备份、健康验证、失败处置及迁移兼容性依据；不得填造目标环境 PASS。

## G. 归档备份子系统（2026-10-09 新增，位于工作树、尚未提交）

代码、迁移（`20261009_backup_archives`）、CLI 与 systemd 单元模板已在仓库内；**生产侧尚未配置**，差距必须显式保留：

| 项 | 现状 | 下一步 |
|---|---|---|
| 生产前置 | `/srv/rdpms/.env` 尚无 `BACKUP_MASTER_KEY` 与 `BACKUP_ARCHIVE_DIR`；此时归档入口按 fail-closed 返回 503 `BACKUP_KMS_NOT_CONFIGURED`（是设计而非缺陷） | 发布窗口内写入两项并建目录（README §12.2） |
| 定时任务 | 本机**没有** `rdpms-backup.timer`（只有 foodsentinel 的每日备份 timer）；模板在 `deploy/systemd/` | 安装并手工试跑一次；注意与既有 `rdpms-backup.sh` 的职责划分，避免同一时段两次整库 dump |
| 生产验收 | 生产**未演练**：隔离库演练已覆盖归档/离线校验/篡改检出/解密/`pg_restore` 回灌逐表行数一致/HTTP 权限与审计 | 生产首次备份后补一次恢复演练，不据隔离库结论直接判生产 PASS |
| 门禁脚本 | `smoke-test.sh`、`perm-matrix.sh` 尚未加入归档端点断言 | 补只读断言：`GET /api/backup/archives|storage` = SA 200 / 其余 403 |
| 备份范围 | 归档是整库 dump，与应用层 JSON 恢复（27 表，见 §Q 遗留）**范围不同**，不可互相替代；两者都不含 uploads 二进制与异地副本 | 与 uploads 快照、COS 异地方案一并决策 |
| 演练现场 | `rdpms_test_rf30` 库与角色已在演练后删除（不共用 PG 上遗留弱口令角色） | 复现步骤见 README §12.2 与 `backend/tests/unit/rf30-backup-archive.test.mjs` |

**2026-10-10 生产启用结果**：`.env` 两项 + 目录 + timer 已就位；首次归档经单元触发成功（54 表 / 密文 737,336 字节 / 快照 exported），
产物离线校验 7 项全通过、篡改可检出。**仍未做**：生产恢复演练、`smoke-test.sh`/`perm-matrix.sh` 归档断言的目标环境执行、
uploads/COS 异地的定时方案。生产验收另发现并修复一个缺陷：`pg_restore -l` 只读 TOC 即退出导致写 stdin 触发 `EPIPE`，
未处理会让校验进程崩溃（`pgTools.runCommand` 已加 stdin error 处理，补 RF30-T28 用例）。

## H. 顶层管理账号收敛为唯一的 admin（2026-10-10 用户裁定）

结论：主系统管理账号不再分层级，最高权限就是 `admin`；原 `superadmin` 账号按裁定**硬删除**，`ADMIN` 角色保留但不再有账号绑定。
代码侧（seed 治理真源）已同步：`seedAccounts` 只定义 `admin`（systemRole/roleCode = SUPER_ADMIN），
`SEED_SUPER_ADMIN_USERNAME/_PASSWORD` 不再使用；连带更新 `tests/rbac.test.mjs`、`b17` 集成测试、
`scripts/{test-db,run-integration,seed-test-files}.mjs`，避免留下指向已删账号的依赖。

为什么只能走 seed/数据库：`modules/auth/accountPolicy.ts` 禁止「授予同级或更高角色」（`ACCOUNT_TARGET_PROTECTED`）
与「管理自己/同级/更高等级账号」，所以升格与退役在应用层都没有通道 —— 这是 RP01 的既定保护，不是缺陷。

硬删除前的能力清单（只读核对，生产库）：

- `RESTRICT NOT NULL` 引用仅 1 处：`projects.manager_id`（项目 `PRJ-2026-002 [验证]类型规范化-可删除`），连同其 `project_members` OWNER 行一并改指 `admin`；
- 其余 `SET NULL` 类自动置空（`audit_logs.actor_id` 92 行、`system_logs.user_id` 46、`file_objects.uploaded_by_id` 15、`attachments.uploaded_by_id` 11、`users.created_by_id` 6）——审计表另有 `actor_name` 列，历史仍可读；
- `CASCADE` 类随账号删除（`refresh_tokens` 35、`user_roles` 1、`sync_devices` 1、`project_members` 1）。

遗留事项：

- 服务器侧副本（`/usr/local/bin/rdpms-{smoke,perm-matrix,preflight}.sh`、`rdpms-env`）若仍以 `superadmin` 取 SA 分支需同步；仓库内 `smoke-test.sh` 用的是 `SMOKE_ADMIN_USER/PASS`，不受影响。
- 生产 `.env` 里 `SEED_SUPER_ADMIN_USERNAME/_PASSWORD` 已无用，可在下次维护时清理（留着不报错）。
- 只有唯一顶层账号后，忘记口令没有应用内找回通道（用户明确不新增应急脚本）；重置需直接改库。

**执行结果（2026-10-10，已在生产落地）**

1. 升格：`admin` 的 `system_role = SUPER_ADMIN`、`must_change_password = false`（10:20 生效）；并存的 `ADMIN` 角色绑定已清理，顶层账号只留 `SUPER_ADMIN` 一条。
2. 硬删除：`superadmin` 已删除（用户 11 → 10）。事务内先处理唯一 `RESTRICT` 引用（`PRJ-2026-002` 的 `manager_id` 与其 OWNER 成员行改指 `admin`），再删账号；
   `audit_logs` 947 行一行未动（其中 92 行 `actor_name='系统超级管理员'` 保留），`projects_without_mgr = 0`、孤儿成员 0。
3. 前置修复（提交 `077fad5`）：`audit_logs.actor_id` 的 `ON DELETE SET NULL` 与 append-only 守护冲突，会让**任何**账号硬删除整体回滚 →
   迁移 `20261010_audit_actor_fk_drop` 去掉该外键（保留列与守护；展示层改用 `actor_name` 快照）。
   生产以「psql 执行 DDL + `prisma migrate resolve --applied`」落地：当时工作树里有并行会话未提交的迁移，故**未**跑 `migrate deploy`。
4. 并行会话的 WIP 已入库（提交 `4a643e4`：实验室盘点 v1.1 —— 设备台账/库位树/分类扩展、`20261010_lab_inventory_v11` 迁移、README 章节）。
   本文件先前记录的「v11 未提交、干净检出会缺迁移」随之消除；提交 `077fad5` 曾误带其 schema 部分（`git add` 暂存整个文件所致），
   同一内容随后由 `4a643e4` 正式提交，无遗留影响。教训保留：**提交前按文件核对 diff，不要整文件暂存，否则会把他人 WIP 一起带上**。
