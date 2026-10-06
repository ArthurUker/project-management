# Luna 修复结果独立复核 — 2026-10-02

## 结论与范围

已有修复可以继续推进，但目前不能宣称整包、整项修复验收或整体修复完成。确认一项登录锁定回归、一项响应状态不一致、两项输入校验缺口、两项测试夹具问题，以及选包和状态汇总问题。优先在原子任务范围内返工 RP02-T01，然后补齐 RP01-T01 / RP04-T02 的标量校验、修正 RP05-T01 的测试夹具。新的标准任务优先 RP08-T01，范围不包括未批准的注册项目全局例外。

本轮是审阅及补证，没有业务源码修复、依赖安装/升级、提交、部署或真实账号操作。未改变执行账本、决策批准状态、冻结审计目录和旧发现编号。审阅发现以 LR-01～08 单独登记，原 32 条 SUPPORTED 和 1 条候选记录不自动增删或关闭。

当前 HEAD 为 `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`；修复位于未提交工作区，因此使用源码 hash 和 diff 对应具体版本。最新执行版本 `execution-2026-10-02-r16` 的 7 项摘要全部匹配，见 [input-snapshot.json](evidence/input-snapshot.json)。B17 当前 roles.js 摘要与其原本地验收记录一致。冻结审计证据仍只证明原缺陷。

## 进度的正确解释

| 任务实现轴 | 数量 | 含义 |
|---|---:|---|
| COMPLETE | 15 | 9 个代码子任务 + 6 个准备/证据交付任务 |
| IN_PROGRESS | 3 | RP13-T02、RP15-T01、RP19-T04 |
| NOT_STARTED | 36 | 包括 2 个尚未批准激活的可选子任务 |

因此仍有 **39 个子任务未实现交付完成**；已交付任务中另有返工及验收欠项。两项可选扩展 RP01-T03 / RP05-T03 应保留未激活状态，不能因“全部完成”要求自行批准。

本次复核前任务验证记录为 PASS 2 / ENV_BLOCKED 12 / NOT_RUN 40；PASS 两项是 RP01-T01 的本地角色创建验收及 RP00-T02 的静态补审，含义不同。所有 54 个任务发布状态均 NOT_EVALUATED。本次补证附在独立审阅目录，未直接把执行账本改为 PASS。

## 实际运行的验证

使用两个分别新建的自有临时 PostgreSQL 集群，仅监听 127.0.0.1，随机端口、私有 dotenv、唯一测试数据库名、合成账号及自有临时文件。执行原 DB guard 的 reset/drop，未读真实 env、未复用旧审计库、未绕过 guard。DB 真正迁移并 seed 后验证行及关系。所有库、集群、临时目录和本轮自有 dist 均已清理，退出码和清理结果见两个 validation-results.json。

现存前端 TypeScript 5.9.3 可以在本地构建后端，版本符合后端声明的 ^5.9.3。本轮通过 PATH 指定已存在的编译器，没有安装或更新依赖。后端 npm build 和前端 tsc --noEmit 通过；这解除本轮定向后端验证的编译障碍，不能替代 PC09 candidate 配置/目标环境验收。前端账号切换运行测试未执行，fake-indexeddb 仍缺失。

| Suite | 通过/总数 | 退出码 | 裁定 |
|---|---:|---:|---|
| B17 role create | 6/6 | 0 | 原角色创建目标有真实本地成功证据；更宽标量DTO仍有LR-03 |
| RP02 login lock TTL | 2/6 | 1 | 4条失败均来自审计actor清理；另有补证确认LR-01/02 |
| RP04 project snapshot active | 3/3 | 0 | 定向旧字段/活跃查询路径通过 |
| RP04 project create aggregate | 2/2 | 0 | 合法聚合与失败无部分提交通过；LR-04额外负例失败 |
| RP05 parent/delete guard | 2/4 | 1 | 两fixture未达到目标guard；修正请求体补证确认保护生效 |
| RP07 shared project status | 4/4 | 0 | 定向HTTP/sync共享状态路径通过 |
| RP13 stable pull pagination | 2/2 | 0 | 固定数据集分页覆盖通过；不是提交可见水位证明 |
| RP14 infected file read | 2/2 | 0 | 合成clean/infected文件及拒绝审计通过 |

总计 29 条，23 PASS / 6 FAIL。测试通过范围以实际 suite 断言为界，不等于所有 AC/PAC/跨包合同通过。角色/项目/文件/sync部分用合成鉴权上下文和权限中间件；不能据此宣称全局登录/JWT中间件已验收。登录补证使用真实 bcrypt 和实际登录路由。

命令、退出码、日志：[首次运行](evidence/validation-results.json)、[补充运行](evidence/supplemental-run/validation-results.json)、[测试摘要](validation-summary.json)。日志是实际存在的文件；rg 默认忽略 .log 不能解释为证据缺失。补证脚本退出0表示成功采集并确认所写断言，其中500/未锁定是缺陷证据，不是产品验收成功。

## 确认问题

### LR-01 / P2：待激活账号密码失败阈值不再锁定（修复回归）

位置：`backend/src/routes/auth.js:143–168`。登录失败计数更新允许 PENDING_ACTIVATION，但写锁定条件只接受 ACTIVE/LOCKED。实际第5、6次错误密码都401；真实行计数6、状态PENDING_ACTIVATION、lockedUntil=null。同一隔离环境运行原HEAD的auth路由，第5次已持久化LOCKED及期限。这里只证明阈值锁失效，不证明凭据校验或DISABLED保护绕过。

