# Exact resumption order

本session已交付RP09-T01/T02，停止本run编辑等待独立复核。两任务scope本地COMPLETE/PASS；RP09包IN_PROGRESS；CI FAIL；target/joint NOT_RUN；release NOT_EVALUATED。

## Read in order

1. REVIEW_ENTRY.md → SESSION_SUMMARY.md → approval.json/authorization.json。
2. 两任务runs/2026-10-05-sync-receipts-01/acceptance.json及validation-addendum/acceptance.json；后者绑定最终源码与CI失败边界。
3. evidence/final-source-hashes.json → evidence/final-validation-index.json → evidence/regression-classification.json。
4. 当前源码两模块/路由/新增schema迁移、30+22正式测试；读取实际最终run-results和suite.log，不能只依摘要。
5. evidence/final-consistency-check.json → evidence/payload-manifest.json → final-integrity.json → post-seal-readback.json → READY_FOR_REVIEW.json。
6. task-readiness.json /remaining-task-readiness.csv /next-actions.md，再读原计划当前TASK_GRAPH/DECISION_REGISTER/IMPLEMENTATION_STATE及下一具体任务卡。

## Known limits

19旧协议断言失败，现有前端尚不支持预约，不能发布或把新测试视为旧CI迁移。没有客户端IDB/目标/实际保留任务验收。早期attempt未逐一存源码字节；原失败日志保留，不倒填。语义负对照3fail是坏写入被发现，非产品通过。

剩余30=28必需+2可选。已签两RP09批准无须重复批准；其它决定只能在具体范围与方案确定后使用。不要改冻结审计、原run、旧history entries；不直接选择或激活未就绪任务。

## Resources

20个owned run整库guard drop/cluster stop均0；原临时根与backend/dist现不存在。新Prisma client派生缓存留存，现有依赖版本不变。HEAD不变，既有工作区差异保留；没有stage/commit/push/merge/deploy或生产访问。
