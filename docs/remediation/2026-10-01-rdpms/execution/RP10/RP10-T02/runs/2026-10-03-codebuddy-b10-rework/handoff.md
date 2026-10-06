# RP10-T02 返工 handoff — 2026-10-03

## 完成内容

- 共享保存命令 `saveReportDraft` 的写入与「真实可编辑状态」原子绑定（状态白名单 + 并发基线同处一个 UPDATE 谓词），并区分 404 / 409 INVALID_STATE / 409 CONFLICT。
- `POST /api/reports`（既有草稿分支）改用同一共享命令；`sync.push` 已走共享命令（未改 sync.js）→ HTTP legacy、HTTP modern/CAS、同步上行三条调用者同质受保护。
- 新增 6 个确定性屏障用例（保存先完成 / 提交先完成-legacy / 提交先完成-modern CAS / 同步上行迟到保存 / 合法同 key 回放 vs 新 key / 过期基线 CONFLICT），均在真实自有 PostgreSQL 上执行；原有 2 个用例保留并通过（8/8）。
- 反例对照：移除状态谓词后同套测试失败 1 项（legacy 迟到保存）→ 新测试确有捕获力；改动前基线对照也确认该 3 项在改动前失败。

## 验证

- 定向套件 8/8（attempt-03、attempt-06）；每套均在新建自有集群 + 唯一 `rdpms_test_*` 库 + guard check/reset/drop + 清理。
- 定向回归（各自独立库）：rf02-idempotency、rf02-post-concurrency、rf02-sync-rejection-retry、rf03-report-period、rf04-versions-access、rf04-write-authorization、rf05-file-scope 全通过。
- rf01-bootstrap：RF01-I2 失败，断言 `current_database() === 'rdpms_test'`，而自有库名为 `rdpms_test_rp01_exec_<hex>` → 环境/命名导致，改动前后一致，与本次修复无关。
- 单元套件 87/87（修复 `stubDeps` 中 `$queryRaw` 缺口后；该缺口由上一轮 submit 行锁引入，改动前即失败）。
- `npm run typecheck` exit 0；`node scripts/check-undefined.mjs` exit 0；构建（tsc）在每次运行中 exit 0。

## 限制

- 集成测试使用注入可信 actor，不是完整 JWT 链证据。
- 未运行前端 IndexedDB、目标/候选环境、真实并发压测。
- release 仍 NOT_EVALUATED；未提交、未部署。

## 阻碍与遗留

- AC-B10-02（新 key 重提 SUBMITTED 来源状态规则）保持 NOT_RUN，需 D-S01-07 具名批准（RP10-T03）。
- INT-PC03-01（PC03 联合回执/审计）NOT_RUN，依赖 RP09-T01。
- RP10-T01（任务全入口严格 CAS）仍受 S03-OI-09 受支持客户端矩阵与 T-RP-03 限制。

## 下一就绪任务

按本次授权顺序：RP04-T02 返工（LR2-02 / B18），随后 RP02-T01、RP08-T01 补验。
