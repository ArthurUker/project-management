# REVIEW_ENTRY.md — 窗口 D 自评条目

- **窗口**：D（partition `window-d-auth`）。
- **模式**：`PROPOSED_APPROVAL_PREPARATION_ONLY`。
- **决策**：`T-RP-09`（状态 `PROPOSED`）。
- **父任务**：`RP00-T04`、`RP02-T02`、`RP03-T01`、`RP11-T01`。
- **联合合同**：`PC01`、`PC04`、`PC09`。

## 自评结论
材料交付完整，来源一致性通过（SHA256 + 行号锚定）。所有推荐项 `PROPOSED`，签名字段 `null`，未代签任何门禁。

## 交付清单（本窗口）
- `transport-current.csv`/`.md`：access/refresh 产生/发送/存储/消费 + Bearer/body 实际入口 + cookie 反证。
- `generation-matrix.csv`：两 tab/切用户/logout/迟到成功失败/refresh 竞争/重放 的 actor/token generation 变化与现有保护；源码层与旧运行层分开；NOT_RUN 标注。
- `decision-draft.json`/`.md`：维持或调整 transport、single-use/family 失败语义、前端 generation fence、兼容回退；PROPOSED。
- `acceptance-draft.csv`：真实合法 token 前提 + 两身份/两 tab 正负例 + 临时环境；不 mock JWT 全链。
- `approval-request.md` / `interface-notes.md`：具名确认选择 + C/E/F 接口点。
- 公共七类 + `WORKER_MANIFEST.json` + `READY.json`。

## 未运行 / 未批准
- NOT_RUN：真实 JWT/IDB/UI/DB/build/deploy/candidate。
- NOT_APPROVED：T-RP-09、PC01、PC04、PC09、D-S01-04、T-RP-12。

## 边界声明
- 未写共享台账（TASK_GRAPH/PACKAGES/DECISIONS/ACCEPTANCE/history）或其他窗口。
- 未修改业务源码、auth/client/tokenStore/会话策略。
- 未访问真实 dotenv/凭据/DB；未创建分支/worktree；未 commit/push。

## 复用证据
`RP00-T04` 矩阵 OBS-01..OBS-07 与 LR6 复核（25/25、12/12、101/101）按 hash 复用，标注 `REUSED_VERIFIED_EVIDENCE`，未重跑。

## 建议后续
由具名负责人签名 → 集成阶段汇总 C/E/F 接口 → 父任务按 TASK_GRAPH 门禁进入实施授权。
