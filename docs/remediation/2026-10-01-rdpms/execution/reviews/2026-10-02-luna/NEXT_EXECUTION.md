# 后续执行顺序和严格接续要求

本文件是独立复核建议，不修改 v2 依赖图、不批准产品/安全/数据/技术决策，也不授权提交/部署。每轮一个实质代码子任务，沿用用户既有本地授权及 EXECUTOR_PROMPT。旧产物冻结，新运行结果追加到对应任务的新run目录。

## 1. 先返工并补齐已交付任务

| 建议轮次 | 原任务 | 精确范围 | 退出条件 |
|---|---|---|---|
| A1 | RP02-T01 | LR-01待激活阈值锁、LR-02过期锁响应；修LR-05测试清理。先修这个登录回归 | 所有账号状态、期限、成功响应、并发计数及真实审计行有证据；套件退出0，未激活会话新政策 |
| A2 | RP01-T01 | LR-03 code/name/description显式标量DTO | 合法创建、重复、非法及类型负例、真实行/关系检查通过；全局code黑名单保留 |
| A3 | RP04-T02 | LR-04原始嵌套标量先验证后规范化 | 合法聚合成功，类型/枚举/日期400且无残留；RP09/PC03联合验收仍单独挂起 |
| A4 | RP05-T01 | 只修LR-06可达fixture并重跑；无证据需要的业务改动不实施 | 原四条全绿，拒绝原因与目标guard一致，真实父子行保持 |

A1 可同轮修其必要测试清理，这是同一子任务的验证工作，不是另一个业务任务。不得顺手做refresh、账号等级、强制改密或会话失效。每轮先登记允许文件/自有资源/合法前提，必要的源码变化记录hash，追加而不覆盖旧失败日志。LR-08账本聚合更正是准备工作，但不能把失效验收伪装成历史PASS。

现有前端编译器可作为本地定向后端验证工具：确认版本和PATH，使用 `npm run build`。不得借此宣称后端独立安装流程或目标candidate配置已通过。所有DB验证继续新建自有随机命名数据库，走guard，禁止复用固定审计库或真实dotenv。缺前端fake-indexeddb时保留ENV_BLOCKED，不能mock代替IDB验收，也不能未经授权升级依赖。

## 2. 无需额外业务批准的下一标准范围

1. **RP08-T01**：同步实体/字段/own-only读权限矩阵、请求实体集合和实际行投影；不请求或开启注册全局例外。D-S01-05在该范围记NOT_APPLICABLE并解释原因。验证应建立成员/非成员、不同角色、reports own-only、零权限和elevated合法夹具，再断言响应中具体数据不存在；不能用401/空全局库替代授权拒绝。
2. **RP10-T02**：同一事务revision的报告快照、version分配和变更一致性；保留现有submit/resubmit来源状态，不引入D-S01-07政策。实施可先行；需要RP09的联合验收继续NOT_RUN，不关闭整包。并发屏障、DB version/snapshot字段以及回执重放要分别核对。
3. **RP13-T02**：继续未签署ADR，运行自有PG barrier，区分序列分配、提交可见、分页窗口以及epoch；给出可审查方案和失败反例后，才交T-RP-04/T-RP-10负责人裁定。没有签署不激活RP13-T03，不自选生产水位方案。

若继续选择“没有下一任务”，必须列出每个候选的implementationDependencies、before阶段和condition实值；只列PROPOSED/PENDING不足以证明全部阻塞。RP19-T04放最终收口，避免反复生成中间对账替代实质修复。

## 3. 按受影响范围准备批准，不能执行者代签

