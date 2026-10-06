# 执行顺序及回退

1. 得到两个 exact proposal 的具名批准后登记 approval.json，按批准 scope 更新原标准实施状态。源文件 hash 已漂移则差分核对，不复用旧源 hash 当新基线。
2. RP09-T01：先登记允许文件、自有 DB/夹具/合法 JWT/成功路径，实施限定 schema 与 reservation + per-item tx adapters；每一分支回执/必要审计/业务都传调用方 tx。全7实体路径及删除 scope 超界检查后再验证。共享 HTTP idempotency/hash/audit、task/report command 初始只读；若确需改则先记录新增范围与所有调用者，不顺带修业务。
3. RP09-T01 单独交付与状态更新后，再 RP09-T02：同 key 屏障、授权查询、unknown/expired、恢复边界/无 GC 策略，独立交付。真实数据状态与失败日志保留。联合/目标未运行保持真实 NOT_RUN/ENV_BLOCKED。
4. 运行受影响后端现有定向 suites 与新用例，build/typecheck/undefined/diff；每套自有新 DB，不复用固定审计库。按连续授权完成所有独立已就绪项后汇报。
5. 回退本地候选时停受影响 sync 写入口并保留 records/原副本。不得 flag-off 转旧全局回放+独立 receipt upsert；不得删行/删审计/关 append-only trigger；本轮未演练任何回退。

不运行全仓历史复现，不激活 RP12/严格revision/水位/DAG/真实环境任务。T-RP-02 方案批准不等于 T-RP-03/04/10/12 批准；S03-OI-04 是 RELEASE 门禁，不能当作本地实现前置，也不能伪造通过。
