# change-summary.md — 窗口 D 交付摘要

- **窗口**：D（partition `window-d-auth`），模式 `PROPOSED_APPROVAL_PREPARATION_ONLY`。
- **授权**：仅 PREPARATION_ONLY；不修改任何业务源码、会话/认证/令牌策略、共享台账或其他窗口文件（见 `authorization.json`）。
- **基线 HEAD**：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`（与 `RP00-T04` 基线一致）。
- **本次新增文件（全部位于 `window-d-auth/`）**：
  - `authorization.json`、`start-baseline.json`
  - `transport-current.csv`、`transport-current.md`（当前 transport 事实 + cookie 反证）
  - `generation-matrix.csv`（跨身份/代际矩阵，源码层与旧运行层分开，NOT_RUN 标注）
  - `decision-draft.json`、`decision-draft.md`（T-RP-09 推荐合同，`PROPOSED`，签名字段 null）
  - `acceptance-draft.csv`（真实验收草案，不以注入 actor/mock 冒充 JWT 全链）
  - `approval-request.md`、`interface-notes.md`
  - `evidence/source-facts.md`、`evidence/reused-evidence.md`
  - `acceptance.json`、`rollback.md`、`task-state.json`、`handoff.md`、`REVIEW_ENTRY.md`
  - `WORKER_MANIFEST.json`、`READY.json`
- **实际代码变更**：**无**。仅只读追踪 `auth.js / http.ts / tokenStore.ts / rbac.js / AuthProvider.tsx` 并在证据中记录行号 + SHA256。
- **未运行**：真实 JWT/IndexedDB/UI/数据库验证、build、deploy 均 `NOT_RUN`；未访问真实 dotenv/凭据/DB。
- **未批准**：T-RP-09、PC01、PC04、PC09、D-S01-04 全部保持 `PROPOSED`/`PENDING`；签名 null。
- **复用证据**：`RP00-T04/evidence/auth-generation-matrix.json` 的 OBS-01..OBS-07 作为权威静态矩阵复用，本轮仅以当前行号/哈希重新核对，未重跑（标注 `REUSED_VERIFIED_EVIDENCE`）。
