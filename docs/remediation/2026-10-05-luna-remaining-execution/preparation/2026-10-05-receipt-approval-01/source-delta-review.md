# 本轮差分结论（只读证据）

沿用 C/LP01/原 R06 的 B05/B06，不新增漏洞 ID 或重复隔离复现。当前 sync.js:522–553 仍全局 key 预取/applied 提前回放；706–727 独立回执 upsert；tasks 业务内事务以及 reports 共用 CAS 不包含外层 receipt。731 的设备元数据异常可发生在已提交项之后，737 的 best-effort 汇总不替代严格单项审计。schema.prisma:486–503 无 hash/version/expiry。strictAudit.js:17–20 已有 caller-tx helper可只读复用。

当前 upsertSyncDevice:175–182 不写 update.userId，因此不能指控“device owner 被覆盖”；需要补 owner 检查的范围是别人的 existing device 被接受、元数据被改。

修正旧 C 草案：不认为任意500整批回滚；不把缺 client hash 解释为服务端免算 hash；不从旧成功行伪造 hash；不回退旧业务/回执分开路径；不声称新增 unknown/expired 对现有 engine 无兼容影响。24h 与新 schema/预约端点仍是本轮待签提案而非当前事实。保留 global unique 的方案不改历史唯一键，不复制已有 userId 成另一个 actorId 列。

B05/B06 维持 SUPPORTED，动态补证 NOT_RUN。原 R06 行号是旧历史快照，本轮锚点和 source-bindings.json 是当前工作区基线；未将旧 B09/负责人关系结论当作当前再次确认，既有后续修复不重扫。
