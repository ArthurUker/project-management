# T-RP-09 认证代际修复交付

## 本轮实际完成

用户“批准，都批准，你按照最佳计划直接执行”登记为批准已提出的 T-RP-09-STRICT-LINEAGE-V1 全部条款。批准人郭仁康/研发副总监沿用具名来源；仅两个明确申请任务，不扩大到未定义业务政策。本地连续实施授权已具备，未重复申请。

- RP02-T02：refresh 条件单次消费、同family successor、严格审计同事务。账号锁顺序和准入保持；消费后的插入/审计故障整体回滚；并发败者明确401且不吊销赢家；TTL按JWT实值。
- RP03-T01：单一版本化会话信封、发起actor/loginGeneration/tokenRevision、跨标签页refresh协调、短写锁、迟到响应/资料/logout围栏。只能同登录原请求一次重放。真实无效当前refresh条件清理；重放/网络/提交回包丢失保留数据并要求显式登录；缺Web Locks/storage使用隔离内存并停用自动refresh。
- 两任务实施COMPLETE、本地validation PASS；RP02的原交付保留，客户端验收依赖通过后另追加joint-validation，不改原task-state/history哈希。RP02/RP03整包与广义PC01仍IN_PROGRESS/未联合关闭；独立复核PENDING、目标NOT_RUN、release NOT_EVALUATED。

## 变化边界

本轮业务文件仅：backend/src/routes/auth.js；frontend/src/auth/tokenStore.ts、api/http.ts、auth/AuthProvider.tsx、api/endpoints/auth.ts。auth endpoints条件路径由实际login/refresh/public分派及logout原Bearer调用链激活。新正式测试两份：rp02-t02-acceptance.integration.test.mjs与rp03-t01-acceptance.test.ts。

新浏览器页面/服务端探针/运行器只在自有本session目录，未写入业务路由；DB真实认证而非注入actor。未改users/rbac、schema/migration、IDB/outbox/缓存、原正式测试、依赖或部署配置。保护既有dirty worktree，不stage/commit/reset/clean/stash。

## 实际验证

|层次|套件|结果|
|---|---|---|
|真实私有Postgres + 真实密码登录/JWT/Bearer|新后端refresh验收|11/11|
|真实私有Postgres定向回归|原登录锁定|12/12|
|受控axios适配器/storage/lock单元|前端身份代际|20/20|
|真实同源Chrome双tab、当前AuthProvider、真实JWT/HTTP/Postgres|联合浏览器|9/9（10条case记录，资料/logout在同一用例）|
|原后端单元/契约|13个文件|93/93|
|8套原后端集成回归，各套件独立库|回执/并发POST/同步拒绝重试/写授权/版本访问/同步读取/报告快照/角色创建|68/68|

所有选定最终运行合计213个Node测试PASS；这不是213条产品验收或306矩阵全覆盖。backend build/typecheck/undefined/diff-check均0；前端TypeScript与esbuild候选bundle0，无dotenv读取。没有运行完整Vite目标配置构建或fake-indexeddb现有测试（依赖未安装），不安装/升级。浏览器用新profile，运行真实候选AuthProvider的最小页面，不冒充完整业务UI或目标部署。截图已读回看到合成B authenticated。

真实DB核对refresh旧行消费、successor/family、audit、错误回滚、expiresIn，以及浏览器protected探针实际mutation actor；迟到A请求从未借B写入。真实CDP在后端200/数据库提交后丢弃refresh回包，确认客户端停止自动重试并显式密码登录恢复。last-copy为合成本地标记，不能据此宣称完整IDB/outbox通过。

普通双tab请求只刷新一次；另一个旧败者实验明确使用不受浏览器锁协调的真实HTTP竞争者，不冒充普通锁流。为控制迟到/me实验，owned Chrome关闭HTTP cache；仍共享真实origin/storage/Web Locks。

## 失败尝试与资源

- 后端首attempt10/11为夹具在user锁后等待logout审计FK造成阻塞；屏障前移到真实actor锁边界后11/11。
- 浏览器attempt01/02为合成username/不存在权限夹具；03/04为屏障信号辅助代码误调Promise.resolve；05为held/me的浏览器HTTP-cache队列，disable cache后06 8/8，追加实际commit-loss后07 9/9。全部保留。
- 前端首次typecheck拦截器参数放错位置exit2，修正后两次20/20与类型检查0。
- B17首回归只因临时DB前缀与其严格rdpms_test_rp01_要求不匹配而失败；新自有runner仅改生成前缀，保留guard/随机唯一/隔离/清理，第二attempt7/7。没有改测试或放宽guard。
- 20次自有PG尝试均guard drop0/stop0/根与dist移除；5个实际Chrome profile退出0/已移除、服务器关闭。无接管用户Chrome/真实账号。2364个冻结审计/旧证据文件逐字节零漂移；原history条目与handoff字节前缀保留。
- 起始内容hash仅覆盖5个改动业务文件和2364冻结证据；不虚称整个其他live源码逐文件起止全覆盖。git status与当前任务before/diff均保留。

## 最新统计

54任务：22 COMPLETE / 2 IN_PROGRESS / 30 NOT_STARTED；validation14 PASS /33 NOT_RUN /7 ENV_BLOCKED。306验收84 PASS /197 NOT_RUN /25 ENV_BLOCKED。剩余32=30必要+2未激活可选。直接待精确scope决定12，实施依赖待完成16，owner只读数据1，最终结项1，可选2。其它18条决定未擅自批准；B15/N-R02-01及31历史开放项不整体关闭。所有release NOT_EVALUATED。

S02-OPEN-05新增本地真实浏览器executionResolution；历史auditStatus/status保留OPEN。本地实验满足当前候选门禁，不等于历史/目标/其它browser支持完成。

## 接续

读本summary → approval/authorization → 两任务acceptance（RP02原交付+joint-validation）→ frontend/browser bindings与最终日志 → final-scope-and-cleanup → task-readiness/remaining-inputs。下一优先是T-RP-02精确回执合同，其后水位/撤权缓存；保留原按条件scope门禁。没有满足门禁的READY_STANDARD，所以不扩做未批准任务。

## 辅助调试证据补充限制

早期本会话夹具源码每版/辅助截图未逐次保存；最终绑定只覆盖最终attempt-07。原失败命令/日志/JSON保留，旧计划/原run/审阅冻结零漂移。详见evidence/historical-fixture-limit.md；不把当前源码/截图倒称早期失败字节。
