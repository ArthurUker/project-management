# RP10-T02 返工 handoff（LR3-01）— 2026-10-03

## 完成内容

- 修复 POST /api/reports 的两处旁路：墓碑恢复改为「仅当该行此刻仍是墓碑」的条件 UPDATE（否则 409）；
  真正新建改为 create（唯一键竞争 → P2002 → 既有 409 DUPLICATE_PERIOD_KEY，事务整体回滚）。无条件 upsert 已删除。
- 清点并记录了全部 8 个写报告正文的分支；PUT legacy/modern、sync upsert、submit 快照路径未改且复验通过。
- 新增 A01–A06b 八个确定性屏障用例（屏障停在真实 create/updateMany 之前），既有 9 个用例保留 → 17/17。
- 反例对照：临时恢复无条件 upsert 后 A02/A03/A03b/A06/A06b 失败；已还原并复核（`grep upsert` = 0）。

## 验证

- 定向套件 17/17（`evidence/attempt-05`），每个套件独立新建自有库、guard check(2)→reset(0)→build(0)→suite→drop(0)/stop(0)。
- 定向回归（各自独立库）：rf02-idempotency、rf02-post-concurrency、rf02-sync-rejection-retry、rf03-report-period、
  rf04-versions-access、rf04-write-authorization 全部 exit 0。
- `npm run typecheck` exit 0；`node --check src/routes/reports.js` exit 0。
- 夹具修正记录：schema 默认 `currentVersion=1`；POST 回放返回首次成功状态（201）；A01 周期键需避开同文件既有夹具。

## 限制

- 注入可信 actor，非完整 JWT 链；未跑目标/候选环境、前端 IDB、部署。
- release NOT_EVALUATED；未提交、未部署；包 RP10 仍 IN_PROGRESS。

## 遗留

- AC-B10-02（D-S01-07）与 RP10-T03 未批准；INT-PC03-01（RP09-T01）NOT_RUN；RP10-T01 受 S03-OI-09/T-RP-03 限制。
- B10 仍 SUPPORTED，不因本轮局部通过而关闭。

## 下一就绪任务

B：RP08-T01 VALIDATION_ONLY（LR3-02），随后 C：RP02-T01 TEST_ONLY。