| 优先合同/决定 | 应提供给负责人审核的具体内容 | 批准后可推进的任务链 |
|---|---|---|
| D-S01-01，D-S01-02仅需强制改密范围时 | actor/target等级、等高账号禁用/重置/恢复、紧急流程；另列mustChangePassword端点allowlist | RP01-T02；D02未批准不阻断已批准rank-only范围 |
| T-RP-09 + T-RP-12 | 当前Bearer/body-refresh合同、actor/generation/两个tab成功失败；quarantine/conflict/最后副本保留/恢复操作 | RP03-T01、RP02-T02（RP03是验收依赖）、RP11-T01；继而按T-RP-01做RP11-T02、按T12做RP11-T03 |
| T-RP-02 | actor/resource/command/key/hash、同key异payload、unknown/expired、回执保留及500各失败点状态 | RP09-T01非delete范围 → RP09-T02；与RP04/RP10/队列做PC03联合验收 |
| T-RP-03 + S03-OI-09 | 获负责人确认的支持客户端版本/旧版窗口，字段/status/assignee revision全链，409及missing base规则 | RP10-T01；当前源码矩阵不代替已部署支持端清单 |
| T-RP-11 | 数据库锁/timeout/重试、body/IDB quota、文件系统容量、并发备份数及目标平台预算 | RP12-T01；依赖满足后RP12-T02；RP17-T02；RP15相关任务仍需数据政策 |
| T-RP-04 + T-RP-10（先barrier） | 提交可见水位/bootstrap/RESET/ACL、dataset epoch、restore后的session/receipt/cursor/草稿保全 | RP08-T02（还需T12及RP11联合验收）→ 依赖RP09/RP11/RP13-T02就绪后RP13-T03；RP16-T03/RP19-T02 |
| D-S01-05，D-S01-06 | 注册各入口各字段read/write边界；manager是否必须成员、转移及成员角色原子性 | RP06-T01、RP07-T02 → RP06-T02；OI07复用同一D06批准 |
| D-S01-07 | 具体报告来源状态/重提表及并发审核行为 | RP10-T03；不反向阻断保持现状的RP10-T02 |
| D-S01-08 + T-RP-07 | live/same-project/parent/dependency/phase、软删/恢复/stale-delete/重复墓碑、迁移处置 | RP05-T02；RP15-T02/T03（需实际统计及预算）；DAG扩展RP05-T03独立批准后才激活 |
| T-RP-05 | INFECTED固定阻断、FAILED/SKIPPED/legacy metadata及elevated字节与审计 | RP14-T02 |
| T-RP-06 | JSON支持模块unique/FK清单、merge/replace、planned/actual计数与提交后失败状态 | RP16-T01 → T02；epoch T03另需T10 |
| T-RP-08 + T-RP-09，继而T-RP-13 | 编译后config CLI与运行有效值、候选构建顺序；部署锁、观察阈值/窗、first-safe回滚/手册 | RP18-T01 → T02 → T03；RP19最终候选release gates |

D-S01-03自定义角色绑定、D-S01-08下可选DAG均不能自动启动。决定需精确scope、具名负责人、日期、证据、兼容窗口及风险处理；“建议采用”不是APPROVED。S03-OI-06复用D-S01-04、S03-OI-07复用D-S01-06，不重复制造批准。S03-OI-05仅改变delete适配才成为对应门禁。

## 4. 外部材料分别解除什么阻碍

- RP15-T01：数据负责人批准的只读副本/脱敏统计及真实schema版本；本地合成库不能证明存量异常为零。
- RP00-T03/RP10-T01：API/前端负责人提供受支持已部署客户端及legacy截止窗口。
- RP17-T03：自有目标Linux及文件系统/工具版本，新增/修改/删除/metadata-only/失败两轮manifest；依赖RP17-T02完成。
- RP19-T01/T02：运维/数据库负责人给备份期间写入、外部共同快照或屏障证据；候选R12-N01仍PENDING直至裁定与配对恢复证据充分。
- RP18-T03/RP19-T03：自有目标候选配置、批准的非敏感当前§13回滚runbook、兼容矩阵和观察标准。发布仍需独立授权。

全54项细目及阶段门禁见task-readiness.json/csv；`additionalPrerequisites`明确静态交付未满足的支持端条件。

## 5. 下一轮执行prompt（默认只执行A1）

```text
你是RDPMS本地修复执行者。先完整读取
docs/remediation/2026-10-01-rdpms/EXECUTOR_PROMPT.md及其规定的v2必读文件，
再读取execution/reviews/2026-10-02-luna/REVIEW.md、findings.json、
task-readiness.json、NEXT_EXECUTION.md和RP02-T01原任务卡/验收/历史证据。

本轮只返工RP02-T01，关联LR-01、LR-02、LR-05及旧B14。
先核对HEAD/dirty worktree和已有授权，登记本轮scope，按真实逐任务证据
同步汇总授权/包状态，保留旧记录；不要因账本字段遗漏重复索要既有本地授权。
修复PENDING_ACTIVATION失败阈值锁定的回归、expired LOCKED成功响应与DB
不一致，并修同任务测试清理对append-only审计actor的冲突。
保留激活/禁用/手工锁语义，不实施refresh单次消费、账号等级、强制改密、
会话政策或其他子任务，不移除审计保护。

先用合法认证/成功夹具证明环境，再运行所有状态、并发和拒绝负例。
使用自有唯一临时PG、合成账号、临时dotenv，走DB guard，不读真实环境。
可使用当前已存在的前端TypeScript 5.9.3提供本地build PATH；不安装/升级依赖。
记录命令/退出码/原始去敏日志及真实行/审计；清理只限确认自有资源。
旧失败日志保留，新结果落对应任务新run目录；逐项更新本地验收及状态，
全包联合/目标/发布仍分别NOT_RUN或NOT_EVALUATED，不能由suite通过关闭整包。

不stage/commit/push/merge/deploy，不访问生产/shared DB或真实账号，
不调用子代理或代签决定。完成一个实质子任务后交付并停止。
按任务/整包状态→旧发现及LR裁定→实际变化→验证与限制→产物→下一任务汇报。
```
