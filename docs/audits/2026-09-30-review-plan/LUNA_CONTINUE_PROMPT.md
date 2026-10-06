请执行 RDPMS 补充审阅计划 v2。

仓库：/Users/renkang/VS Code/project-management。
计划目录：docs/audits/2026-09-30-review-plan/。

先完整读取 REVIEW_PLAN.md 的 v2 接续入口、SUPPLEMENTAL_REVIEW_PLAN.md、SUPPLEMENTAL_STATE.json 和 execution/handoff.md；再按包读取原产物。

R00—R14 是已执行的第一轮，不得重置其状态或从 INITIAL_STATE.json 重新开始。补充包 S00—S06 初始均未执行。本轮先完成 S00；如 S00 已有产物，接续 checkpoint，不覆盖原内容。没有后续连续执行指令时，一轮完成一个补充包。

S00 的工作是交付合同收尾：先保存受影响审计文件的原文/摘要，按任务卡核对并纠正文档、枚举、位置和修复卡字段，记录每项变更及理由。不得修改业务代码或冻结的 2026-09-29 审计目录/manifest；不得把同基线历史结果写成本轮实验。

交付 execution/supplemental/S00/ 下的 review.md、findings.json、coverage.csv、open-items.json 及该包额外文件。仅按实际完成动作更新 SUPPLEMENTAL_STATE.json、execution/handoff.md；原 execution/state.json 仍记录 R00—R14，必要的 S00 更正须有变更记录。

用户已允许子任务并行；后续 S01—S05 可在 S00 完成后按依赖独立执行，各代理只写各自目录，由主执行者统一更新状态。不要自行切换模型。S06 最后汇总。

所有补证须满足计划中的最小范围和隔离条件。缺环境/业务规则时写明 pending 和解除条件，推进独立工作；不重扫全仓、不默认重跑全部历史实验、不实施业务修复、依赖升级、数据库迁移、提交或部署。

回报顺序：原轮进度 → 本补充包状态/交付合同结果 → 发现裁定变化 → 已运行与未运行证据 → 开放项及解除条件 → 产物链接 → 下一就绪包。

此提示词供用户后续发起执行使用；本次“只更新计划”的请求不触发上述执行动作。
