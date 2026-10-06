# CLOSE-03 变更摘要（唯一版本 ID + 无循环封存）

## 1. 订正对象（旧条目保持冻结，只追加订正 entry）

| registry | 旧条目位置 | 旧 ID | 规范化 SHA256 |
|---|---|---|---|
| `REVISION_HISTORY.json` | `versions[24]`（0 基） | `post-2026-10-03-codebuddy-supplements-independent-review` | `b200dc2b…cd9d` |
| `EXECUTION_REVISION_HISTORY.json` | `entries[15]` | `EXEC-test-contract-rework-2026-10-03-cb1` | `c98c21de…c797` |

旧问题是：`versions[24]` 重复了 `versions[23]` 的 version ID（旧 executor entry 与独立审阅 entry 同名），
`entries[15]` 为旧执行会话 entry；两者都不能只靠重复 ID 定位。

## 2. 本轮做法

- 两个 registry 各追加**唯一**新 entry，写入 `correctsRef`（数组下标 + 旧 ID + 旧条目规范化 SHA256 + 旧 session 路径），
  并携带 `sessionId`；追加前该 ID 出现 0 次，追加后为 1 次（读回校验）。
- 不再把两份 history 的最终 SHA256 写进它们所封存的文件：`payload-manifest.json` 与 `final-integrity.json`
  都排除 `REVISION_HISTORY.json` / `EXECUTION_REVISION_HISTORY.json`（以及自身与 `post-seal-readback.json`）。
- 两个 history entry 引用**已封存**的 payload-manifest / final-integrity / 当前测试 hash（含 pathBase），
  且**不含**自身或另一份 history 的最终 hash，避免自引用/交叉循环。
- `post-seal-readback.json` 作为预先声明的 POST_SEAL_READBACK 附件，记录两份 history 的**真实最终 hash**、
  唯一 ID、旧 entry 保持、逐文件读回一致与四项结果；不被已封存的 payload/final-integrity 包含。

## 3. 读回

`evidence/payload-manifest.json` 逐文件记录 required deliverables / runner / controls / logs / 当前测试 /
四个非 history 记录的 SHA256 与 pathBase；`final-integrity.json` 封存 payload-manifest hash 与保护文件一致性；
`post-seal-readback.json` 做最终逐文件读回。三者与两份 history 的读回结果见各文件。

## 4. 未做

- 未改写任何旧 entry、未删除旧证据、未用 `APPENDED_*` / `SESSION_DIR` 之类占位符。
- 未改变原 54/306 轴、包状态、批准或门禁。
