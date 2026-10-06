# 六窗口交付门禁复核（2026-10-04）

## 裁定

`AGGREGATION_BLOCKED_DELIVERY_PROTOCOL`。汇总窗口保持 WAITING_FOR_WORKERS 并停止是正确的；其“只缺 A 的 writerStopped、D 的占位符合规”判断不完整。

本次仅核对交付协议、文件哈希、冻结输入和真实台账。不做业务修复，不重跑 runner、模拟控制、构建或真实数据库，不裁定 C～F 的推荐政策。

## 已确认的问题

| ID | 等级 | 文件/位置 | 事实、影响与建议 |
|---|---|---|---|
| PH-01 | P2 交付 | S/window-a-runner/READY.json；WORKER_MANIFEST.json.files | READY 缺 batchId/windowId/scope/workerManifest/actualResults/notRun/pendingApprovals/independentReview/release/writerStopped。已有 manifest 11 条均匹配，但 A 目录共 843 文件，除原 manifest/READY 外还有 830 文件未列入，包含 controls 原始日志和历次 attempt。补一个新 amendment，完整绑定原文件，保留旧字节，由原 A 执行窗口声明停写。 |
| PH-02 | P2 交付 | S/window-d-auth/READY.json.workerManifestSha256 | PENDING_SELF_EXCLUDED 不是真实哈希。manifest 排除自身和 READY，随后 READY 引用定稿 manifest 哈希不构成循环。D 的 18 条原文件匹配；可由汇总窗口生成新技术绑定记录，保留原件 NONCONFORMING，不改 D 或假称原声明通过。 |
| PH-03 | P3 交付 | S/window-b-paths/WORKER_MANIFEST.json.files | 19 条原文件匹配，但目录中的 make-worker-manifest.py 未封存且无排除说明。在汇总新输入清单封存其当前字节，标 AGGREGATOR_CAPTURED_UNSEALED_WORKER_INPUT，不称旧 workerManifest 已覆盖。无需改脚本或重跑。 |
| PH-04 | P3 协议兼容 | Q/BATCH_MANIFEST.json.readyProtocol.requiredFields；Q/COMMON_RULES.md §5；六份 READY | 机器清单明确 pendingApprovals 字段，共同指令采用“未运行/未批准”的描述；B～F 用 notApproved，A 两者都无。汇总可逐来源规范化 notApproved → pendingApprovals，保留原件及转换来源；未提供的内容不能填空数组冒充无待批。 |

S = docs/remediation/2026-10-01-rdpms/execution/supplements/parallel-lr7-2026-10-04-p01/；Q = docs/remediation/2026-10-01-rdpms/execution/parallel-2026-10-04/。

缺少 writerStopped 是缺少正式停写声明；不能据此断定某进程仍在运行。A 的声明必须由原执行窗口补充，汇总不得代写。

## 核对结果

- HEAD：138cf2da1b63195cef7e884f69bdf8ded6ed3c21。
- 283 个受保护文件与 BATCH_MANIFEST 基线逐文件一致，含六根记录；冻结计划 2335 文件规范摘要一致；两旧审计目录 12/136 文件摘要一致。
- 六窗口共 938 文件；已有 manifest 所列 95 个文件全部匹配。A/B 未列入清单的文件数分别 830/1；C/D/E/F 除自己的 manifest 和 READY 外无遗漏。
- A 已有九行模拟控制摘要记录正常 0、八失败路径 1；本次只读取，不称独立重新验证或业务通过。evidence 与 controls 下存在来自不同执行 attempt 的摘要，补正应明确原记录对应关系，不能覆盖历史或按“最新”猜测。
- integration 当前仅 WAITING_FOR_WORKERS.md；没有已完成的汇总封存产物。
- 54 任务仍为实施 18 COMPLETE / 2 IN_PROGRESS / 34 NOT_STARTED；未完成实施 36。验证 10 PASS / 37 NOT_RUN / 7 ENV_BLOCKED；54 发布均 NOT_EVALUATED。

完整路径、实际哈希、遗漏列表和读回结果见 evidence/readback.json。

## 最短接续路径

1. 只重启原 A 窗口，按 A_READY_AMENDMENT_PROMPT.md 追加交付协议补正，不重跑、不改旧件。
2. A 新 amendment 停写后，仅重启汇总窗口，按 INTEGRATOR_RESUME_PROMPT.md：新技术绑定解决 D/字段兼容；新输入清单覆盖 B 遗漏；按原规则完成跨窗口材料汇总、六根记录限定追加与最终封存。
3. 汇总交付后停止，等待独立审阅。C～F 仍为未签方案，不能据此启动受门禁约束的业务修复。

本复核不修改旧指令、worker 文件、根记录、业务状态、任何决定或记忆文件。新文档放在原计划目录之外，避免改变 Q 的冻结计划树摘要。
