# evidence/reused-evidence.md — 复用的既有证据

本窗口为 PREPARATION_ONLY，不重跑任何动态套件。下列证据按 COMMON_RULES §4 复用，明确标注 `REUSED_VERIFIED_EVIDENCE`，不伪称本轮重跑。

## 1. RP00-T04 静态认证矩阵（权威）
- 来源：`docs/remediation/2026-10-01-rdpms/execution/RP00/RP00-T04/evidence/auth-generation-matrix.json`
- 内容：OBS-01..OBS-07 当前源码观察；`proposedContractForNamedApproval`（T-RP-09）七项要求；`dynamicValidationPlan`（INT-PC01-01，状态 NOT_RUN）。
- 复用方式：本窗口 `transport-current.*` / `generation-matrix.csv` 以该矩阵为权威，并以当前文件 SHA256/行号重新核对，未重跑。

## 2. 复核 LR6 收尾（2026-10-04-codebuddy-lr6-closeout）
- 报告 25/25、同步 12/12、字段 101/101 已独立接受并按 hash 复用（validation-summary.json）。本轮不重跑，也不引用其为“本次重跑”。
- 独立复核裁定：`SCOPED_ACCEPTANCE_WITH_TWO_REQUIRED_CORRECTIONS`；业务轴（54/306）未变；independentReview=PENDING、release=NOT_EVALUATED。
- CONTRACT_ERRATA.md：SUPER_ADMIN 非成员 404 的角色限定（阶段政策 CONTRACT_UNRESOLVED，不批准阶段过滤）。

## 3. 旧运行证据（R02）
- `docs/audits/2026-09-30-review-plan/execution/R02/review.md` 记录的两次 successor、陈旧失败清理等；本轮仅作为“旧运行层”引用（标注 `OLD_RUN_REF`），不重跑。

## 4. 未运行（NOT_RUN）声明
- 真实 JWT 全链、IndexedDB/UI、数据库、build、目标环境、部署：均未运行。
- 不修改 auth/client/tokenStore/会话策略；不访问真实 dotenv/凭据/DB。
