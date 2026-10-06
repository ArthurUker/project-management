# 精确接续

1. 先读本目录 APPROVAL_REQUEST.md、decision-proposal.json、execution-boundary.json、compatibility-and-recovery.md。
2. 读取 source-bindings.json/start-baseline.json/evidence/final-readback.json，核对当前HEAD/工作区，不覆盖未提交变化。READY之后本目录冻结，后续实现在新implementation run。
3. 无 exact scope 具名批准时不得修改 sync/schema；可继续独立准备但不把 PROPOSED 当批准。批准若仅部分规则，则只启动满足门禁的明确子范围。
4. 如批准两份完整合同，先登记 approval/authorization，再按 P EXECUTOR_PROMPT + Q LUNA_IMPLEMENTATION_PROMPT 与当前 RP09卡/原24验收/历史R06复核，逐任务串行 RP09-T01 → RP09-T02；每项单独实现/验证/交付/台账更新。
5. 构建/DB/JWT场景仅此后用自有临时资源执行；完整客户端IDB/目标留存/恢复水位仍缺批准或材料，保持未运行。完成局部scope不标整个RP09/全计划完成。不得开启其它业务任务或自签18个未批准决定。

本轮状态：准备COMPLETE；代码任务仍NOT_STARTED，动态NOT_RUN，independentReview PENDING，release NOT_EVALUATED。无服务/数据库/浏览器资源需清理。