建议在 RP02-T01 内恢复临时锁定保护，保留既有激活语义；若不改变待激活状态，lockedUntil也必须独立生效。不能以开启账号作为锁定恢复方式。验收应包含四种账号状态、阈值、期限内正确/错误密码、到期及并发，核对真实行和审计locked值。

### LR-02 / P2：锁定到期登录响应仍返回LOCKED

位置：`auth.js:207–219,250`。条件更新已把行恢复ACTIVE，响应继续用更新前user。实际登录200、DB ACTIVE、响应user.status LOCKED。建议使用更新后的行构造响应；验收响应与DB一致，并保持并发禁用保护。本轮未证明权限升级。

### LR-03 / P2：角色DTO非字符串输入产生500

位置：`roles.js:102–114`。先证明合法角色201/isSystem=false，再提交 code 数组及 name 数组，均抵达Prisma并500。code正则会隐式转换数组，name仅有truthiness检查。建议显式验证 code/name/description 类型、空白及界限，先于ORM；保留全局code黑名单、专属白名单及系统/关系注入保护。原B17合法创建修复有证据，本补充缺口不能据此关闭或重开所有RBAC发现。

### LR-04 / P2：嵌套任务输入在检查类型前规范化

位置：`projects.js:108,173–179`。applicability对象在 toUpperCase 时抛异常；合法认证上下文下返回500，项目真实计数0→0。建议在规范化前检查原始标量类型，补400负例及聚合无残留断言。这是拒绝输入合同缺口，不是已修复事务再次部分提交。

### LR-05 / P2：RP02 afterEach 与append-only审计冲突

位置：`tests/integration/rp02-login-lock-ttl.integration.test.mjs:18–22`；初始化迁移 SQL 的 actor FK ON DELETE SET NULL（1460）及禁止UPDATE/DELETE触发器（1533）。删除写过审计的合成用户会间接更新审计行，真实数据库拒绝。应保留actor至整库drop、每例唯一标识；不得关闭审计触发器或删除审计记录来获得绿色结果。4条清理失败本身不等于4个业务断言失败。

### LR-06 / P2：RP05 fixture 先触发NO_VALID_FIELDS

位置：`rp05-parent-delete-guard.integration.test.mjs:84,137` 和 `projects.js:440–443`。仅 tasks:[] 未命中项目scalar白名单。加入合法 name 后，无删除权限403、跨项目子任务400/CROSS_PROJECT_CHILD_EXISTS，父任务及外部子任务均保留。建议修fixture并全套复验；不要放宽批量赋值保护来适配错误测试。

### LR-07 / P1（执行排期）：条件门禁导致独立安全任务漏执行

RP08-T01 的 D-S01-05 仅在“请求注册全局例外”时生效；普通实体/字段/own-only授权可现在实施。RP10-T02 的 D-S01-07 仅在改变source-state时生效，报告快照/版本原子性可保持原状态规则实施；RP09-T01是其验收依赖。RP13-T02 的T-RP-04/T-RP-10及barrier条目是VALIDATION门禁，未签署ADR和自有PG证据可先完成。不能把它们当作所有后续工作被阻塞的证明。

严重度指向未推进P1授权防护的排期风险，不是新增生产攻击结论。完整条件裁定见 [task-readiness.json](task-readiness.json)。

### LR-08 / P2（记录）：多个账本未一致聚合

IMPLEMENTATION_STATE 的 nested allowedTaskIds、top-level authorizedTaskIds为不同子集；execution/state 的包清单漏 RP13/14/15/17，部分总体包状态仍NOT_STARTED；activePackage停在RP15而next指向RP13。用户授权及逐任务授权存在，因此不把摘要缺项说成越权。下一轮应按真实逐任务证据统一汇总，保留实现/验证/发布三轴，并追加本轮复核引用。不要修改历史证据使其迎合新hash。

## 尚未证明或本轮未覆盖

- RP05 的并发父引用插入/删除、稳定ID、软删除父引用、周期/DAG及存量数据，仍属于后续合同及RP15；本轮guard测试不覆盖。
- RP13 固定窗口keyset测试不证明事务提交顺序、水位、ACL撤销/新增授权回填。B04同步实体权限未由分页修复解决。RP11验收依赖及真实IDB账号切换测试仍未通过。
- RP14 legacy原文件无FileObject扫描元数据路径、FAILED/SKIPPED/elevated语义仍需T-RP-05；不能把两条测试解释为所有文件策略完成。
- RP17已有本地FS脚本证据使用macOS rsync、GNU mv替身及fake pg工具，未代表目标Linux、并发run锁、metadata-only硬链接语义、配对保留或真实恢复通过。本轮未重复该演练。
- RP04-T02 的RP09/PC03联合验收未完成。RP15实际异常数量、已部署支持客户端版本、运维备份协调、Linux目标及发布runbook没有由合成库代替。
- R12-N01仍为PENDING候选；31个旧开放项不因本复核关闭；目标环境、提交、部署均未验收。

后续顺序及可复制执行约束见 [NEXT_EXECUTION.md](NEXT_EXECUTION.md)。
