# 会话总结 — test-contract-rework-2026-10-03-cb1（三个 SUP 有界返工）

- 执行者：CodeBuddy；日期：2026-10-03
- 指令：`execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_2026-10-03.md`（含配套 manifest）
- 权威复核：`execution/reviews/2026-10-03-codebuddy-supplements/`
- 起始 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`（与本轮起始工作区一致，起始基线见 `evidence/start-baseline.json`）
- 类型：TEST_ONLY ×2 + REVIEW_ONLY ×1；业务源码改动数 = 0

## 1. 三项 SUP 状态

| SUP | 父任务 | 类型 | 原映射 | 本轮发现 | 实现/交付 | 验证 | 独立审阅 | 发布 |
|---|---|---|---|---|---|---|---|---|
| SUP-01 | RP10-T02 | TEST_ONLY | LR4-03 | LR5-01 / 04 / 05 | 已交付（七类 + 证据） | 局部真实自有库 22/22 | PENDING | NOT_EVALUATED |
| SUP-02 | RP08-T01 | TEST_ONLY | LR4-02 | LR5-02 / 04 / 05 | 已交付（七类 + CSV/MD） | 局部真实自有库 12/12 | PENDING | NOT_EVALUATED |
| SUP-03 | RP04-T01 / RP08-T01 | REVIEW_ONLY | LR4-02 | LR5-03 / 04 | 已交付（七类 + 4 份文档） | STATIC_REVIEW | PENDING | NOT_EVALUATED |

父任务状态不改；54 任务 / 306 验收 / 包状态 / 门禁 / 31 历史开放项均未改动。

## 2. 真实运行与命令

| 套件 | 自有库 | 结果 | 关键证据 |
|---|---|---|---|
| rp10 报告正式套件（最终 attempt-05） | 新建 `rdpms_test_*`（独立集群） | tests 22 / pass 22 / fail 0 | `SUP-01/runs/rp10-suite/attempt-05/` |
| rp08 同步正式套件（最终 attempt-03） | 另一个新建 `rdpms_test_*`（独立集群） | tests 12 / pass 12 / fail 0 | `SUP-02/runs/rp08-suite/attempt-03/` |

每次运行附带的检查（均由 runner 执行并记录命令与退出码）：
`npm run build` 0、`npm run typecheck` 0、`npm run lint:undefined` 0、`git diff --check` 0、
guard check 合同（reset 前预期 exit 2）OK、guard drop 0、cluster stop 0、自有 dist 与临时根删除。

失败尝试保留（未覆盖）：
- `SUP-01/runs/rp10-suite/attempt-01`、`attempt-02`：新增四原语矩阵内 `periodKey` 缺值的 ReferenceError（测试内笔误，已修）。
- `SUP-02/runs/rp08-suite/attempt-02`：runner 的 dist 清理判定缺陷——`shutil.rmtree` 抛
  `OSError: File not found` 被记为「未清理」，但文件系统校验显示 dist 已不存在。
  已把 runner 改为**始终以文件系统为准**判定（`finally` 里重算 `ownedDistRemoved`），
  随后重跑三项控制与两个套件；旧 runner 与新 runner 的日志均保留。

## 3. runner 失败路径控制（LR5-05，SIMULATED_CONTROL）

| 控制 | 注入 | 观察 | 退出 |
|---|---|---|---|
| build-fail | build 退出 1 | 仍执行 drop/stop、仍写结果、dist 清理被检查 | 非 0 |
| drop-raise | guard-drop 抛 FileNotFoundError | **仍执行 cluster-stop 并写 run-results.json** | 非 0 |
| stop-fail | cluster-stop 退出 1 | 保留自有临时根 + 记录解除条件 + 写结果 | 非 0 |

三项均为控制流模拟（未注入真实数据库故障），进程退出码均为 1（记录在
`controls/control-exit-codes.json`）；stop-fail 保留的自有集群共 3 个，已全部按记录的解除条件
手动停止并删除（`controls/stop-fail/manual-release.json`），最终无遗留自有集群与临时根。
汇总见 `controls/runner-controls.json`；runner sha256 `d8e2b02302d8d62e2618192e9aef8f1de443ad2a6ac0724ebbb213a798d85f74`。

## 4. 实际文件增量

- 修改：`rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs`
  （19 → 22 条，新增 SUP-01-01b / SUP-01-02 / SUP-01-04；原 19 条业务断言保留）
- 修改：`rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs`
  （仍 12 条；最后一条补充用例改为同账号撤权对照）
- 新增：本 session 目录（授权、基线、交付、证据、运行日志、控制、文档）
- 追加：六个受控记录文件的 continuation / handoff 章节 / 版本 entry
- 业务源码、其他测试、共享 helper、schema、guard、依赖、配置：零改动（由 `final-integrity.json` 核对）

## 5. 限制与未运行

- 完整 JWT 链、前端 IndexedDB、浏览器 / 实际 UI、目标环境、联合合同、部署：`NOT_RUN` / `NOT_EVALUATED`。
- 未注入可信 actor 之外的认证路径验证；未重跑 306 验收或全仓历史。
- 阶段过滤政策：`CONTRACT_UNRESOLVED`；未提供具名批准来源。
- AC-B10-02 / INT-PC03-01、RP08-T02 缓存撤权 / 历史回填 / IDB、AC-B04-02、PAC-RP08-02..04 仍未完成。
- 局部套件 PASS ≠ SUP 全部要求 COMPLETE，也不等于修复验收或发布验收。
