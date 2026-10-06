# RDPMS 修复规划 v2

更新2026-10-02；仅规划，实施未授权。

- 20修复/支撑包、54子任务，33唯一发现/候选（32确认、1候选）。
- 31历史开放项保持OPEN；21决定未批准；12跨包合同待验证。
- 306条验收场景记录（含97条继承记录），全部NOT_RUN；场景不是独立测试计数。
- 本轮18项规划缺口已补齐；没有业务源代码、迁移、测试、构建、提交或部署动作。

## 阅读顺序

1. [查漏报告](GAP_REVIEW.md) → [总计划](REMEDIATION_PLAN.md)。
2. [任务图](TASK_GRAPH.json) → [决策/门禁](DECISIONS_AND_GATES.md) → [跨包合同](CROSS_PACKAGE_CONTRACTS.md)。
3. [包任务卡](PACKAGES.md) → [验收矩阵](ACCEPTANCE_MATRIX.csv) → [范围发布门禁](RELEASE_GATES.json)。
4. [发现映射](FINDING_TO_PACKAGE.json) → [实施状态](IMPLEMENTATION_STATE.json)。
5. [接续](HANDOFF.md)及[执行prompt](EXECUTOR_PROMPT.md)；执行prompt只有用户另行启动后可用。

## 来源与核对

[原版快照](revisions/v1-2026-10-01/SNAPSHOT_MANIFEST.json)、[初版冻结审计输入](INPUT_MANIFEST.json)、[本轮输入](REVISION_INPUT_MANIFEST.json)、[版本变更](REVISION_HISTORY.json)、[文档校验](PLAN_VALIDATION.json)。历史审计输入和目录不覆盖。
