# S03 协议问题与受控交错设计

本文件是未运行的验证设计，不是运行结果或产品验收。所有测试需使用审计者拥有的隔离 PostgreSQL、合成数据、确定性屏障和独立日志；禁止生产连接及随机 sleep。

## Q1：拉取 cursor 是否落在迟提交变更之后

**要回答的唯一问题：** 某次 `/sync/init` 返回 cursor 后才提交的行，如果其数据库 change timestamp 不晚于该 cursor，下一次 `timestamp > cursor` 是否会永久遗漏。

**静态不足：** 源码先读各实体，再取应用时钟作为 `serverTime`；它不能单独告诉审阅者 Prisma 更新时间生成时点、PostgreSQL事务可见时点和运行时隔离语义的组合结果。

**夹具与屏障：** 在临时 DB 建一条用户可见的合成任务。连接 W 开事务并更新行，捕获 updatedAt 后保持事务未提交；连接 R 执行 init 到响应返回并记录 cursor；W 再提交；R 用 cursor 发第二次 init。同步接口自身无需改代码，可在测试代理层或 SQL session 控制 W 屏障，记录完整请求/响应和数据库时间。

**信号与清理：** 比较 row.updatedAt、首响应 cursor、commit 顺序、第二响应 upserts/tombstones。若满足 `row.updatedAt <= cursor < commit visibility` 且第二响应无该行，记录复现；若无法构造，说明具体更新时间写入时点和隔离机制，不写“已证明不会发生”。删除合成项目/任务并记录清理成功。前置条件：临时 DB 明确归审计者所有。

## Q2：同 clientMutationId 并发竞争和回执最终状态

**要回答的唯一问题：** 两个并发 push 都在首次 receipt prefetch 读到空值时，最终业务行、两个响应和唯一 receipt 是否一致。

**夹具与屏障：** 建一个合成任务并记录 revision。两个 authenticated 合成 actor（以及同 actor 两请求）用相同 mutationId 并发 push，分别测试同 payload、不同 payload；服务端测试代理在两边完成 prefetch/读取现有任务后同时释放。再控制 CAS 写入与 SyncMutation upsert 前的时序，保留请求 trace id、SQL 和 receipt JSON。新建/删除路径可作为独立附加矩阵，不与旧任务 CAS 结果混称。

**断言：** 业务行不得出现两个互相冲突的成功写入；两个响应的 `applied/conflict/replayed` 应能解释实际行；最终回执不能将胜者 applied 改成与业务状态不符的冲突或反之。相同 key、不同 payload应有明确拒绝/冲突策略。重复至少多轮只作稳定性观察，不将无失败等同于并发安全证明。

## Q3：每项失败后的恢复合同

在业务命令完成前、业务提交后 receipt upsert 前、receipt upsert 后响应前分别注入可识别故障。观察 server DB、receipt、响应状态、客户端 outbox/dead-letter及相同 key 重试结果。批次定义为逐项部分成功：首项成功、第二项中断时，不要求整批回滚，但每项结果必须可恢复且不会静默丢失。保留原 mutationId 重试是否安全须连同 receipt 当前存在/不存在分别验证。

## Q4：在线/离线入口一致性验收矩阵

以相同主体、资源初始 revision 和 payload 分别走：任务普通字段编辑、任务状态 PATCH、任务删除、汇报草稿保存、汇报提交（如协议明确仅在线）。比较权限 guard、状态规则、CAS基线、业务 command、回执/审计事务、返回冲突、最终 row/version。对于系统要求不一致的入口，先记业务契约差异，不把“共享 helper”本身当作一致性证据。B16/B10等已存在问题须回归其原验收条件，避免重复计数。

## Q5：删除基线

用任务 revision R1 生成离线 delete；另一操作先推进为 R2；提交 delete(R1)。观察是否 tombstone、是否冲突，以及重复提交同/新 mutationId 的返回。只有产品批准 delete-wins 或 stale-delete conflict 合同后，才能给出验收判定；实验事实本身不能决定规则。

## 不运行条件

若无隔离 DB、屏障能力、合成身份或清理权，则保持 `PLANNED_NOT_RUN`，写明解除条件。禁止将旧历史探针冒充本轮实验，也禁止在真实浏览器/生产库上补证。
