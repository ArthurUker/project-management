# RP08-T01 补验 handoff（LR3-02）— 2026-10-03

## 完成内容

- 交付 `read-contract-matrix.csv/.md`：七实体的普通 API 入口/权限/作用域来源/字段来源行号 ↔ sync 映射行号、own-only、墓碑规则、增量时间戳，并声明该对照不构成批准来源。
- 新增 6 个用例（B1 成对权限、B1b 撤销成员资格、B2 elevated 非空本人报告、B3 墓碑正例与负例、B4 增量拉取、B5 字段子集与禁止字段），既有 5 个用例保留 → 11/11。
- 未改任何业务代码（sync.js / 普通 API / 前端零改动）。

## 验证

- `evidence/attempt-03`：11/11，独立自有库，guard check(2)→reset(0)→build(0)→suite(0)→drop(0)/stop(0)。
- 前两次失败均为夹具字段问题（里程碑必填 dueDate、报告墓碑缺 deletedAt），已修正并保留日志。

## 限制

- 注入可信 actor，非完整 JWT 链；未跑前端 IndexedDB、目标/候选环境、部署。
- 字段级授权无独立批准文档 → 按当前实现对照并登记缺口，未发明规则、未要求 JSON 全等。
- release NOT_EVALUATED；B04 仍 SUPPORTED；包 RP08 仍 IN_PROGRESS。

## 遗留

- AC-B04-02、PAC-RP08-02/03/04 属 RP08-T02，需 T-RP-04 / T-RP-12 具名批准。
- D-S01-05 condition=false，未启用注册类项目全局例外。

## 下一就绪任务

C：RP02-T01 TEST_ONLY（固化独立复核的条件更新前停用屏障），随后统一对账与 REVIEW_ENTRY。
