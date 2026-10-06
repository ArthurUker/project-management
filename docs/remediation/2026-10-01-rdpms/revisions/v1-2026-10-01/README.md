# RDPMS 修复计划入口

2026-10-01。当前只有计划，尚未开始业务修复。

先读 [详细修复计划](REMEDIATION_PLAN.md)，再读 [工作包任务卡](PACKAGES.md) 和 [决定与门禁](DECISIONS_AND_GATES.md)。本计划建议全面审阅收尾，定向缺口转为对应修复前置/验收门禁；不将原审计pending静默关闭。

|文件|用途|
|---|---|
|[REMEDIATION_PLAN.md](REMEDIATION_PLAN.md)|是否进入修复、风险次序、架构、阶段、集成、验收/回滚|
|[PACKAGES.md](PACKAGES.md) / [PACKAGES.json](PACKAGES.json)|RP00–RP19共20个任务卡及机器清单|
|[DECISIONS_AND_GATES.md](DECISIONS_AND_GATES.md)|八项业务裁定、八项技术设计选择与31项原开放事项|
|[FINDING_TO_PACKAGE.json](FINDING_TO_PACKAGE.json)|33条发现/候选到唯一主包的映射|
|[OPEN_ITEM_GATES.json](OPEN_ITEM_GATES.json)|31项开放事项的局部门禁、责任角色和解除条件|
|[ACCEPTANCE_MATRIX.csv](ACCEPTANCE_MATRIX.csv)|97条未来验收需求，全部NOT_RUN|
|[IMPLEMENTATION_STATE.json](IMPLEMENTATION_STATE.json)|计划完成；所有包NOT_STARTED，executionAuthorized=false|
|[INPUT_MANIFEST.json](INPUT_MANIFEST.json)|规划基线及17个审计输入摘要|
|[PLAN_VALIDATION.json](PLAN_VALIDATION.json)|仅文档覆盖/依赖/摘要完整性核对，非运行时产品验收|
|[HANDOFF.md](HANDOFF.md)|接续说明和当前边界|
|[EXECUTOR_PROMPT.md](EXECUTOR_PROMPT.md)|以后明确启动实施时使用的范围化提示词|

现有33条记录为32条SUPPORTED（16 P1、16 P2）及1条候选PENDING。原R/S审计文件及历史manifest保持冻结。计划不授权业务实现、数据库迁移、依赖升级、提交、部署或生产恢复。
