# 独立审阅入口 — test-contract-2026-10-03

> 本目录为本轮 CodeBuddy 本地测试合同执行的唯一交付根。所有结论待独立审阅裁定；发布保持 NOT_EVALUATED。

## 三项补充交付（新增 SUP 编号，不扩 54 任务）

| SUP | 父任务 / 发现 | 模式 | 关键用例 | 结果 |
|---|---|---|---|---|
| SUP-01 | RP10-T02 / LR4-01 / B10 | TEST_ONLY | 多原语屏障命中 + 语义负对照（测试适配层无条件 upsert 确认坏结果） | rp10 19/19 |
| SUP-02 | RP08-T01 / LR4-02 / B04 | TEST_ONLY | 七实体精确行/字段键-值对照 + 权限拒绝 | rp08 12/12 |
| SUP-03 | RP04/RP08 / LR4-04 / B20 | REVIEW_ONLY | 阶段软删合同定向核对（源调用链 + 覆盖矩阵 + 最小下一步） | 只读无改码 |

## 启动 / 结束基线

- 启动 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`（main）；工作区 dirty 文件全部保护，未 reset/clean/stash。
- 业务源码基线 hash（backend/src + frontend/src 跟踪文件 hash 串联 sha256）：**启动 = 结束 = `7564dcf2b4da343ed077b8e85a2ba8ba0b5e1da9af6e5fbf9da1770a4a88a0eb`**。
- 测试文件结束 sha256：
  - rp10: `dc5ceb9c9c409453bba2d3357f37eb68cc44e3ef2bcf956107adf330e23ff53b`
  - rp08: `07e18190ee5baeee283242361b4de9854ac6e8898509d1fbcd59efa11847f211`
- 增量仅限：两个白名单测试文件 + 本 session 目录 + 6 个受控记录文件（仅追加）。

## 验收要点

- **SUP-01-01**：屏障命中真实 create，迟到请求受控 409，SUBMITTED 正文未被覆盖。
- **SUP-01-03（语义负对照）**：迟到新建被适配层无条件 upsert 覆盖 → 201 + 已 SUBMITTED 正文≠版本快照 + 多 1 成功回执 + 多 1 create 审计。控制运行 exit 0 仅表示"已确认预期坏结果"，**非修复/发布 PASS**。
- **SUP-02**：七实体普通 API 与同步同一真实活跃行逐键逐值相等；移除读权限后普通 API 403、同步 upserts/tombstones 空。
- **SUP-03**：普通 API 阶段列表未过滤 deletedAt（projects.js:820 / phases.js:39）为当前实现（CONTRACT_UNRESOLVED）；软删写仅经同步 push（project_phases.delete）可达；恢复不可达；同步侧 deletedAt 处理正确。

## 清理与资源

- 自有 PostgreSQL 集群 initdb/启动/guard check/reset/build/运行/guard drop/停止/临时根删除 全链路完成；backend/dist 运行后删除；无遗留进程。

## 精确读取顺序（供独立审阅）

1. `CODEBUDDY_TEST_CONTRACT_EXECUTOR_PROMPT_2026-10-03.md` + `CODEBUDDY_TEST_CONTRACT_PROMPT_MANIFEST_2026-10-03.json`
2. `execution/reviews/2026-10-03-codebuddy-followup/REVIEW.md`、`findings.json`、`validation-summary.json`、`CONTRACT_ERRATA.md`、`NEXT_EXECUTION.md`
3. `SUP-01/deliverables/`（authorization / change-summary / acceptance / rollback / task-state / handoff / evidence）+ `SUP-01/runs/rp10-suite/attempt-04/`
4. `SUP-02/deliverables/`（同上 + field-comparison）+ `SUP-02/runs/rp08-suite/attempt-02/`
5. `SUP-03/deliverables/`（phase-read-contract / scope-assessment / next-action / coverage.csv / evidence/source-trace + 7 类）
6. 本目录 `SESSION_SUMMARY.md` / `final-integrity.json` / `resume.md`

## 范围外（最小授权请求）

- 阶段读取是否过滤 deletedAt、阶段软删恢复是否 API 可达、前端软删去重：需产品/安全具名批准（不在本轮授权内）。
- 其他 51 项 STANDARD 任务：需各自精确审批/材料/资源条件，未继续。
