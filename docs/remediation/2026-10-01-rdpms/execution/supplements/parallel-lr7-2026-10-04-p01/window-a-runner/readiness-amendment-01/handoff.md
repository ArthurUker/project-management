# 交付说明（readiness-amendment-01 → 汇总窗口）

## 本补正性质
原 A 的交付协议补正，新增于 `readiness-amendment-01/`（N）前缀；原 A 全部 843 文件字节不变，旧 READY / 旧
WORKER_MANIFEST 哈希与 `REVIEW.md` readback 一致。

## 新 READY.json 关键字段
- `batchId = parallel-lr7-2026-10-04-p01`
- `windowId = A`
- `status = READY_FOR_AGGREGATION`
- `scope`：`DELIVERY_PROTOCOL_AMENDMENT_ONLY`（仅交付协议补正，非产品返工）
- `workerManifest`：`{ pathBase: "REPOSITORY", path: <新 manifest 仓库相对路径>, sha256: <新 manifest 哈希> }`
- `actualResults`：九路径均为 `REUSED_EXECUTOR_SIMULATED_EVIDENCE`（实际动态运行 0）
- `notRun`：runner/控制重跑、build、tests、数据库、浏览器
- `pendingApprovals`：仅工具范围内交付协议字段补齐；无该任务业务门禁待批，未扩大为系统全部决定已批准
- `independentReview = PENDING`
- `release = NOT_EVALUATED`
- `writerStopped = true`
- `supersedesReadyRef`：原 READY 路径 + 实际哈希 `5cf841b3ac343738809f1486e7af337862c541a9cf103ba7ad6cfe0897f49578`
- `originalWriterStoppedConfirmed = true`

## 新 WORKER_MANIFEST.json
- `pathBase = REPOSITORY`，`files` 以真实仓库相对路径为键，逐项完整 SHA256，逐文件读回。
- 绑定：原 A **843** 冻结输入（含 `controls/` 全部原始日志与历次 attempt、原 READY、原 manifest）+ 本次 N **8**
  个静态产物（排除新 manifest 自身与新 READY）。
- 旧 READY、旧 manifest 一并绑定并记 `supersedesReadyRef` / `originalManifestRef`。

## 交接给汇总窗口
- 请汇总窗口读取 `N/WORKER_MANIFEST.json` 与 `N/READY.json`，核对 SHA256，纳入 `state.json` 聚合。
- 按 PH-02/PH-03/PH-04 处理 D / B 等其余窗口字段/绑定兼容（不在本补正内）。
- 九路径证据为复用原执行者模拟控制证据，非独立重验/产品验收；如汇总需重新执行验证，应另开受门禁约束的验证任务。
- 本补正未封存、未选其他任务、未替汇总窗口封存；未批准任何业务政策。
