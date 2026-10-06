# S05 恢复与发布失败状态矩阵

|场景/失败点|预期安全状态|必须检查的证据|当前状态|
|---|---|---|---|
|第二轮 rsync/快照失败|首轮不可变快照仍可读取；不把部分目录发布为 latest|首轮/二轮 manifest、latest 目标、退出码|PLANNED_NOT_RUN；脚本当前没有 staging 校验/原子发布证据|
|DB dump 完成但 uploads 采集失败|不能把孤立 dump 宣称为配对恢复点|DB dump hash、uploads snapshot ID、runId/失败日志|PLANNED_NOT_RUN；脚本未见共同 checkpoint|
|restore 有唯一键冲突|事务失败或计数准确且无静默丢行|preview/apply 响应、事务状态、实际行数|历史 B13 隔离结果继承；本轮未重跑|
|候选迁移/构建门禁失败|失败发生在切流前，current 与现服务保持|current symlink、migration state、candidate build ID|候选环境故障注入 PLANNED_NOT_RUN|
|切流后 smoke 失败|人工决策可恢复到兼容前一 release；DB migration 不盲目 down|runbook、指针/进程指纹、health/readiness、只读 smoke|当前部署脚本仅提示 §13；未提供 runbook/目标环境|
|运行配置变量不匹配|preflight 失败或运行时行为拒绝不安全默认|变量名/来源、实际 CORS 响应、进程环境证据|D03 静态裁定继承；真实配置与运行时未检查|

本矩阵是后续演练的目标判据，不是已执行或业务验收结果。
