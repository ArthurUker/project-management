# TEST_ONLY 补正包运行记录（2026-10-07，候选 `63d243b`）

> 范围：仅修改**失败用例所属的前端测试文件** + 新建测试专用夹具。
> 未修改 `src/offline/idb.ts` / `engine.ts` / `tokenStore.ts` 的业务行为，
> 未恢复无 owner 的全局存储接口，未删除/跳过任何用例，未捕获异常充当通过，
> 未触后端、迁移、部署工具、生产配置，未执行生产迁移 / 切换 `current` / `--apply`。

## 1. 结果总览

| 阶段 | 用例数 | 通过 | 失败 |
|---|---|---|---|
| 基线 `138cf2d` | 42 | 42 | 0 |
| 候选 `63d243b`（补正前） | 63 | 47 | 16 |
| 候选 `63d243b`（补正后） | 64 | 60 | 4 |

（补正后 64 = 原 63 + 新增 1 条安全不变量用例 A03-I3）

其他校验（本轮复跑）：

- 前端 `npm run build`（`tsc -b && vite build`）：**PASS**，退出码 0
- 后端 `lint:undefined` / `npm run typecheck`（完整 `tsc --noEmit`）/ unit 87 / contract 6：上一轮已 PASS，本轮未改动后端

## 2. 逐项映射：原 16 个失败用例

| # | 原用例 | 文件 | 补正后 | 处理方式 |
|---|---|---|---|---|
| 1 | F10-I1 拒绝时同一事务写入拒绝区+移出队列 | deadLetter.idb.test | **PASS** | 绑定 owner；清理只针对本测试分区 |
| 2 | F10-I2 刷新后仍能恢复 | deadLetter.idb.test | **PASS** | 同上 |
| 3 | F10-I3 重复拒绝保留最早 payload、累加次数 | deadLetter.idb.test | **PASS** | 同上 |
| 4 | F10-I4 不同账户隔离：B 读不到 A 的草稿 | deadLetter.idb.test | **PASS** | 改为：B 自己拒绝区为空 **且** B 的 owner 读 A 被 `OFFLINE_OWNER_MISMATCH` 拒绝（更强保证）；`isVisibleTo` 纯函数断言原样保留 |
| 5 | F10-I5 退出登录不清空持久拒绝区 | deadLetter.idb.test | **PASS** | `clearAll` → 登出（会话失效 + activeSession 失效）；断言旧 owner 读被拒 + 重新登录可恢复 + 明确清除后才消失 |
| 6 | A09-I6 同 key 不同内容保留最早 payload、另存冲突 | deadLetter.idb.test | **PASS** | 绑定 owner |
| 7 | A06 clearAll 清理真实键名且不清空拒绝区 | deadLetter.idb.test | **PASS**（断言改写并说明） | 见 §3.1 |
| 8 | A03-I1 不同账号游标/ACL/冲突键互不覆盖 | offlineScope.test | **PASS** | 每个主体独立 fixture；切回 A 验证数据未被覆盖 |
| 9 | A03-I2 登出只清理当前主体分片键 | offlineScope.test | **PASS**（断言改写并说明） | 见 §3.1 |
| 10 | A03-E1 A 的拉取响应切换账号后释放 | offlineAccountSwitch.test | **PASS** | 建立真实会话 + 先装传输替身 + 「在途」门确认 A 的请求已发出 |
| 11 | RP13-T01 中间页落镜像但不提交 cursor | offlineAccountSwitch.test | **FAIL**（仍失败） | 见 §4.1 |
| 12 | A03-E2 A 的上行拒绝响应切换账号后释放 | offlineAccountSwitch.test | **FAIL**（仍失败） | 见 §4.2 |
| 13 | A03-E4 登出与登录交叠 | offlineAccountSwitch.test | **FAIL**（真实业务断言） | 见 §4.3 |
| 14 | A03-E3 拒绝记录按原 key/payload/基线重试 | offlineAccountSwitch.test | **FAIL**（仍失败） | 见 §4.4 |
| 15 | A05-P2 缺项目记录本地留存 | pendingDraft.test | **PASS** | 建立会话；「其它账号读不到」改为**被拒绝**（`OFFLINE_OWNER_MISMATCH`）而非返回 null |
| 16 | A05-P4 留存键按主体分片 | pendingDraft.test | **PASS** | 用当前主体 owner 读写自己的分片键 |

新增（不在原 16 项内）：

