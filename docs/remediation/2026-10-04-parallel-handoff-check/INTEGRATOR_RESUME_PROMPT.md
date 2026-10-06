# 汇总窗口：A 补正冻结后接续

只在原 A 新 amendment READY 后启动。此轮不重开 B～F。

```text
你是本批次唯一汇总执行者。请接续 SIX_WINDOWS 汇总，实际完成本轮交付、限定追加和封存后停止。不得自行修代码、重跑 worker、批准政策或启动业务任务。

ROOT：/Users/renkang/VS Code/project-management
P：docs/remediation/2026-10-01-rdpms/
Q：P/execution/parallel-2026-10-04/
S：P/execution/supplements/parallel-lr7-2026-10-04-p01/
A 新补正：S/window-a-runner/readiness-amendment-01/
本次唯一新目录 J：S/integration/readiness-resume-01/
补充依据：docs/remediation/2026-10-04-parallel-handoff-check/

本条授权仅允许 J 内新增汇总产物，并按原 INTEGRATOR.md 限定范围追加六根记录。原 integration/WAITING_FOR_WORKERS.md、所有 worker/旧 READY/旧 manifest、原证据和 Q 全保持不变。J 已存在则读取接续，不能覆盖旧运行或重复追加记录。除以下明确的技术绑定补正和新路径外，原 INTEGRATOR/COMMON_RULES/BATCH_MANIFEST 全部要求有效。

先完整读取补充 REVIEW.md、evidence/readback.json、此文件及 A 补正指令；Q/COMMON_RULES、INTEGRATOR、BATCH_MANIFEST、六任务卡；最新独立复核及原 v2 必读文件；六窗口全部交付与 A 新补正。manifest/inventory 可脚本完整解析，输出简短摘要，不逐行倾倒旧日志。

阶段一：启动门禁与技术绑定（通过前不写根记录）
1. 保存六根记录真实当前起始字节，核对 HEAD、283 受保护文件、冻结计划/审计摘要和选定输入。并行新产物不是业务漂移；发现无解释保护文件变化则停止相关汇总，不自动更新基线。
2. A 必须存在新 READY，writerStopped=true，originalWriterStoppedConfirmed=true；新 manifest 和原 A 输入逐文件一致。A 新补正替代旧 READY 作为本批次有效技术交付声明，旧件保留并绑定。如果未满足，J 内记录 WAITING_FOR_WORKERS 然后停止；不得代签 A 或抢写台账。
3. B～F 原 READY 必须 writerStopped=true，manifest 内容全部逐文件一致。逐窗口生成 J/evidence/readiness-normalization.json，绑定每个原 READY 和实际 manifest hash。机器清单 pendingApprovals 可按来源透明映射 notApproved；保留原字段和 sourceRef，未知不能变成空数组。映射只修技术协议，不是批准。
4. D 的 PENDING_SELF_EXCLUDED 明确记录 ORIGINAL_READY_NONCONFORMING。核对原 D manifest 的真实 SHA256（本复核检查点 0f7a93bd42126776409ce2ad33ce1c3d3c8f3aa7711086b767b4acd144e66d54），在新的 normalization 生成 workerManifest={pathBase:REPOSITORY,path:原真实路径,sha256:当前实际摘要}。不得改 D 原 READY 或称占位符 PASS；不得代写停写声明，停写仅引用其原 writerStopped=true。READY 引用 manifest 的哈希不属于 manifest 自引用循环。
5. B 的 make-worker-manifest.py 原来未列入其 19 条 manifest，生成新的 input-coverage.json 封存其当前路径和 SHA256，证据性质 AGGREGATOR_CAPTURED_UNSEALED_WORKER_INPUT。全部六窗口做实际文件清点，逐项保证已被新 A manifest、原 manifest 或本次新输入清单绑定；区分历史 worker 已封存项和汇总本次捕获项。不得悄悄忽略文件、改旧 manifest 或谎称 B 原 manifest 已覆盖生成器。
6. A 九路径/B strict-path 控制只读回原证据，不重跑。正常/失败预定故障的证据不足如实记录，不因摘要9/9就忽略限制。报告25/25、同步12/12、字段101/101保持引用复用说明。只进行文件/JSON/哈希/记录追加核对。

阶段二：固定汇总
7. 按原 INTEGRATOR 完成 C～F PROPOSED 材料索引、approval-bundle、CROSS_WINDOW_CONFLICTS；actor/key/generation、receipt/watermark/epoch/保留窗、missing-base/受支持客户端、ACL/最后副本等矛盾列来源、责任角色和待决定，不选生产政策。
8. J 内交付 authorization、change-summary、evidence、acceptance、rollback、task-state、handoff、REVIEW_ENTRY、resume。两处 protocol 处置、原件不合规、新绑定层、B 额外捕获、A 原摘要对应关系都准确报告。independentReview=PENDING，release=NOT_EVALUATED。材料一致性不等于业务验收。
9. 确认六根记录尚未被其他执行者更新；若已变动先读取真实证据接续，不能重复追加。本次只追加两 state 的 continuations、两 handoff 末节、两 history 各唯一订正 entry；准确 correctsRef 引用旧 lr6 registry 条目位置/ID/规范化hash。同步记录 effective A amendment 与新 normalization 引用。不得改原54/306轴、包/发现/31开放项/门禁/业务授权/activeTask/latestReviewRef/nextReadyTask。

阶段三：定稿与封存
10. 使用原规定顺序：冻结worker→定稿J与四个非history根记录追加→J/payload-manifest→J/final-integrity→两history唯一追加→预先排除的J/post-seal-readback。所有根记录和最终history引用本次 J 实际路径，不要求覆盖原 integration 根文件。
11. 路径base严格一致，不猜prefix；旧519引用B严格订正映射，区分其历史snapshot与本轮根记录新字节；封存 A 新有效 READY/manifest、B～F原READY/manifest、新技术绑定和额外输入清单。manifest排除自身/后生成final/history/readback，final排除自身/history/readback，history不嵌自身/对方最终hash。终读回检查旧记录保持、新ID唯一、所有worker未变化和每个实际路径/hash。失败不能overallPASS，不修改冻结worker；只修本次尚未定稿新交付。
12. 保留 WAITING_FOR_WORKERS.md；在新记录说明旧等待条件已由A新声明解除，不改历史正文。全部封存后停止，交付独立审阅，不进入任何业务任务。

禁止真实构建/测试/数据库/JWT/IDB/browser/生产访问；禁止安装/升级、子代理、切换模型、读SSH/dotenv凭据、记忆写入、stage/commit/push/merge/deploy/reset/clean/stash；不修worker脚本或正式测试，不自行签业务决定。

最后统一报告：门禁解除或仍阻断→A/B/D协议处置与证据层→C～F未签材料与接口冲突→六根记录追加及完整封存读回→产物链接→原36未完成任务及精确待批材料清单。只完成本轮汇总后停止，等独立审阅。
```
