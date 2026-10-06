# 下一步可执行合同（未批准）

本轮完成可审查准备；当前 T-RP-02、T-RP-07 仍 PROPOSED。签署依据为 decision-proposal.json 全部 R01–R12（含 R05b）、D01–D05；执行者不能代签。

## 推荐一次裁定的两项

1. **T-RP-02-SCOPED-RESERVATION-V1**：采用 C 的 additive SyncMutation 方案，保留全局 key 唯一键，绑定 actor/device/资源/命令/hash。新增预约后执行与授权查询；每项业务、必要审计、成功回执同事务。24h 从预约起算，过期不自动执行，候选不清理记录；旧回执不伪造 hash、旧无预约 push 安全拒绝。批准指定四个可空列及指定新迁移仅在自有本地验证环境创建/执行。**当前旧前端无法直接使用新协议**，不批准上线或自动升级旧 outbox。
2. **T-RP-07-SYNC-DELETE-WINS-V1**：只覆盖 RP09-T01 同步删除适配。沿用有权限删除胜出的既有语义；不因 baseUpdatedAt 过旧拒绝删除。修正重复 tombstone 不推进原时间，同项 audit/receipt 原子。**这接受有权限的迟到删除可能删除更新过的行，不是严格 revision 删除保护**。不批准 DAG、递归删除、HTTP 删除、恢复/移动或 RP05 其他行为。

两项共同只解锁 RP09-T01/T02 的上述本地后端范围；RP12 全链与客户端切换仍需各自门禁，目标环境/容量/清理/恢复仍未批准。不能把方案交付标成产品 PASS，不能承诺一次批准完成所有剩余工作。

## 为什么此处需要明确裁定

TASK_GRAPH.json 规定 RP09-T01/T02 的 T-RP-02 在 IMPLEMENTATION 前且 condition=always；实际改同步 delete 时 T-RP-07、S03-OI-05 同时适用。EXECUTOR_PROMPT.md 和 LUNA_IMPLEMENTATION_PROMPT.md 禁止执行者代签 PROPOSED/PENDING。已批准的 T-RP-09 文件明确 excludedDecisions 含 T-RP-02，approvedScope 只有 RP02-T02/RP03-T01；本地执行授权本身无需重复。

## 可直接确认的文字

> 批准 T-RP-02-SCOPED-RESERVATION-V1 与 T-RP-07-SYNC-DELETE-WINS-V1，按本目录 decision-proposal.json 的全部规则、风险和限定本地范围执行。批准人：郭仁康；职责：研发副总监。

若不接受 delete-wins 风险，不应使用上述批准文字；应明确改成哪种 revision 删除合同。本包没有替用户选择批准，也没有实施 schema 或业务改动。
