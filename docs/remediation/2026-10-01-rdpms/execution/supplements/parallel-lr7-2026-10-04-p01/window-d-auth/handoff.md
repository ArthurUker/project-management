# handoff.md — 窗口 D 交接

## 本窗口范围
为决策 `T-RP-09`（认证 transport 及跨身份响应）准备可审批材料。父任务 `RP00-T04`（已 IN_PROGRESS/静态完成）、`RP02-T02`、`RP03-T01`、`RP11-T01`（均 NOT_STARTED）共享该决策。联合合同 `PC01`、`PC04`、`PC09`。

## 交付物（均位于 `window-d-auth/`）
- 当前 transport 事实：`transport-current.csv` / `.md`（含 cookie 反证、行号、SHA256）。
- 跨身份/代际矩阵：`generation-matrix.csv`（两 tab、切用户、logout、迟到成功/失败、refresh 竞争、原请求重放；源码层与旧运行层分开，NOT_RUN）。
- T-RP-09 推荐合同：`decision-draft.json` / `.md`（`PROPOSED`，签名字段 null）。
- 验收草案：`acceptance-draft.csv`（真实合法 token 前提，两身份/两 tab 正负例，不以 mock 冒充 JWT 全链）。
- 批准请求 + 接口说明：`approval-request.md`、`interface-notes.md`。

## 不代签 / 不越界
- 未修改 auth/client/tokenStore/会话策略或任何业务源码。
- 未批准 D-S01-04、T-RP-09、PC01/04/09、T-RP-12。
- 未写共享台账或其他窗口；未运行真实 JWT/IDB/UI/DB/build。

## 接续方所需输入
1. 具名安全/认证/前端负责人就 cross-tab 协调、single-use/family 语义、generation fence 形态做出选择。
2. 具名审批人登记受支持 transport/客户端、兼容窗口、残余风险、批准日期/证据。
3. 集成阶段汇总 C（actor/key）、E（兼容窗口）、F（缓存 generation）接口点；如 D-S01-04 获批需回写 access TTL 兼容表述。

## 复用证据
`RP00-T04/evidence/auth-generation-matrix.json`（OBS-01..OBS-07）与 LR6 复核（25/25、12/12、101/101 按 hash 复用）已标注 `REUSED_VERIFIED_EVIDENCE`，未重跑。

## 状态
- `independentReview=PENDING`，`release=NOT_EVALUATED`。
- 父任务实施/验证：`NOT_RUN`。
- 写 `READY.json` 后停止本窗口写入。