| 用例 | 结果 | 说明 |
|---|---|---|
| A03-I3 未激活主体不得写入 | **PASS** | 补充安全不变量：既无当前会话也无 activeSession 登记的 owner 一律被拒 |

## 3. 旧断言与新合同冲突的逐项说明（未删除、未放宽安全不变量）

### 3.1 `clearAll` 时代的三条断言（A06 / A03-I2）

旧断言「登出后 A 的游标 / ACL / 冲突必须被清理」来自 `idb.clearAll()` 的旧语义。
现行 `resetOnLogout()` 只做 `deactivateOwner()`（让会话与 activeSession 登记失效），**不清理分片数据**；
这与 F10-I5「退出登录不清空持久拒绝区，重新登录可恢复」是同一套策略。

因此这三条断言改为验证**更强的安全不变量**：

- 登出后旧 owner 读/写这些键一律被拒（`OFFLINE_SESSION_CHANGED` / `OFFLINE_OWNER_FENCE_CHANGED`）；
- 重新登录后数据按既定策略完整留存；
- 其他主体（B）的数据不受影响。

「不得清理其他账号数据」「旧会话不能继续读写」两条原意保留。

### 3.2 全局无主体接口（全部 16 项）

`idb.kvSet` / `idb.clearAll` / `idb.outboxClear` / `idb.recordsClear` / `idb.deadLettersForUser(uid)` 等
在账号隔离修复后已不存在，且**未恢复**。全部改为 `idb.forOwner(owner).xxx()`。

### 3.3 `deadLettersForUser(其他主体)`

旧用例期望返回空数组。现行实现直接以 `OFFLINE_OWNER_MISMATCH` 拒绝（不允许用他人会话查看他人拒绝区）。
断言相应改为「被拒绝」，这是更强保证。

## 4. 仍失败的 4 项（保留失败，不顺带改源码）

这 4 项全在 `offlineAccountSwitch.test.ts` 的**引擎时序套件**。已排除的原因：
传输替身缺 `datasetEpoch`（已修）、`_syncRevision` 缺失（已修）、
`resetDatasetEpoch` 清键（已修）、事件循环空转（已修，加 `awaitGate`）、
用例间引擎状态残留（已试 `pauseForBootstrap`，无效）。

已单独验证：引擎的**分页续拉逻辑本身正常**（独立诊断脚本中第 1 页 → 第 2 页 → `cursor-final` 完整走通），
因此问题定位在夹具与引擎的时序耦合，而非分页实现。

| 用例 | 现象 | 性质 |
|---|---|---|
| RP13-T01 | 「第二页请求已发起」屏障超时未释放 | 夹具时序，需专项排查 |
| A03-E2 | 「A 的上行已发出」屏障超时未释放（push 未被调用） | 夹具时序，需专项排查 |
| A03-E4 | `B 的拒绝内容必须归属 B`：0 ≠ 1 | **真实业务断言失败**，需裁定 |
| A03-E3 | `NETWORK_ERROR`（疑似上一用例遗留的 syncNow 在传输替身还原后走默认传输） | 夹具时序 + 用例隔离，需专项排查 |

按约定：**保留失败，不顺带修改源码**。下一项修复应针对确认后的具体原因单独划定。

## 5. 验收核对

- 业务源码未改动：`git status --porcelain` 仅显示
  ```
  M frontend/tests/unit/deadLetter.idb.test.ts
  M frontend/tests/unit/offlineAccountSwitch.test.ts
  M frontend/tests/unit/offlineScope.test.ts
  M frontend/tests/unit/pendingDraft.test.ts
  ?? frontend/tests/unit/helpers/
  ```
  `rdpms-system/frontend/src` 树哈希仍为 `607171a39a94ee52c57377db453b13aedd41638d`（与 `63d243b` 一致）；
  `backend/src` / `backend/prisma` 亦无改动。
- 前端 `npm run build` 通过（退出码 0）。
- 未跳过、未削弱任何安全断言；跨主体访问一律断言「被拒绝」。

## 6. 后续注意

测试补正目前**只存在于候选工作副本**，未形成提交。
按约定：若形成新提交，必须**重新准备该新提交对应的候选 manifest**，
不能继续把它标为原 `63d243b` 的产物（当前候选目录的 `dist/` 已被本轮构建覆盖，
`candidate-gate.py` 会因 `CANDIDATE_BUILD_OUTPUT_EXISTS_UNKNOWN_OWNERSHIP` 拒绝重跑，
需另建全新候选目录）。
