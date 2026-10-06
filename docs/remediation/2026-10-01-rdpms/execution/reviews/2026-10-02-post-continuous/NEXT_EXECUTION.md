# 下一执行接续指令

```text
继续执行RDPMS修复规划v2及2026-10-02-post-continuous独立复核。
先完整读execution/LUNA_CONTINUOUS_EXECUTOR_PROMPT.md和EXECUTOR_PROMPT.md规定的v2文件，再读execution/reviews/2026-10-02-post-continuous/{REVIEW.md,findings.json,PLAN_ADJUSTMENTS.md,task-readiness.json,validation-summary.json,handoff.md}及当前task card/关联矩阵/历史证据。
复核HEAD/git status/新source hashes，保护未提交文件。已有连续本地授权继续有效；串行逐任务登记scope和新run，不子代理、不依赖变更、不提交部署、不触碰真实/共享DB或账号，不代签决定。
顺序：RP10-T02返工 -> RP04-T02返工 -> RP02-T01补验 -> RP08-T01补验。
RP10补反向save/submit竞争，保护HTTP与sync共同保存命令的真实状态写入边界，保留CAS/legacy既有可编辑状态/合法同key回放；双方向确定性屏障查真实report/version/audit/receipt，无遗漏caller。D-S01-07在不改变source-state行为时不适用；RP09只是联合验收依赖。AC-B10-01必须用于快照/CAS；AC-B10-02待批准，不能版本测试冒充PASS。
RP04补顶层scalar/date原始类型检查，合法中文/string原合同保留；object subtype、array type、boolean dates 400无持久变化；复验原子性和故障注入。无经理/成员规则变更。
RP02/RP08只先补缺失验收矩阵，无新问题证据不改业务。RP02 deterministic disable/login双方向和锁内wrong-pass不扩锁；RP08实际VIEWER/elevated/零权限/ownOnly/所有实体字段正负对照。身份注入不算JWT链；IDB部分保留ENV_BLOCKED/NOT_RUN。
每项交付完整新run并同步两级状态/接续及必要镜像；保留旧审计/run/manifest/v1。按原306case定义映射，拒绝局部PASS扩大整case。然后重新算全54任务依赖与精确条件门禁，只推进就绪STANDARD；受阻继续其他独立授权项。无必要批准材料时保留门禁。
本次prompt为接续约束，用户将其发送执行才启动本轮实现；独立review没有修改业务源码。最终逐任务报告真实实现/验证/发布、旧finding及LR处置、证据限制、清理、54任务统计和剩余门禁。
```
