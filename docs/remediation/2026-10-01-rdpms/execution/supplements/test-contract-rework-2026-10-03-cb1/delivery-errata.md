# 本轮交付勘误（只纠正与说明，不改写冻结的旧记录）

旧 session `execution/supplements/test-contract-2026-10-03/`、旧审阅、旧 run 与旧失败日志
**保持冻结**；本文件只登记纠正与本轮补齐，不倒填历史起点。

## 1. 编号与原映射纠正

| 项目 | 旧交付 | 纠正 |
|---|---|---|
| SUP-01 原映射 | LR4-01（错） | **LR4-03**；LR4-01 属此前台账漂移，不是报告屏障发现 |
| SUP-02 原映射 | LR4-02 | LR4-02（正确，沿用） |
| SUP-03 原映射 | LR4-04（原 findings 中不存在） | **LR4-02** |

## 2. 覆盖口径纠正

| 旧交付表述 | 纠正 |
|---|---|
| 四原语屏障均已覆盖 | 旧用例只真实命中 create；控制内的 upsert 是 create 屏障命中后直接调用，不算 upsert 屏障验证。本轮新增四原语各自独立命中的兼容矩阵（`SUP-01/evidence/primitive-matrix.json`）。 |
| 恢复后 submit 竞争已覆盖 | 旧 A06b 的赢家只恢复到活跃草稿，没有 submit。本轮新增 SUP-01-02 正式用例。 |
| 移除同一 actor 权限 | 旧用例从 member 切到 zero 账号。本轮改为同一 member 只移除目标读权限。 |
| `code/templateId/completedAt/submittedById/reviewNote/reviewedAt` 为禁止读取字段 | 这些在**当前读投影中是允许字段**；旧表混淆了「读取投影」与「客户端禁止写入字段」。本轮按实际投影与运行结果重建 CSV/MD。 |
| `phases.js` 无 DELETE 路由 | 无**阶段资源** DELETE；但 `phases.js:194` 存在流转边 DELETE，必须区分。 |
| 项目 phases 封装证明前端会显示 | 封装无直接调用者（`NOT_FOUND`）；`PhaseProgressBar` 读模板阶段；实际 UI `NOT_RUN`。 |
| 普通阶段行为即 B20 回归 / 已批准阶段政策 | `AC-B20-01/02/03`、`PAC-RP04-03` 原文为**项目级**软删范围；阶段政策无具名批准 → `CONTRACT_UNRESOLVED`。 |
| 其他 51 项 STANDARD 任务 | 原 54 任务：18 COMPLETE / 2 IN_PROGRESS / 34 NOT_STARTED，实施未完成 36 项；三个 SUP 不加入、也不从 54 相减。 |

## 3. 历史证据缺口（如实登记，不倒填）

- 旧 session 未保存规定的起始 manifest / 完整文件集（含 untracked）/ 清理记录 →
  `HISTORICAL_EVIDENCE_UNAVAILABLE`。本轮**不**重建当时起点、**不**补写旧目录。
- 旧版本历史 entry 的 sha256 含 `APPENDED_*`、`SESSION_DIR` 占位，且包含历史文件自身项 →
  本轮新 entry 只使用**真实逐文件 sha256**，不自包含、不交叉包含两份 history。
- 旧执行者自报运行了 typecheck / lint:undefined / git diff --check 但无命令日志 →
  本轮由 runner 实际执行并留档（见各 `run-results.json`），不把独立补跑冒充为旧执行证据。

## 4. runner 缺陷纠正（LR5-05）

旧 runner（`test-contract-2026-10-03/run-suite.py`，冻结不改）在 guard-drop 抛异常时会跳过
cluster-stop 与结果写入；`built` 在 build 成功后才置位，失败 build 的输出不保证检查；
清理结果不影响总退出码。本轮新 runner（`run-suite.py`）逐项修正，并以三次
`SIMULATED_CONTROL` 验证（见 `controls/runner-controls.json`）。

## 5. 本轮未改变的事项

- 原 54 任务、306 验收、包状态、批准、门禁、31 历史开放项、release `NOT_EVALUATED` 均未改变。
- RP10-T02 / RP08-T01 / RP02-T01 的原本地接受不因本轮自动撤销或升级。
- 未发现新的业务回归；本轮不实施任何业务修复。
